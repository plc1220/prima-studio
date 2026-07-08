import json
from pathlib import Path
from collections.abc import Iterable
from uuid import UUID

from fastapi import BackgroundTasks, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from mpstudio.contracts import (
    AgentTaskKind,
    AgentTaskPayload,
    AssetKind,
    DownloadUrlResponse,
    EventPayload,
    JobDetail,
    JobRecord,
    JobEvent,
    JobStatus,
    NewsroomPackage,
    NewsroomWorkflowRequest,
    ShortsWorkflowRequest,
    StepName,
    VideoClippingRenderSelectionRequest,
    VideoClippingWorkflowRequest,
    UploadUrlRequest,
    UploadUrlResponse,
    WorkflowKind,
    WorkflowResponse,
    WorkspaceRecord,
)
from mpstudio.database import init_db, session_scope
from mpstudio.repository import (
    append_output_asset,
    claim_task,
    complete_task,
    create_asset,
    create_job,
    enqueue_task,
    ensure_workspace,
    get_asset,
    get_job_detail,
    list_assets,
    list_jobs,
    list_workspaces,
    record_event,
    delete_asset,
    delete_job,
    delete_workspace,
    upsert_asset,
)
from mpstudio.media import create_demo_mp4
from mpstudio.settings import get_settings
from mpstudio.storage import StorageClient, parse_gcs_uri

app = FastAPI(
    title="Prima Studio API",
    version="0.1.0",
    description="Workflow API for video clipping and generating new social shorts.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/workspaces", response_model=list[WorkspaceRecord])
def get_workspaces(lane: WorkflowKind | None = None) -> list[WorkspaceRecord]:
    with session_scope() as session:
        rows = list_workspaces(session, lane=lane)
    return [WorkspaceRecord(id=row.id, name=row.name, lane=row.lane, created_at=row.created_at) for row in rows]


@app.post("/workspaces", response_model=WorkspaceRecord)
async def create_workspace(request: Request) -> WorkspaceRecord:
    body = await request.json()
    workspace_id = str(body.get("workspace_id", "")).strip()
    if not workspace_id:
        raise HTTPException(status_code=422, detail="workspace_id is required")
    lane_value = body.get("lane")
    try:
        lane = WorkflowKind(lane_value) if lane_value else None
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="lane must be video_clipping, shorts, or newsroom") from exc
    with session_scope() as session:
        row = ensure_workspace(session, workspace_id, lane=lane)
    return WorkspaceRecord(id=row.id, name=row.name, lane=row.lane, created_at=row.created_at)


@app.delete("/workspaces/{workspace_id}")
def remove_workspace(workspace_id: str) -> dict[str, int | str]:
    with session_scope() as session:
        removed = delete_workspace(session, workspace_id)
    if removed is None:
        raise HTTPException(status_code=404, detail="workspace not found")
    return {"status": "deleted", "workspace_id": workspace_id, **removed}


@app.get("/workspaces/{workspace_id}/assets")
def get_workspace_assets(workspace_id: str) -> list[dict]:
    with session_scope() as session:
        assets = list_assets(session, workspace_id)
    return [asset.model_dump(mode="json") for asset in assets]


@app.get("/workspaces/{workspace_id}/jobs", response_model=list[JobRecord])
def get_workspace_jobs(workspace_id: str, kind: WorkflowKind | None = None) -> list[JobRecord]:
    with session_scope() as session:
        return list_jobs(session, workspace_id=workspace_id, kind=kind)


@app.post("/assets/upload-url", response_model=UploadUrlResponse)
def create_upload_url(body: UploadUrlRequest) -> UploadUrlResponse:
    storage = StorageClient()
    gcs_uri = storage.build_uri(body.workspace_id, "uploads", body.filename)
    with session_scope() as session:
        asset = create_asset(
            session,
            workspace_id=body.workspace_id,
            kind=body.kind,
            gcs_uri=gcs_uri,
            filename=body.filename,
            content_type=body.content_type,
        )
    return UploadUrlResponse(
        asset_id=asset.id,
        upload_url=storage.signed_upload_url(gcs_uri, body.content_type),
        gcs_uri=gcs_uri,
    )


@app.get("/assets/{asset_id}/download-url", response_model=DownloadUrlResponse)
def get_download_url(asset_id: UUID) -> DownloadUrlResponse:
    storage = StorageClient()
    with session_scope() as session:
        asset = get_asset(session, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="asset not found")
    return DownloadUrlResponse(
        asset_id=asset.id,
        download_url=storage.asset_content_url(str(asset.id)),
        gcs_uri=asset.gcs_uri,
    )


