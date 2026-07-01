from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .contracts import (
    AgentTaskKind,
    AgentTaskPayload,
    AssetKind,
    AssetRecord,
    EventPayload,
    JobDetail,
    JobEvent,
    JobRecord,
    JobStatus,
    WorkflowKind,
)
from .models import AgentTask, Asset, Job, JobEventRow, Workspace


def _dt(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def ensure_workspace(session: Session, workspace_id: str, lane: WorkflowKind | None = None) -> Workspace:
    workspace = session.get(Workspace, workspace_id)
    if workspace is None:
        workspace = Workspace(id=workspace_id, name=workspace_id, lane=lane.value if lane else None)
        session.add(workspace)
        session.flush()
    elif lane is not None and workspace.lane is None:
        workspace.lane = lane.value
        session.flush()
    return workspace


def list_workspaces(session: Session, lane: WorkflowKind | None = None) -> list[Workspace]:
    statement = select(Workspace).order_by(Workspace.created_at.desc())
    if lane is not None:
        statement = statement.where(Workspace.lane == lane.value)
    rows = session.scalars(statement)
    return list(rows)


def delete_workspace(session: Session, workspace_id: str) -> dict[str, int] | None:
    workspace = session.get(Workspace, workspace_id)
    if workspace is None:
        return None

    jobs = list(session.scalars(select(Job).where(Job.workspace_id == workspace_id)))
    job_ids = [job.id for job in jobs]
    tasks = [
        task
        for task in session.scalars(select(AgentTask))
        if (task.payload or {}).get("workspace_id") == workspace_id
        or (job_ids and str((task.payload or {}).get("job_id")) in job_ids)
    ]
    for task in tasks:
        session.delete(task)

    if job_ids:
        session.execute(delete(JobEventRow).where(JobEventRow.job_id.in_(job_ids)))
        session.execute(delete(Job).where(Job.id.in_(job_ids)))

    assets = list(session.scalars(select(Asset).where(Asset.workspace_id == workspace_id)))
    asset_count = len(assets)
    if assets:
        session.execute(delete(Asset).where(Asset.workspace_id == workspace_id))

    session.delete(workspace)
    session.flush()
    return {"jobs": len(jobs), "assets": asset_count, "tasks": len(tasks)}


def create_asset(
    session: Session,
    *,
    workspace_id: str,
    kind: AssetKind,
    gcs_uri: str,
    filename: str,
    content_type: str = "application/octet-stream",
) -> AssetRecord:
    ensure_workspace(session, workspace_id)
    row = Asset(
        workspace_id=workspace_id,
        kind=kind.value,
        gcs_uri=gcs_uri,
        filename=filename,
        content_type=content_type,
    )
    session.add(row)
    session.flush()
    return asset_to_contract(row)


def upsert_asset(
    session: Session,
    *,
    workspace_id: str,
    kind: AssetKind,
    gcs_uri: str,
    filename: str,
    content_type: str = "application/octet-stream",
) -> tuple[AssetRecord, bool]:
    ensure_workspace(session, workspace_id)
    row = session.scalar(select(Asset).where(Asset.gcs_uri == gcs_uri))
    if row is not None:
        row.workspace_id = workspace_id
        row.kind = kind.value
        row.filename = filename
        row.content_type = content_type
        session.flush()
        return asset_to_contract(row), False
    return create_asset(
        session,
        workspace_id=workspace_id,
        kind=kind,
        gcs_uri=gcs_uri,
        filename=filename,
        content_type=content_type,
    ), True


def create_job(
    session: Session,
    *,
    workspace_id: str,
    kind: WorkflowKind,
    language: str,
    aspect_ratio: str,
    output_prefix: str,
    input_asset_ids: list[UUID],
    params: dict,
) -> JobRecord:
    ensure_workspace(session, workspace_id, kind)
    row = Job(
        workspace_id=workspace_id,
        kind=kind.value,
        status=JobStatus.queued.value,
        language=language,
        aspect_ratio=aspect_ratio,
        output_prefix=output_prefix,
        input_asset_ids=[str(asset_id) for asset_id in input_asset_ids],
        params=params,
    )
    session.add(row)
    session.flush()
    return job_to_contract(row)


def append_output_asset(session: Session, job_id: UUID, asset_id: UUID) -> None:
    row = session.get(Job, str(job_id))
    if row is None:
        raise ValueError(f"job not found: {job_id}")
    output_ids = list(row.output_asset_ids or [])
    if str(asset_id) not in output_ids:
        output_ids.append(str(asset_id))
        row.output_asset_ids = output_ids
    row.updated_at = datetime.now(timezone.utc)


def set_job_status(session: Session, job_id: UUID, status: JobStatus, error: str | None = None) -> None:
    row = session.get(Job, str(job_id))
    if row is None:
        raise ValueError(f"job not found: {job_id}")
    row.status = status.value
    row.error = error
    row.updated_at = datetime.now(timezone.utc)


def get_job_detail(session: Session, job_id: UUID) -> JobDetail | None:
    row = session.get(Job, str(job_id))
    if row is None:
        return None
    events = [
        event_to_contract(event)
        for event in session.scalars(
            select(JobEventRow).where(JobEventRow.job_id == str(job_id)).order_by(JobEventRow.created_at)
        )
    ]
    outputs = []
    for asset_id in row.output_asset_ids or []:
        asset = session.get(Asset, asset_id)
        if asset is not None:
            outputs.append(asset_to_contract(asset))
    return JobDetail(**job_to_contract(row).model_dump(), events=events, outputs=outputs)


def list_jobs(session: Session, workspace_id: str | None = None, kind: WorkflowKind | None = None) -> list[JobRecord]:
    statement = select(Job).order_by(Job.created_at.desc())
    if workspace_id:
        statement = statement.where(Job.workspace_id == workspace_id)
    if kind:
        statement = statement.where(Job.kind == kind.value)
    rows = session.scalars(statement)
    return [job_to_contract(row) for row in rows]


def get_asset(session: Session, asset_id: UUID) -> AssetRecord | None:
    row = session.get(Asset, str(asset_id))
    return asset_to_contract(row) if row is not None else None


def get_asset_by_uri(session: Session, gcs_uri: str) -> AssetRecord | None:
    row = session.scalar(select(Asset).where(Asset.gcs_uri == gcs_uri))
    return asset_to_contract(row) if row is not None else None


def list_assets(session: Session, workspace_id: str) -> list[AssetRecord]:
    rows = session.scalars(select(Asset).where(Asset.workspace_id == workspace_id).order_by(Asset.created_at))
    return [asset_to_contract(row) for row in rows]


def delete_asset(session: Session, asset_id: UUID) -> AssetRecord | None:
    row = session.get(Asset, str(asset_id))
    if row is None:
        return None
    record = asset_to_contract(row)
    for job in session.scalars(select(Job)):
        output_ids = list(job.output_asset_ids or [])
        input_ids = list(job.input_asset_ids or [])
        changed = False
        if str(asset_id) in output_ids:
            job.output_asset_ids = [value for value in output_ids if value != str(asset_id)]
            changed = True
        if str(asset_id) in input_ids:
            job.input_asset_ids = [value for value in input_ids if value != str(asset_id)]
            changed = True
        if changed:
            job.updated_at = datetime.now(timezone.utc)
    session.delete(row)
    session.flush()
    return record


def delete_job(session: Session, job_id: UUID) -> JobDetail | None:
    detail = get_job_detail(session, job_id)
    row = session.get(Job, str(job_id))
    if row is None or detail is None:
        return None
    output_ids = set(row.output_asset_ids or [])
    if output_ids:
        for asset in session.scalars(select(Asset).where(Asset.id.in_(output_ids))):
            session.delete(asset)
    session.execute(delete(JobEventRow).where(JobEventRow.job_id == str(job_id)))
    session.delete(row)
    session.flush()
    return detail


def record_event(session: Session, payload: EventPayload, message: str) -> JobEvent:
    existing = session.scalar(
        select(JobEventRow).where(JobEventRow.idempotency_key == payload.idempotency_key)
    )
    if existing is not None:
        return event_to_contract(existing)
    row = JobEventRow(
        job_id=str(payload.job_id),
        step=str(payload.step),
        message=message,
        idempotency_key=payload.idempotency_key,
        payload=payload.model_dump(mode="json"),
    )
    session.add(row)
    session.flush()
    return event_to_contract(row)


def enqueue_task(
    session: Session,
    *,
    kind: AgentTaskKind,
    payload: AgentTaskPayload,
) -> None:
    existing = session.scalar(
        select(AgentTask).where(AgentTask.idempotency_key == payload.idempotency_key)
    )
    if existing is not None:
        return
    row = AgentTask(
        kind=kind.value,
        status=JobStatus.queued.value,
        idempotency_key=payload.idempotency_key,
        payload=payload.model_dump(mode="json"),
    )
    session.add(row)


def claim_task(session: Session, kind: AgentTaskKind) -> AgentTask | None:
    row = session.scalar(
        select(AgentTask)
        .where(AgentTask.kind == kind.value, AgentTask.status == JobStatus.queued.value)
        .order_by(AgentTask.created_at)
        .limit(1)
    )
    if row is None:
        return None
    row.status = JobStatus.running.value
    row.attempts += 1
    row.updated_at = datetime.now(timezone.utc)
    session.flush()
    return row


def complete_task(session: Session, task: AgentTask) -> None:
    task.status = JobStatus.succeeded.value
    task.error = None
    task.updated_at = datetime.now(timezone.utc)


def fail_task(session: Session, task: AgentTask, error: str) -> None:
    task.status = JobStatus.failed.value
    task.error = error
    task.updated_at = datetime.now(timezone.utc)


def asset_to_contract(row: Asset) -> AssetRecord:
    return AssetRecord(
        id=UUID(row.id),
        workspace_id=row.workspace_id,
        kind=AssetKind(row.kind),
        gcs_uri=row.gcs_uri,
        filename=row.filename,
        content_type=row.content_type,
        created_at=_dt(row.created_at),
    )


def job_to_contract(row: Job) -> JobRecord:
    return JobRecord(
        id=UUID(row.id),
        workspace_id=row.workspace_id,
        kind=WorkflowKind(row.kind),
        status=JobStatus(row.status),
        language=row.language,
        aspect_ratio=row.aspect_ratio,
        output_prefix=row.output_prefix,
        input_asset_ids=[UUID(asset_id) for asset_id in row.input_asset_ids or []],
        output_asset_ids=[UUID(asset_id) for asset_id in row.output_asset_ids or []],
        error=row.error,
        created_at=_dt(row.created_at),
        updated_at=_dt(row.updated_at),
    )


def event_to_contract(row: JobEventRow) -> JobEvent:
    return JobEvent(
        id=UUID(row.id),
        job_id=UUID(row.job_id),
        step=row.step,
        message=row.message,
        payload=EventPayload.model_validate(row.payload),
        created_at=_dt(row.created_at),
    )
