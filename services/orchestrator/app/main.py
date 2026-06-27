from uuid import UUID

from mpstudio.contracts import (
    AgentTaskKind,
    AgentTaskPayload,
    EventPayload,
    JobStatus,
    StepName,
    WorkflowKind,
)
from mpstudio.database import session_scope
from mpstudio.repository import enqueue_task, record_event, set_job_status
from mpstudio.worker import run_worker


def handle_orchestration(payload: AgentTaskPayload) -> None:
    with session_scope() as session:
        set_job_status(session, UUID(str(payload.job_id)), JobStatus.running)

        if payload.workflow_kind == WorkflowKind.newsroom:
            event = EventPayload(
                job_id=payload.job_id,
                workspace_id=payload.workspace_id,
                step=StepName.newsroom_requested,
                input_asset_ids=[],
                output_prefix=payload.output_prefix,
                language=payload.language,
                aspect_ratio=payload.aspect_ratio,
                idempotency_key=f"{payload.job_id}:newsroom_requested",
            )
            record_event(session, event, "Queued newsroom research and narrative generation")
            enqueue_task(
                session,
                kind=AgentTaskKind.newsroom,
                payload=payload.model_copy(
                    update={
                        "step": StepName.newsroom_requested.value,
                        "idempotency_key": f"{payload.job_id}:newsroom-agent",
                    }
                ),
            )
            return

        if payload.workflow_kind == WorkflowKind.video_clipping:
            event = EventPayload(
                job_id=payload.job_id,
                workspace_id=payload.workspace_id,
                step=StepName.metadata_requested,
                input_asset_ids=payload.input_asset_ids,
                output_prefix=payload.output_prefix,
                language=payload.language,
                aspect_ratio=payload.aspect_ratio,
                idempotency_key=f"{payload.job_id}:metadata_requested",
            )
            record_event(session, event, "Queued Gemini metadata analysis")
            enqueue_task(
                session,
                kind=AgentTaskKind.metadata,
                payload=payload.model_copy(
                    update={
                        "step": StepName.metadata_requested.value,
                        "idempotency_key": f"{payload.job_id}:metadata-agent",
                    }
                ),
            )
            return

        if payload.workflow_kind == WorkflowKind.shorts:
            event = EventPayload(
                job_id=payload.job_id,
                workspace_id=payload.workspace_id,
                step=StepName.shortgen_requested,
                input_asset_ids=[],
                output_prefix=payload.output_prefix,
                language=payload.language,
                aspect_ratio=payload.aspect_ratio,
                idempotency_key=f"{payload.job_id}:shortgen_requested",
            )
            record_event(session, event, "Queued prompt-to-short generation")
            enqueue_task(
                session,
                kind=AgentTaskKind.shortgen,
                payload=payload.model_copy(
                    update={
                        "step": StepName.shortgen_requested.value,
                        "idempotency_key": f"{payload.job_id}:shortgen-agent",
                    }
                ),
            )
            return

        raise ValueError(f"unsupported workflow kind: {payload.workflow_kind}")


if __name__ == "__main__":
    run_worker(AgentTaskKind.orchestrate, handle_orchestration)