@app.get("/assets/{asset_id}/content")
@app.head("/assets/{asset_id}/content")
def get_asset_content(asset_id: UUID, request: Request) -> Response:
    storage = StorageClient()
    with session_scope() as session:
        asset = get_asset(session, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="asset not found")

    _repair_legacy_placeholder_video(asset, storage)
    try:
        total_size = storage.size(asset.gcs_uri)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=f"asset content not found: {exc}") from exc

    media_type = asset.content_type or _content_type_for(asset.filename)
    headers = {
        "accept-ranges": "bytes",
        "content-disposition": f'inline; filename="{asset.filename}"',
    }
    if request.method == "HEAD":
        headers["content-length"] = str(total_size)
        return Response(status_code=200, media_type=media_type, headers=headers)

    range_header = request.headers.get("range")
    if range_header:
        start, end = _parse_range_header(range_header, total_size)
        if start >= total_size:
            return Response(status_code=416, headers={"content-range": f"bytes */{total_size}"})
        body = storage.read_bytes(asset.gcs_uri, start, end)
        headers.update(
            {
                "content-range": f"bytes {start}-{end}/{total_size}",
                "content-length": str(len(body)),
            }
        )
        return Response(body, status_code=206, media_type=media_type, headers=headers)

    body = storage.read_bytes(asset.gcs_uri)
    headers["content-length"] = str(len(body))
    return Response(body, media_type=media_type, headers=headers)


@app.delete("/assets/{asset_id}")
def remove_asset(asset_id: UUID, delete_object: bool = True) -> dict[str, str]:
    storage = StorageClient()
    with session_scope() as session:
        removed = delete_asset(session, asset_id)
    if removed is None:
        raise HTTPException(status_code=404, detail="asset not found")
    if delete_object:
        storage.delete_uri(removed.gcs_uri)
    return {"status": "deleted", "asset_id": str(asset_id)}


@app.delete("/jobs/{job_id}")
def remove_job(job_id: UUID, delete_outputs: bool = True) -> dict[str, str]:
    storage = StorageClient()
    with session_scope() as session:
        removed = delete_job(session, job_id)
    if removed is None:
        raise HTTPException(status_code=404, detail="job not found")
    if delete_outputs:
        for asset in removed.outputs:
            storage.delete_uri(asset.gcs_uri)
    return {"status": "deleted", "job_id": str(job_id)}


@app.post("/workflows/video-clipping", response_model=WorkflowResponse)
def start_video_clipping(body: VideoClippingWorkflowRequest, background_tasks: BackgroundTasks) -> WorkflowResponse:
    return _start_workflow(
        kind=WorkflowKind.video_clipping,
        workspace_id=body.workspace_id,
        language=body.language,
        aspect_ratio=str(body.aspect_ratio),
        output_prefix=body.output_prefix,
        input_asset_ids=body.source_asset_ids,
        params=body.model_dump(mode="json"),
        background_tasks=background_tasks,
    )


