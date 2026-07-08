import importlib
import json
from urllib.parse import urlsplit
from uuid import UUID, uuid4

from fastapi.testclient import TestClient


def _fresh_app(monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path}/mpstudio.db")
    monkeypatch.setenv("LOCAL_STORAGE_ROOT", str(tmp_path / "storage"))
    monkeypatch.setenv("PUBLIC_BASE_URL", "http://testserver")

    import mpstudio.settings

    mpstudio.settings.get_settings.cache_clear()

    import mpstudio.database

    importlib.reload(mpstudio.database)

    import services.api.app.main

    module = importlib.reload(services.api.app.main)
    return module.app


def test_create_upload_url_and_start_shorts_workflow(monkeypatch, tmp_path) -> None:
    app = _fresh_app(monkeypatch, tmp_path)
    with TestClient(app) as client:
        upload = client.post(
            "/assets/upload-url",
            json={
                "workspace_id": "media-prima-demo",
                "filename": "source.mp4",
                "content_type": "video/mp4",
                "kind": "source_video",
            },
        )
        assert upload.status_code == 200
        assert UUID(upload.json()["asset_id"])

        workflow = client.post(
            "/workflows/shorts",
            json={
                "workspace_id": "media-prima-demo",
                "prompt": "Generate a Malay promo short.",
                "language": "ms-MY",
                "aspect_ratio": "9:16",
            },
        )
        assert workflow.status_code == 200
        job_id = workflow.json()["job_id"]

        detail = client.get(f"/jobs/{job_id}")
        assert detail.status_code == 200
        assert detail.json()["status"] == "queued"
        assert detail.json()["events"][0]["step"] == "workflow_requested"


def test_workspaces_are_filtered_by_lane(monkeypatch, tmp_path) -> None:
    app = _fresh_app(monkeypatch, tmp_path)
    with TestClient(app) as client:
        newsroom = client.post(
            "/workspaces",
            json={"workspace_id": "daily-desk", "lane": "newsroom"},
        )
        shorts = client.post(
            "/workspaces",
            json={"workspace_id": "daily-social", "lane": "shorts"},
        )
        assert newsroom.status_code == 200
        assert shorts.status_code == 200
        assert newsroom.json()["lane"] == "newsroom"
        assert shorts.json()["lane"] == "shorts"

        newsroom_rows = client.get("/workspaces?lane=newsroom")
        shorts_rows = client.get("/workspaces?lane=shorts")
        assert newsroom_rows.status_code == 200
        assert shorts_rows.status_code == 200
        assert [row["id"] for row in newsroom_rows.json()] == ["daily-desk"]
        assert [row["id"] for row in shorts_rows.json()] == ["daily-social"]


def test_delete_workspace_removes_workspace_rows(monkeypatch, tmp_path) -> None:
    app = _fresh_app(monkeypatch, tmp_path)
    with TestClient(app) as client:
        workflow = client.post(
            "/workflows/shorts",
            json={
                "workspace_id": "daily-social",
                "prompt": "Generate a short for cleanup.",
                "language": "ms-MY",
                "aspect_ratio": "9:16",
            },
        )
        assert workflow.status_code == 200
        job_id = workflow.json()["job_id"]

        removed = client.delete("/workspaces/daily-social")
        assert removed.status_code == 200
        assert removed.json()["jobs"] == 1
        assert removed.json()["tasks"] == 1

        rows = client.get("/workspaces")
        assert rows.status_code == 200
        assert rows.json() == []

        detail = client.get(f"/jobs/{job_id}")
        assert detail.status_code == 404

        missing = client.delete("/workspaces/daily-social")
        assert missing.status_code == 404


def test_asset_content_supports_head_and_range(monkeypatch, tmp_path) -> None:
    app = _fresh_app(monkeypatch, tmp_path)
    with TestClient(app) as client:
        upload = client.post(
            "/assets/upload-url",
            json={
                "workspace_id": "media-prima-demo",
                "filename": "playable.mp4",
                "content_type": "video/mp4",
                "kind": "generated_short",
            },
        )
        assert upload.status_code == 200
        upload_url = urlsplit(upload.json()["upload_url"])
        stored = client.put(f"{upload_url.path}?{upload_url.query}", content=b"0123456789")
        assert stored.status_code == 200

        asset_id = upload.json()["asset_id"]
        head = client.head(f"/assets/{asset_id}/content")
        assert head.status_code == 200
        assert head.headers["accept-ranges"] == "bytes"
        assert head.headers["content-length"] == "10"

        ranged = client.get(f"/assets/{asset_id}/content", headers={"range": "bytes=2-5"})
        assert ranged.status_code == 206
        assert ranged.content == b"2345"
        assert ranged.headers["content-range"] == "bytes 2-5/10"


