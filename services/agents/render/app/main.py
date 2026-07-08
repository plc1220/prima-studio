from pathlib import Path
from uuid import UUID

from mpstudio.contracts import AssetKind, AgentTaskKind, AgentTaskPayload, EventPayload, JobStatus, StepName
from mpstudio.database import session_scope
from mpstudio.media import render_timeline_mp4
from mpstudio.repository import append_output_asset, create_asset, get_asset, record_event, set_job_status
from mpstudio.settings import get_settings
from mpstudio.storage import StorageClient
from mpstudio.transcoder import TranscoderRenderer, output_directory_for
from mpstudio.video_clipping import timeline_from_metadata, timeline_to_json
from mpstudio.worker import run_worker


def handle_render(payload: AgentTaskPayload) -> None:
    settings = get_settings()
    storage = StorageClient()
    scratch = Path(settings.scratch_root) / "render" / str(payload.job_id)
    scratch.mkdir(parents=True, exist_ok=True)

    filename = f"{payload.job_id}-video-clipping-final.mp4"
    output_uri = storage.build_uri(payload.workspace_id, payload.output_prefix, filename)
    metadata_text = _load_metadata_text(payload, storage)
    clips = timeline_from_metadata(metadata_text)
    if not clips:
        raise ValueError("No valid timeline clips were found in the metadata JSON.")

    renderer = TranscoderRenderer()
    used_transcoder = False
    transcode_metadata: dict[str, str] = {}

    if renderer.enabled and clips:
        try:
            submitted = renderer.create_concat_job(
                clips=clips,
                output_directory_uri=output_directory_for(output_uri),
                output_filename=filename,
                aspect_ratio=str(payload.aspect_ratio),
            )
            transcode_metadata = {
                "transcoder_job_name": submitted.job_name,
                "transcoder_state": submitted.state,
                "timeline": timeline_to_json(clips),
            }
            with session_scope() as session:
                event = EventPayload(
                    job_id=payload.job_id,
                    workspace_id=payload.workspace_id,
                    step=StepName.render_requested,
                    input_asset_ids=payload.input_asset_ids,
                    output_prefix=payload.output_prefix,
                    language=payload.language,
                    aspect_ratio=payload.aspect_ratio,
                    idempotency_key=f"{payload.job_id}:transcoder_render_submitted",
                    metadata=transcode_metadata,
                )
                record_event(session, event, "Transcoder video clipping render submitted")
            result = renderer.wait_for_job(submitted.job_name, submitted.output_uri)
            transcode_metadata["transcoder_state"] = result.state
            if result.state == "SUCCEEDED":
                used_transcoder = True
            elif result.state == "FAILED":
                transcode_metadata["transcoder_error"] = result.error
                if "audio track" in result.error.lower():
                    retry = renderer.create_concat_job(
                        clips=clips,
                        output_directory_uri=output_directory_for(output_uri),
                        output_filename=filename,
                        aspect_ratio=str(payload.aspect_ratio),
                        include_audio=False,
                    )
                    transcode_metadata["transcoder_retry_job_name"] = retry.job_name
                    retry_result = renderer.wait_for_job(retry.job_name, retry.output_uri)
                    transcode_metadata["transcoder_retry_state"] = retry_result.state
                    if retry_result.state == "SUCCEEDED":
                        used_transcoder = True
                        transcode_metadata["transcoder_state"] = retry_result.state
                        transcode_metadata.pop("transcoder_error", None)
                    elif retry_result.error:
                        transcode_metadata["transcoder_retry_error"] = retry_result.error
        except Exception as exc:
            transcode_metadata["transcoder_error"] = str(exc)

    if not used_transcoder:
        render_mode = str(payload.params.get("render_mode") or "joined")
        if render_mode == "individual":
            transcode_metadata["render_backend"] = "local_ffmpeg_individual"
            transcode_metadata["timeline"] = timeline_to_json(clips)
            with session_scope() as session:
                for index, clip in enumerate(clips, start=1):
                    clip_filename = f"{payload.job_id}-short-{index:02d}.mp4"
                    clip_uri = storage.build_uri(payload.workspace_id, payload.output_prefix, clip_filename)
                    local_file = scratch / clip_filename
                    render_timeline_mp4(
                        storage=storage,
                        clips=[clip],
                        output_path=local_file,
                        aspect_ratio=str(payload.aspect_ratio),
                    )
                    storage.copy_file(local_file, clip_uri, "video/mp4")
                    asset = create_asset(
                        session,
                        workspace_id=payload.workspace_id,
                        kind=AssetKind.final_video,
                        gcs_uri=clip_uri,
                        filename=clip_filename,
                        content_type="video/mp4",
                    )
                    append_output_asset(session, UUID(str(payload.job_id)), asset.id)
                event = EventPayload(
                    job_id=payload.job_id,
                    workspace_id=payload.workspace_id,
                    step=StepName.completed,
                    input_asset_ids=payload.input_asset_ids,
                    output_prefix=payload.output_prefix,
                    language=payload.language,
                    aspect_ratio=payload.aspect_ratio,
                    idempotency_key=f"{payload.job_id}:render_completed",
                    metadata={"short_count": str(len(clips)), **transcode_metadata},
                )
                record_event(session, event, "Selected short outputs rendered")
                set_job_status(session, UUID(str(payload.job_id)), JobStatus.succeeded)
            return
        else:
            local_file = scratch / filename
            render_timeline_mp4(
                storage=storage,
                clips=clips,
                output_path=local_file,
                aspect_ratio=str(payload.aspect_ratio),
            )
            storage.copy_file(local_file, output_uri, "video/mp4")
            transcode_metadata["render_backend"] = "local_ffmpeg_source"
            transcode_metadata["timeline"] = timeline_to_json(clips)
    else:
        transcode_metadata["render_backend"] = "gcp_transcoder"

    with session_scope() as session:
        asset = create_asset(
            session,
            workspace_id=payload.workspace_id,
            kind=AssetKind.final_video,
            gcs_uri=output_uri,
            filename=filename,
            content_type="video/mp4",
        )
        append_output_asset(session, UUID(str(payload.job_id)), asset.id)
        event = EventPayload(
            job_id=payload.job_id,
            workspace_id=payload.workspace_id,
            step=StepName.completed,
            input_asset_ids=payload.input_asset_ids,
            output_prefix=payload.output_prefix,
            language=payload.language,
            aspect_ratio=payload.aspect_ratio,
            idempotency_key=f"{payload.job_id}:render_completed",
            metadata={"asset_id": str(asset.id), "gcs_uri": output_uri, **transcode_metadata},
        )
        record_event(session, event, "Video clipping output rendered")
        set_job_status(session, UUID(str(payload.job_id)), JobStatus.succeeded)


def _load_metadata_text(payload: AgentTaskPayload, storage: StorageClient) -> str:
    with session_scope() as session:
        for asset_id in payload.input_asset_ids:
            asset = get_asset(session, asset_id)
            if asset is not None and asset.kind == AssetKind.metadata:
                try:
                    return storage.read_text(asset.gcs_uri)
                except Exception:
                    return "[]"
    return "[]"


if __name__ == "__main__":
    run_worker(AgentTaskKind.render, handle_render)