@app.post("/workflows/video-clipping/render-selection", response_model=WorkflowResponse)
def render_video_clipping_selection(body: VideoClippingRenderSelectionRequest) -> WorkflowResponse:
    storage = StorageClient()
    metadata_filename = "selected-highlights.json"
    input_asset_ids = [body.source_asset_id] if body.source_asset_id else []
    task_payload: AgentTaskPayload
    with session_scope() as session:
        job = create_job(
            session,
            workspace_id=body.workspace_id,
            kind=WorkflowKind.video_clipping,
            language=body.language,
            aspect_ratio=str(body.aspect_ratio),
            output_prefix=body.output_prefix,
            input_asset_ids=input_asset_ids,
            params=body.model_dump(mode="json"),
        )
        metadata_filename = f"{job.id}-selected-highlights.json"
        metadata_uri = storage.build_uri(body.workspace_id, body.output_prefix, metadata_filename)
        storage.write_text(metadata_uri, json.dumps(body.highlights, indent=2), "application/json")
        metadata_asset = create_asset(
            session,
            workspace_id=body.workspace_id,
            kind=AssetKind.metadata,
            gcs_uri=metadata_uri,
            filename=metadata_filename,
            content_type="application/json",
        )
        append_output_asset(session, job.id, metadata_asset.id)
        requested = EventPayload(
            job_id=job.id,
            workspace_id=body.workspace_id,
            step=StepName.workflow_requested,
            input_asset_ids=input_asset_ids,
            output_prefix=body.output_prefix,
            language=body.language,
            aspect_ratio=job.aspect_ratio,
            idempotency_key=f"{job.id}:selection_requested",
            metadata={"selected_highlights": len(body.highlights)},
        )
        record_event(session, requested, "Selected highlights render requested")
        uploaded = EventPayload(
            job_id=job.id,
            workspace_id=body.workspace_id,
            step=StepName.artifact_uploaded,
            input_asset_ids=input_asset_ids,
            output_prefix=body.output_prefix,
            language=body.language,
            aspect_ratio=job.aspect_ratio,
            idempotency_key=f"{job.id}:selection_metadata_uploaded",
            metadata={"asset_id": str(metadata_asset.id), "gcs_uri": metadata_uri},
        )
        record_event(session, uploaded, "Selected highlights metadata prepared")
        render_event = EventPayload(
            job_id=job.id,
            workspace_id=body.workspace_id,
            step=StepName.render_requested,
            input_asset_ids=[metadata_asset.id],
            output_prefix=body.output_prefix,
            language=body.language,
            aspect_ratio=job.aspect_ratio,
            idempotency_key=f"{job.id}:render_requested",
        )
        record_event(session, render_event, "Queued selected highlights render")
        task_payload = AgentTaskPayload(
            job_id=job.id,
            workspace_id=body.workspace_id,
            workflow_kind=WorkflowKind.video_clipping,
            step=StepName.render_requested.value,
            input_asset_ids=[metadata_asset.id],
            output_prefix=body.output_prefix,
            language=body.language,
            aspect_ratio=job.aspect_ratio,
            idempotency_key=f"{job.id}:render-agent",
            params={**body.model_dump(mode="json"), "metadata_asset_id": str(metadata_asset.id)},
        )
        enqueue_task(session, kind=AgentTaskKind.render, payload=task_payload)
    return WorkflowResponse(job_id=job.id, status=JobStatus.queued)


@app.post("/workflows/shorts", response_model=WorkflowResponse)
def start_shorts(body: ShortsWorkflowRequest, background_tasks: BackgroundTasks) -> WorkflowResponse:
    return _start_workflow(
        kind=WorkflowKind.shorts,
        workspace_id=body.workspace_id,
        language=body.language,
        aspect_ratio=str(body.aspect_ratio),
        output_prefix=body.output_prefix,
        input_asset_ids=[],
        params=body.model_dump(mode="json"),
        background_tasks=background_tasks,
    )


@app.post("/workflows/newsroom", response_model=WorkflowResponse)
def start_newsroom(body: NewsroomWorkflowRequest, background_tasks: BackgroundTasks) -> WorkflowResponse:
    return _start_workflow(
        kind=WorkflowKind.newsroom,
        workspace_id=body.workspace_id,
        language=body.language,
        aspect_ratio=str(body.aspect_ratio),
        output_prefix=body.output_prefix,
        input_asset_ids=[],
        params=body.model_dump(mode="json"),
        background_tasks=background_tasks,
    )


@app.get("/jobs/{job_id}", response_model=JobDetail)
def get_job(job_id: UUID) -> JobDetail:
    with session_scope() as session:
        detail = get_job_detail(session, job_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="job not found")
    return detail


@app.get("/jobs/{job_id}/events", response_model=list[JobEvent])
def get_job_events(job_id: UUID) -> list[JobEvent]:
    with session_scope() as session:
        detail = get_job_detail(session, job_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="job not found")
    return detail.events


@app.get("/jobs/{job_id}/newsroom-package", response_model=NewsroomPackage)
def get_newsroom_package(job_id: UUID) -> NewsroomPackage:
    storage = StorageClient()
    with session_scope() as session:
        detail = get_job_detail(session, job_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="job not found")
    if detail.kind != WorkflowKind.newsroom:
        raise HTTPException(status_code=404, detail="job is not a newsroom workflow")
    package_asset = next(
        (
            asset
            for asset in detail.outputs
            if asset.kind == AssetKind.metadata and asset.filename.endswith("-newsroom-package.json")
        ),
        None,
    )
    if package_asset is None:
        raise HTTPException(status_code=409, detail="newsroom package is not ready")
    try:
        return NewsroomPackage.model_validate(json.loads(storage.read_text(package_asset.gcs_uri)))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"unable to read newsroom package: {exc}") from exc


@app.get("/integrations/video-clipping-bucket/workspaces")
def list_video_clipping_bucket_workspaces(bucket: str | None = None) -> dict:
    settings = get_settings()
    bucket_name = bucket or settings.video_clipping_bucket_name
    storage = StorageClient()
    return {
        "bucket": bucket_name,
        "workspaces": storage.list_prefixes(bucket_name),
    }


