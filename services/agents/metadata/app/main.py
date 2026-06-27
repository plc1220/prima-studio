import json
from uuid import UUID

from mpstudio.contracts import (
    AgentTaskKind,
    AgentTaskPayload,
    AssetKind,
    EventPayload,
    StepName,
)
from mpstudio.database import session_scope
from mpstudio.repository import append_output_asset, create_asset, enqueue_task, get_asset, record_event
from mpstudio.storage import StorageClient
from mpstudio.video_clipping import generate_clip_metadata
from mpstudio.worker import run_worker


def handle_metadata(payload: AgentTaskPayload) -> None:
    storage = StorageClient()

    with session_scope() as session:
        assets = [get_asset(session, asset_id) for asset_id in payload.input_asset_ids]
    valid_assets = [asset for asset in assets if asset is not None]
    candidates = generate_clip_metadata(
        assets=valid_assets,
        prompt=str(payload.params.get("prompt", "")),
        language=payload.language,
    )

    metadata_filename = f"{payload.job_id}-metadata.json"
    metadata_uri = storage.build_uri(payload.workspace_id, payload.output_prefix, metadata_filename)
    storage.write_text(metadata_uri, json.dumps(candidates, indent=2), "application/json")

    with session_scope() as session:
        metadata_asset = create_asset(
            session,
            workspace_id=payload.workspace_id,
            kind=AssetKind.metadata,
            gcs_uri=metadata_uri,
            filename=metadata_filename,
            content_type="application/json",
        )
        append_output_asset(session, UUID(str(payload.job_id)), metadata_asset.id)
        event = EventPayload(
            job_id=payload.job_id,
            workspace_id=payload.workspace_id,
            step=StepName.artifact_uploaded,
            input_asset_ids=payload.input_asset_ids,
            output_prefix=payload.output_prefix,
            language=payload.language,
            aspect_ratio=payload.aspect_ratio,
            idempotency_key=f"{payload.job_id}:metadata_uploaded",
            metadata={"asset_id": str(metadata_asset.id), "gcs_uri": metadata_uri},
        )
        record_event(session, event, "Gemini clip metadata generated")
        enqueue_task(
            session,
            kind=AgentTaskKind.render,
            payload=payload.model_copy(
                update={
                    "step": StepName.render_requested.value,
                    "input_asset_ids": [metadata_asset.id],
                    "idempotency_key": f"{payload.job_id}:render-agent",
                    "params": {**payload.params, "metadata_asset_id": str(metadata_asset.id)},
                }
            ),
        )
        render_event = EventPayload(
            job_id=payload.job_id,
            workspace_id=payload.workspace_id,
            step=StepName.render_requested,
            input_asset_ids=[metadata_asset.id],
            output_prefix=payload.output_prefix,
            language=payload.language,
            aspect_ratio=payload.aspect_ratio,
            idempotency_key=f"{payload.job_id}:render_requested",
        )
        record_event(session, render_event, "Queued clip render and join")


if __name__ == "__main__":
    run_worker(AgentTaskKind.metadata, handle_metadata)
