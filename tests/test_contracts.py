from uuid import uuid4

from mpstudio.contracts import AspectRatio, EventPayload, StepName


def test_event_payload_contains_required_routing_fields() -> None:
    job_id = uuid4()
    asset_id = uuid4()

    payload = EventPayload(
        job_id=job_id,
        workspace_id="media-prima-demo",
        step=StepName.metadata_requested,
        input_asset_ids=[asset_id],
        output_prefix="outputs/video-clipping",
        language="ms-MY",
        aspect_ratio=AspectRatio.portrait,
        idempotency_key=f"{job_id}:metadata_requested",
    )

    encoded = payload.model_dump(mode="json")

    assert encoded["job_id"] == str(job_id)
    assert encoded["workspace_id"] == "media-prima-demo"
    assert encoded["step"] == "metadata_requested"
    assert encoded["input_asset_ids"] == [str(asset_id)]
    assert encoded["output_prefix"] == "outputs/video-clipping"
    assert encoded["language"] == "ms-MY"
    assert encoded["aspect_ratio"] == "9:16"
    assert encoded["idempotency_key"].endswith(":metadata_requested")