@app.post("/integrations/video-clipping-bucket/sync")
async def sync_video_clipping_bucket(request: Request) -> dict:
    settings = get_settings()
    body = await request.json()
    bucket_name = str(body.get("bucket") or settings.video_clipping_bucket_name).strip()
    workspace_id = str(body.get("workspace_id") or "").strip()
    if not bucket_name:
        raise HTTPException(status_code=422, detail="bucket is required")
    if not workspace_id:
        raise HTTPException(status_code=422, detail="workspace_id is required")

    storage = StorageClient()
    uris = storage.list_uris(bucket_name, workspace_id)
    imported = 0
    updated = 0
    skipped = 0
    with session_scope() as session:
        ensure_workspace(session, workspace_id, lane=WorkflowKind.video_clipping)
        for uri in uris:
            kind = _kind_for_imported_uri(uri)
            if kind is None:
                skipped += 1
                continue
            _, blob_name = parse_gcs_uri(uri)
            filename = Path(blob_name).name
            _, created = upsert_asset(
                session,
                workspace_id=workspace_id,
                kind=kind,
                gcs_uri=uri,
                filename=filename,
                content_type=_content_type_for(filename),
            )
            if created:
                imported += 1
            else:
                updated += 1
    return {
        "bucket": bucket_name,
        "workspace_id": workspace_id,
        "imported": imported,
        "updated": updated,
        "skipped": skipped,
        "scanned": len(uris),
    }


@app.put("/local-upload")
async def local_upload(request: Request, target: str = Query(...)) -> dict[str, str]:
    storage = StorageClient()
    body = await request.body()
    storage.write_bytes(
        target,
        body,
        content_type=request.headers.get("content-type") or "application/octet-stream",
    )
    return {"status": "ok", "target": target}


@app.get("/local-download")
@app.head("/local-download")
def local_download(request: Request, target: str = Query(...)) -> Response:
    storage = StorageClient()
    filename = Path(parse_gcs_uri(target)[1]).name
    try:
        total_size = storage.size(target)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=f"local object not found: {exc}") from exc
    media_type = _content_type_for(filename)
    headers = {"accept-ranges": "bytes", "content-disposition": f'inline; filename="{filename}"'}
    if request.method == "HEAD":
        headers["content-length"] = str(total_size)
        return Response(status_code=200, media_type=media_type, headers=headers)
    range_header = request.headers.get("range")
    if range_header:
        start, end = _parse_range_header(range_header, total_size)
        body = storage.read_bytes(target, start, end)
        headers.update({"content-range": f"bytes {start}-{end}/{total_size}", "content-length": str(len(body))})
        return Response(body, status_code=206, media_type=media_type, headers=headers)
    body = storage.read_bytes(target)
    headers["content-length"] = str(len(body))
    return Response(body, media_type=media_type, headers=headers)


def _parse_range_header(range_header: str, total_size: int) -> tuple[int, int]:
    unit, _, value = range_header.partition("=")
    if unit.strip().lower() != "bytes" or "-" not in value:
        raise HTTPException(status_code=416, detail="unsupported range")
    start_text, _, end_text = value.partition("-")
    if start_text:
        start = int(start_text)
        end = int(end_text) if end_text else total_size - 1
    else:
        suffix_length = int(end_text or "0")
        start = max(total_size - suffix_length, 0)
        end = total_size - 1
    end = min(end, total_size - 1)
    if start < 0 or end < start:
        raise HTTPException(status_code=416, detail="invalid range")
    return start, end


