import json
from uuid import UUID

from mpstudio.contracts import AgentTaskKind, AgentTaskPayload, AssetKind, EventPayload, JobStatus, StepName
from mpstudio.database import session_scope
from mpstudio.newsroom import build_newsroom_package
from mpstudio.repository import append_output_asset, create_asset, record_event, set_job_status
from mpstudio.storage import StorageClient
from mpstudio.worker import run_worker


def handle_newsroom(payload: AgentTaskPayload) -> None:
    storage = StorageClient()
    package_filename = f"{payload.job_id}-newsroom-package.json"
    package_uri = storage.build_uri(payload.workspace_id, payload.output_prefix, package_filename)
    package = build_newsroom_package(
        job_id=UUID(str(payload.job_id)),
        workspace_id=payload.workspace_id,
        brief=str(payload.params.get("brief", "")),
        audience=str(payload.params.get("audience", "Malaysia digital news audience")),
        platform=str(payload.params.get("platform", "TikTok, Reels, Shorts")),
        urgency=str(payload.params.get("urgency", "today")),
        tone=str(payload.params.get("tone", "clear, social-first, credible")),
        brand_fit=str(payload.params.get("brand_fit", "Media Prima newsroom standards")),
        slate_mode=str(payload.params.get("slate_mode", "daily")),
        slate_size=int(payload.params.get("slate_size", 5)),
        language=payload.language,
        aspect_ratio=payload.aspect_ratio,
        duration_seconds=int(payload.params.get("duration_seconds", 45)),
        source_package_uri=package_uri,
    )
    storage.write_text(
        package_uri,
        json.dumps(package.model_dump(mode="json"), indent=2),
        "application/json",
    )

    with session_scope() as session:
        package_asset = create_asset(
            session,
            workspace_id=payload.workspace_id,
            kind=AssetKind.metadata,
            gcs_uri=package_uri,
            filename=package_filename,
            content_type="application/json",
        )
        append_output_asset(session, UUID(str(payload.job_id)), package_asset.id)
        event = EventPayload(
            job_id=payload.job_id,
            workspace_id=payload.workspace_id,
            step=StepName.newsroom_generated,
            input_asset_ids=[],
            output_prefix=payload.output_prefix,
            language=payload.language,
            aspect_ratio=payload.aspect_ratio,
            idempotency_key=f"{payload.job_id}:newsroom_generated",
            metadata={
                "asset_id": str(package_asset.id),
                "gcs_uri": package_uri,
                "topic_count": str(len(package.topic_cards)),
                "narrative_count": str(len(package.narrative_packages)),
            },
        )
        record_event(session, event, "Newsroom topic slate and narrative package generated")
        set_job_status(session, UUID(str(payload.job_id)), JobStatus.succeeded)


if __name__ == "__main__":
    run_worker(AgentTaskKind.newsroom, handle_newsroom)