def test_start_video_clipping_workflow(monkeypatch, tmp_path) -> None:
    app = _fresh_app(monkeypatch, tmp_path)
    with TestClient(app) as client:
        upload = client.post(
            "/assets/upload-url",
            json={
                "workspace_id": "media-prima-demo",
                "filename": "source.mp4",
                "content_type": "video/mp4",
                "kind": "source_video",
            },
        )
        assert upload.status_code == 200
        asset_id = upload.json()["asset_id"]

        workflow = client.post(
            "/workflows/video-clipping",
            json={
                "workspace_id": "media-prima-demo",
                "source_asset_ids": [asset_id],
                "language": "ms-MY",
                "aspect_ratio": "9:16",
            },
        )
        assert workflow.status_code == 200
        job_id = workflow.json()["job_id"]

        detail = client.get(f"/jobs/{job_id}")
        assert detail.status_code == 200
        payload = detail.json()
        assert payload["kind"] == "video_clipping"
        assert payload["output_prefix"] == "outputs/video-clipping"


def test_delete_job_removes_output_assets_and_files(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("LIGHT_INLINE_WORKFLOWS", "true")
    app = _fresh_app(monkeypatch, tmp_path)
    with TestClient(app) as client:
        response = client.post(
            "/workflows/shorts",
            json={
                "workspace_id": "media-prima-demo",
                "prompt": "Generate a delete test short.",
                "language": "ms-MY",
                "aspect_ratio": "9:16",
            },
        )
        assert response.status_code == 200
        job_id = response.json()["job_id"]
        detail = client.get(f"/jobs/{job_id}")
        assert detail.status_code == 200
        outputs = detail.json()["outputs"]
        assert outputs
        content_url = urlsplit(client.get(f"/assets/{outputs[-1]['id']}/download-url").json()["download_url"])
        assert client.head(content_url.path).status_code == 200

        removed = client.delete(f"/jobs/{job_id}")
        assert removed.status_code == 200
        assert client.get(f"/jobs/{job_id}").status_code == 404
        assert client.get(f"/assets/{outputs[-1]['id']}/content").status_code == 404


def test_sync_video_clipping_bucket_imports_workspace_assets(monkeypatch, tmp_path) -> None:
    app = _fresh_app(monkeypatch, tmp_path)
    bucket_root = tmp_path / "storage" / "mp-ai-video-clipping-bucket" / "workspace-a"
    (bucket_root / "clips").mkdir(parents=True)
    (bucket_root / "joined_clips").mkdir(parents=True)
    (bucket_root / "metadata").mkdir(parents=True)
    (bucket_root / "clips" / "clip-001.mp4").write_bytes(b"clip")
    (bucket_root / "joined_clips" / "final.mp4").write_bytes(b"final")
    (bucket_root / "metadata" / "metadata.json").write_text("{}", encoding="utf-8")

    with TestClient(app) as client:
        workspaces = client.get("/integrations/video-clipping-bucket/workspaces")
        assert workspaces.status_code == 200
        assert "workspace-a" in workspaces.json()["workspaces"]

        synced = client.post(
            "/integrations/video-clipping-bucket/sync",
            json={"bucket": "mp-ai-video-clipping-bucket", "workspace_id": "workspace-a"},
        )
        assert synced.status_code == 200
        assert synced.json()["imported"] == 3

        assets = client.get("/workspaces/workspace-a/assets")
        assert assets.status_code == 200
        kinds = {asset["kind"] for asset in assets.json()}
        assert {"clip", "final_video", "metadata"} <= kinds


def test_newsroom_flow_generates_ranked_package(monkeypatch, tmp_path) -> None:
    app = _fresh_app(monkeypatch, tmp_path)
    with TestClient(app) as client:
        response = client.post(
            "/workflows/newsroom",
            json={
                "workspace_id": "media-prima-demo",
                "brief": "Young Malaysians are discussing AI jobs, cost of living, and practical upskilling.",
                "audience": "Urban Malaysian youth",
                "platform": "TikTok, Reels, Shorts",
                "language": "en-MY",
                "aspect_ratio": "9:16",
                "slate_size": 4,
            },
        )
        assert response.status_code == 200
        job_id = response.json()["job_id"]

    from mpstudio.contracts import AgentTaskKind, AgentTaskPayload
    from mpstudio.database import session_scope
    from mpstudio.repository import claim_task, complete_task
    from services.agents.newsroom.app.main import handle_newsroom
    from services.orchestrator.app.main import handle_orchestration

    with session_scope() as session:
        task = claim_task(session, AgentTaskKind.orchestrate)
        assert task is not None
        payload = AgentTaskPayload.model_validate(task.payload)
        complete_task(session, task)
    handle_orchestration(payload)

    with session_scope() as session:
        task = claim_task(session, AgentTaskKind.newsroom)
        assert task is not None
        payload = AgentTaskPayload.model_validate(task.payload)
        complete_task(session, task)
    handle_newsroom(payload)

    with TestClient(app) as client:
        package = client.get(f"/jobs/{job_id}/newsroom-package")
        assert package.status_code == 200
        payload = package.json()
        assert len(payload["topic_cards"]) == 4
        assert payload["topic_cards"][0]["rank_score"] >= payload["topic_cards"][-1]["rank_score"]
        assert payload["narrative_package"]["handoff"]["source_newsroom_job_id"] == job_id
        assert payload["narrative_package"]["script"]

        detail = client.get(f"/jobs/{job_id}")
        assert detail.status_code == 200
        assert detail.json()["status"] == "succeeded"
        assert any(output["filename"].endswith("-newsroom-package.json") for output in detail.json()["outputs"])


def test_local_shorts_flow_completes(monkeypatch, tmp_path) -> None:
    app = _fresh_app(monkeypatch, tmp_path)
    with TestClient(app) as client:
        response = client.post(
            "/workflows/shorts",
            json={
                "workspace_id": "media-prima-demo",
                "prompt": "Buat video pendek tentang Media Prima.",
                "language": "ms-MY",
                "aspect_ratio": "9:16",
            },
        )
        assert response.status_code == 200
        job_id = response.json()["job_id"]

    from mpstudio.contracts import AgentTaskKind, AgentTaskPayload
    from mpstudio.database import session_scope
    from mpstudio.repository import claim_task, complete_task
    from services.agents.shortgen.app.main import handle_shortgen
    from services.orchestrator.app.main import handle_orchestration

    with session_scope() as session:
        task = claim_task(session, AgentTaskKind.orchestrate)
        assert task is not None
        payload = AgentTaskPayload.model_validate(task.payload)
        complete_task(session, task)
    handle_orchestration(payload)

    with session_scope() as session:
        task = claim_task(session, AgentTaskKind.shortgen)
        assert task is not None
        payload = AgentTaskPayload.model_validate(task.payload)
        complete_task(session, task)
    handle_shortgen(payload)
    handle_shortgen(payload)

    with TestClient(app) as client:
        detail = client.get(f"/jobs/{job_id}")
        assert detail.status_code == 200
        payload = detail.json()
        assert payload["status"] == "succeeded"
        generated_outputs = [output for output in payload["outputs"] if output["kind"] == "generated_short"]
        assert len(generated_outputs) == 1


def test_shorts_flow_records_moneyprinter_settings(monkeypatch, tmp_path) -> None:
    app = _fresh_app(monkeypatch, tmp_path)
    with TestClient(app) as client:
        response = client.post(
            "/workflows/shorts",
            json={
                "workspace_id": "media-prima-demo",
                "prompt": "Generate a configurable short.",
                "script": "Narration with subtitle settings.",
                "search_terms": ["studio presenter", "Malaysia digital"],
                "language": "en-MY",
                "aspect_ratio": "9:16",
                "video_source": "veo3_fast",
                "generated_video_count": 2,
                "max_clip_duration_seconds": 4,
                "enable_subtitles": True,
                "subtitle_position": "top",
                "subtitle_font_color": "#ffeeaa",
                "subtitle_font_size": 54,
                "enable_dubbing": True,
                "tts_server": "gcp",
                "speech_volume": 0.8,
                "speech_rate": 1.1,
            },
        )
        assert response.status_code == 200
        job_id = response.json()["job_id"]

    from mpstudio.contracts import AgentTaskKind, AgentTaskPayload
    from mpstudio.database import session_scope
    from mpstudio.repository import claim_task, complete_task
    from mpstudio.storage import StorageClient
    from services.agents.shortgen.app.main import handle_shortgen
    from services.orchestrator.app.main import handle_orchestration

    with session_scope() as session:
        task = claim_task(session, AgentTaskKind.orchestrate)
        assert task is not None
        payload = AgentTaskPayload.model_validate(task.payload)
        complete_task(session, task)
    handle_orchestration(payload)

    with session_scope() as session:
        task = claim_task(session, AgentTaskKind.shortgen)
        assert task is not None
        payload = AgentTaskPayload.model_validate(task.payload)
        complete_task(session, task)
    handle_shortgen(payload)

    with TestClient(app) as client:
        detail = client.get(f"/jobs/{job_id}")
        assert detail.status_code == 200
        script_asset = next(output for output in detail.json()["outputs"] if output["filename"].endswith("-short-script.json"))
        script_payload = json.loads(StorageClient().read_text(script_asset["gcs_uri"]))
        assert script_payload["video_source"] == "veo3_fast"
        assert script_payload["generated_video_count"] == 2
        assert script_payload["subtitle_settings"]["enabled"] is True
        assert script_payload["subtitle_settings"]["position"] == "top"
        assert script_payload["subtitle_settings"]["font_color"] == "#ffeeaa"
        assert script_payload["dubbing_settings"]["enabled"] is True
        assert script_payload["dubbing_settings"]["tts_server"] == "gcp"
        assert script_payload["dubbing_settings"]["speech_rate"] == 1.1


def test_shorts_flow_preserves_newsroom_handoff_script(monkeypatch, tmp_path) -> None:
    app = _fresh_app(monkeypatch, tmp_path)
    approved_script = "Approved newsroom narration. Keep this exact editorial line."
    approved_terms = ["Malaysia newsroom", "AI jobs Malaysia"]
    source_newsroom_job_id = uuid4()
    with TestClient(app) as client:
        response = client.post(
            "/workflows/shorts",
            json={
                "workspace_id": "media-prima-demo",
                "prompt": "Render the approved newsroom package.",
                "script": approved_script,
                "search_terms": approved_terms,
                "source_newsroom_job_id": str(source_newsroom_job_id),
                "source_topic_id": "topic-1",
                "source_angle_id": "topic-1-explainer",
                "source_package_uri": "gs://local-bucket/media-prima-demo/outputs/newsroom/package.json",
                "language": "en-MY",
                "aspect_ratio": "9:16",
            },
        )
        assert response.status_code == 200
        job_id = response.json()["job_id"]

    from mpstudio.contracts import AgentTaskKind, AgentTaskPayload
    from mpstudio.database import session_scope
    from mpstudio.repository import claim_task, complete_task
    from mpstudio.storage import StorageClient
    from services.agents.shortgen.app.main import handle_shortgen
    from services.orchestrator.app.main import handle_orchestration

    with session_scope() as session:
        task = claim_task(session, AgentTaskKind.orchestrate)
        assert task is not None
        payload = AgentTaskPayload.model_validate(task.payload)
        complete_task(session, task)
    handle_orchestration(payload)

    with session_scope() as session:
        task = claim_task(session, AgentTaskKind.shortgen)
        assert task is not None
        payload = AgentTaskPayload.model_validate(task.payload)
        complete_task(session, task)
    handle_shortgen(payload)

    with TestClient(app) as client:
        detail = client.get(f"/jobs/{job_id}")
        assert detail.status_code == 200
        script_asset = next(output for output in detail.json()["outputs"] if output["filename"].endswith("-short-script.json"))
        script_payload = json.loads(StorageClient().read_text(script_asset["gcs_uri"]))
        assert script_payload["source"] == "Newsroom Generator handoff"
        assert script_payload["script"] == approved_script
        assert script_payload["search_terms"] == approved_terms
        assert script_payload["source_newsroom_job_id"] == str(source_newsroom_job_id)


def test_inline_video_clipping_uses_metadata_render_task(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("LIGHT_INLINE_WORKFLOWS", "true")
    app = _fresh_app(monkeypatch, tmp_path)
    from mpstudio.media import create_demo_mp4
    import mpstudio.video_clipping

    monkeypatch.setattr(
        mpstudio.video_clipping,
        "_generate_gemini_metadata",
        lambda gcs_uri, filename, prompt, language: [
            {
                "source_uri": gcs_uri,
                "source_filename": filename,
                "timestamp_start_end": "00:00:01 - 00:00:03",
                "brief_scene_description": "Usable source excerpt",
                "editor_note_clip_rationale": "Test candidate",
                "dominant_emotional_tone_impact": "informative",
                "trailer_potential_category": "Hook",
            }
        ],
    )

    source_path = tmp_path / "source.mp4"
    create_demo_mp4(source_path, title="Source footage", duration_seconds=4)

    with TestClient(app) as client:
        upload = client.post(
            "/assets/upload-url",
            json={
                "workspace_id": "media-prima-demo",
                "filename": "source.mp4",
                "content_type": "video/mp4",
                "kind": "source_video",
            },
        )
        assert upload.status_code == 200
        upload_url = urlsplit(upload.json()["upload_url"])
        stored = client.put(f"{upload_url.path}?{upload_url.query}", content=source_path.read_bytes())
        assert stored.status_code == 200

        response = client.post(
            "/workflows/video-clipping",
            json={
                "workspace_id": "media-prima-demo",
                "source_asset_ids": [upload.json()["asset_id"]],
                "language": "ms-MY",
                "aspect_ratio": "9:16",
            },
        )
        assert response.status_code == 200
        detail = client.get(f"/jobs/{response.json()['job_id']}")
        assert detail.status_code == 200
        payload = detail.json()
        assert payload["status"] == "succeeded"
        assert any(event["message"] == "Gemini clip metadata generated" for event in payload["events"])
        completed = next(event for event in payload["events"] if event["step"] == "completed")
        assert completed["payload"]["metadata"]["render_backend"] == "local_ffmpeg_source"
        assert any(output["kind"] == "final_video" for output in payload["outputs"])