def _content_type_for(filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix in {".mp4", ".m4v"}:
        return "video/mp4"
    if suffix == ".mov":
        return "video/quicktime"
    if suffix == ".webm":
        return "video/webm"
    if suffix == ".json":
        return "application/json"
    if suffix in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if suffix == ".png":
        return "image/png"
    return "application/octet-stream"


def _repair_legacy_placeholder_video(asset, storage: StorageClient) -> None:
    if str(asset.kind) not in {AssetKind.generated_short.value, AssetKind.final_video.value}:
        return
    if not (asset.content_type or "").startswith("video/") and not asset.filename.lower().endswith(".mp4"):
        return
    path = storage.local_path_for_uri(asset.gcs_uri)
    if not path.exists() or path.stat().st_size > 512:
        return
    try:
        head = path.read_bytes()
    except Exception:
        return
    if b"placeholder MP4 artifact" not in head and b"Install ffmpeg" not in head:
        return
    create_demo_mp4(
        path,
        title="Media Prima Generated Short"
        if str(asset.kind) == AssetKind.generated_short.value
        else "Media Prima Video Clipping",
        duration_seconds=6,
    )


def _kind_for_imported_uri(uri: str) -> AssetKind | None:
    _, blob_name = parse_gcs_uri(uri)
    parts = [part.lower() for part in Path(blob_name).parts]
    suffix = Path(blob_name).suffix.lower()
    if suffix == ".json" or "metadata" in parts:
        return AssetKind.metadata
    if suffix not in {".mp4", ".mov", ".m4v", ".webm"}:
        return None
    if "joined_clips" in parts or "joined-clips" in parts or "final" in parts or "finals" in parts:
        return AssetKind.final_video
    if "clips" in parts:
        return AssetKind.clip
    if "segments" in parts or "segment" in parts or "split" in parts:
        return AssetKind.segment
    return AssetKind.source_video


def _start_workflow(
    *,
    kind: WorkflowKind,
    workspace_id: str,
    language: str,
    aspect_ratio: str,
    output_prefix: str,
    input_asset_ids: Iterable[UUID],
    params: dict,
    background_tasks: BackgroundTasks | None = None,
) -> WorkflowResponse:
    task_payload: AgentTaskPayload | None = None
    with session_scope() as session:
        job = create_job(
            session,
            workspace_id=workspace_id,
            kind=kind,
            language=language,
            aspect_ratio=aspect_ratio,
            output_prefix=output_prefix,
            input_asset_ids=list(input_asset_ids),
            params=params,
        )
        event_payload = EventPayload(
            job_id=job.id,
            workspace_id=workspace_id,
            step=StepName.workflow_requested,
            input_asset_ids=job.input_asset_ids,
            output_prefix=output_prefix,
            language=language,
            aspect_ratio=job.aspect_ratio,
            idempotency_key=f"{job.id}:workflow_requested",
        )
        record_event(session, event_payload, f"{kind.value} workflow requested")
        task_payload = AgentTaskPayload(
            job_id=job.id,
            workspace_id=workspace_id,
            workflow_kind=kind,
            step=StepName.workflow_requested.value,
            input_asset_ids=job.input_asset_ids,
            output_prefix=output_prefix,
            language=language,
            aspect_ratio=job.aspect_ratio,
            idempotency_key=f"{job.id}:orchestrate:initial",
            params=params,
        )
        enqueue_task(session, kind=AgentTaskKind.orchestrate, payload=task_payload)
    if get_settings().light_inline_workflows and task_payload is not None:
        if background_tasks is not None:
            background_tasks.add_task(_run_inline_light_workflow, task_payload)
        else:
            _run_inline_light_workflow(task_payload)
    return WorkflowResponse(job_id=job.id, status=JobStatus.queued)


def _run_inline_light_workflow(payload: AgentTaskPayload) -> None:
    """Run the demo workflow in-process for a tiny Cloud Run deployment.

    This is intentionally a light-mode bridge. The normal architecture still
    uses orchestrator and agent services; Cloud Run first pass can run without
    separate worker services, Pub/Sub, or Cloud SQL.
    """
    from services.agents.metadata.app.main import handle_metadata
    from services.agents.newsroom.app.main import handle_newsroom
    from services.agents.render.app.main import handle_render
    from services.agents.shortgen.app.main import handle_shortgen
    from services.orchestrator.app.main import handle_orchestration

    handle_orchestration(payload)
    if payload.workflow_kind == WorkflowKind.newsroom:
        handle_newsroom(
            payload.model_copy(
                update={
                    "step": StepName.newsroom_requested.value,
                    "idempotency_key": f"{payload.job_id}:newsroom-agent:inline",
                }
            )
        )
        return

    if payload.workflow_kind == WorkflowKind.shorts:
        handle_shortgen(
            payload.model_copy(
                update={
                    "step": StepName.shortgen_requested.value,
                    "idempotency_key": f"{payload.job_id}:shortgen-agent:inline",
                }
            )
        )
        return

    handle_metadata(
        payload.model_copy(
            update={
                "step": StepName.metadata_requested.value,
                "idempotency_key": f"{payload.job_id}:metadata-agent:inline",
            }
        )
    )
    render_payload = payload.model_copy(
        update={
            "step": StepName.render_requested.value,
            "idempotency_key": f"{payload.job_id}:render-agent:inline",
        }
    )
    with session_scope() as session:
        render_task = claim_task(session, AgentTaskKind.render)
        if render_task is not None:
            render_payload = AgentTaskPayload.model_validate(render_task.payload)
            complete_task(session, render_task)
    handle_render(render_payload)
