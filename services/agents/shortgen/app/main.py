import json
import logging
from pathlib import Path
from uuid import UUID

from mpstudio.audio import synthesize_voiceover_audio
from mpstudio.contracts import AssetKind, AgentTaskKind, AgentTaskPayload, EventPayload, JobStatus, StepName
from mpstudio.database import session_scope
from mpstudio.media import create_demo_mp4, render_timeline_mp4
from mpstudio.repository import append_output_asset, record_event, set_job_status, upsert_asset
from mpstudio.settings import get_settings
from mpstudio.shorts_planner import build_shorts_plan
from mpstudio.storage import StorageClient
from mpstudio.transcoder import TranscoderRenderer, output_directory_for
from mpstudio.worker import run_worker

logger = logging.getLogger(__name__)


def handle_shortgen(payload: AgentTaskPayload) -> None:
    settings = get_settings()
    storage = StorageClient()
    scratch = Path(settings.scratch_root) / "shortgen" / str(payload.job_id)
    scratch.mkdir(parents=True, exist_ok=True)

    prompt = str(payload.params.get("prompt", "Media Prima social short"))
    voice_name = str(payload.params.get("voice_name", "ms-MY-Standard-A"))
    duration_seconds = int(payload.params.get("duration_seconds", 30))
    script_override = payload.params.get("script")
    search_terms_override = payload.params.get("search_terms")
    video_source = str(payload.params.get("video_source", "stock"))
    enable_subtitles = bool(payload.params.get("enable_subtitles", True))
    enable_dubbing = bool(payload.params.get("enable_dubbing", True))
    tts_server = str(payload.params.get("tts_server", "gcp"))

    plan = build_shorts_plan(
        workspace_id=payload.workspace_id,
        job_id=str(payload.job_id),
        prompt=prompt,
        language=payload.language,
        aspect_ratio=str(payload.aspect_ratio),
        duration_seconds=duration_seconds,
        output_prefix=payload.output_prefix,
        script=str(script_override) if script_override else None,
        search_terms=search_terms_override if isinstance(search_terms_override, list) else None,
        video_source=video_source,
        max_clip_duration_seconds=int(payload.params.get("max_clip_duration_seconds", 5)),
        generated_video_count=int(payload.params.get("generated_video_count", 1)),
    )
    subtitle_settings = {
        "enabled": enable_subtitles,
        "font": str(payload.params.get("subtitle_font", "DejaVuSans-Bold.ttf")),
        "position": str(payload.params.get("subtitle_position", "bottom")),
        "font_color": str(payload.params.get("subtitle_font_color", "#ffffff")),
        "font_size": int(payload.params.get("subtitle_font_size", 60)),
        "outline_color": str(payload.params.get("subtitle_outline_color", "#000000")),
        "outline_width": float(payload.params.get("subtitle_outline_width", 1.5)),
    }
    dubbing_settings = {
        "enabled": enable_dubbing,
        "tts_server": tts_server,
        "voice_name": voice_name,
        "speech_volume": float(payload.params.get("speech_volume", 1.0)),
        "speech_rate": float(payload.params.get("speech_rate", 1.0)),
        "background_music": str(payload.params.get("background_music", "none")),
        "background_music_volume": float(payload.params.get("background_music_volume", 0.2)),
    }
    script = {
        "prompt": prompt,
        "language": payload.language,
        "voice_name": voice_name,
        "video_source": video_source,
        "video_concat_mode": payload.params.get("video_concat_mode", "random"),
        "video_transition_mode": payload.params.get("video_transition_mode", "none"),
        "max_clip_duration_seconds": payload.params.get("max_clip_duration_seconds", 5),
        "generated_video_count": payload.params.get("generated_video_count", 1),
        "script": plan.script,
        "search_terms": plan.search_terms,
        "stock_asset_uris": plan.stock_asset_uris,
        "timeline": [clip.__dict__ for clip in plan.timeline],
        "subtitle_settings": subtitle_settings,
        "dubbing_settings": dubbing_settings,
        "source": "Newsroom Generator handoff"
        if payload.params.get("source_newsroom_job_id")
        else "Prima Studio shorts planner",
        "source_newsroom_job_id": payload.params.get("source_newsroom_job_id"),
        "source_topic_id": payload.params.get("source_topic_id", ""),
        "source_angle_id": payload.params.get("source_angle_id", ""),
        "source_package_uri": payload.params.get("source_package_uri", ""),
    }

    script_filename = f"{payload.job_id}-short-script.json"
    script_uri = storage.build_uri(payload.workspace_id, payload.output_prefix, script_filename)
    storage.write_text(script_uri, json.dumps(script, indent=2), "application/json")

    video_filename = f"{payload.job_id}-generated-short.mp4"
    video_uri = storage.build_uri(payload.workspace_id, payload.output_prefix, video_filename)
    renderer = TranscoderRenderer()
    transcode_metadata: dict[str, str] = {"video_source": video_source}
    used_transcoder = False
    voiceover_path: Path | None = None
    if enable_dubbing:
        try:
            voiceover_path = synthesize_voiceover_audio(
                text=plan.script,
                voice_name=voice_name,
                language=payload.language,
                output_path=scratch / f"{payload.job_id}-voiceover.mp3",
                speech_rate=dubbing_settings["speech_rate"],
                speech_volume=dubbing_settings["speech_volume"],
                tts_server=tts_server,
            )
            if voiceover_path:
                transcode_metadata["dubbing_backend"] = tts_server
        except Exception as exc:
            transcode_metadata["dubbing_error"] = str(exc)

    needs_local_composite = enable_subtitles or voiceover_path is not None
    if renderer.enabled and plan.timeline and not needs_local_composite:
        try:
            submitted = renderer.create_concat_job(
                clips=plan.timeline,
                output_directory_uri=output_directory_for(video_uri),
                output_filename=video_filename,
                aspect_ratio=str(payload.aspect_ratio),
            )
            transcode_metadata = {
                "transcoder_job_name": submitted.job_name,
                "transcoder_state": submitted.state,
                "stock_asset_count": str(len(plan.stock_asset_uris)),
            }
            with session_scope() as session:
                event = EventPayload(
                    job_id=payload.job_id,
                    workspace_id=payload.workspace_id,
                    step=StepName.render_requested,
                    input_asset_ids=[],
                    output_prefix=payload.output_prefix,
                    language=payload.language,
                    aspect_ratio=payload.aspect_ratio,
                    idempotency_key=f"{payload.job_id}:shortgen_transcoder_submitted",
                    metadata=transcode_metadata,
                )
                record_event(session, event, "Transcoder prompt-to-short render submitted")
            result = renderer.wait_for_job(submitted.job_name, submitted.output_uri)
            transcode_metadata["transcoder_state"] = result.state
            if result.state == "SUCCEEDED":
                used_transcoder = True
            elif result.state == "FAILED":
                transcode_metadata["transcoder_error"] = result.error
                if "audio track" in result.error.lower():
                    retry = renderer.create_concat_job(
                        clips=plan.timeline,
                        output_directory_uri=output_directory_for(video_uri),
                        output_filename=video_filename,
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

    if not used_transcoder and plan.timeline:
        local_video = scratch / video_filename
        try:
            render_timeline_mp4(
                storage=storage,
                clips=plan.timeline,
                output_path=local_video,
                aspect_ratio=str(payload.aspect_ratio),
                audio_path=voiceover_path,
                subtitle_text=plan.script if enable_subtitles else "",
                subtitle_options=subtitle_settings,
            )
            storage.copy_file(local_video, video_uri, "video/mp4")
            used_transcoder = True
            transcode_metadata["render_backend"] = "local_ffmpeg_stock"
            transcode_metadata["stock_asset_count"] = str(len(plan.stock_asset_uris))
            if enable_subtitles:
                transcode_metadata["subtitles"] = "burned_in"
        except Exception as exc:
            transcode_metadata["local_render_error"] = str(exc)

    if not used_transcoder:
        local_video = scratch / video_filename
        create_demo_mp4(
            local_video,
            title=prompt,
            duration_seconds=max(3, min(duration_seconds, 10)),
            audio_path=voiceover_path,
            subtitle_text=plan.script if enable_subtitles else "",
            subtitle_options=subtitle_settings,
        )
        storage.copy_file(local_video, video_uri, "video/mp4")
        transcode_metadata.setdefault("render_backend", "local_demo_fallback")
        if enable_subtitles:
            transcode_metadata["subtitles"] = "burned_in"
        if voiceover_path:
            transcode_metadata.setdefault("dubbing_backend", tts_server)
    else:
        transcode_metadata.setdefault("render_backend", "gcp_transcoder")

    with session_scope() as session:
        script_asset, _ = upsert_asset(
            session,
            workspace_id=payload.workspace_id,
            kind=AssetKind.metadata,
            gcs_uri=script_uri,
            filename=script_filename,
            content_type="application/json",
        )
        video_asset, _ = upsert_asset(
            session,
            workspace_id=payload.workspace_id,
            kind=AssetKind.generated_short,
            gcs_uri=video_uri,
            filename=video_filename,
            content_type="video/mp4",
        )
        append_output_asset(session, UUID(str(payload.job_id)), script_asset.id)
        append_output_asset(session, UUID(str(payload.job_id)), video_asset.id)
        event = EventPayload(
            job_id=payload.job_id,
            workspace_id=payload.workspace_id,
            step=StepName.completed,
            input_asset_ids=[],
            output_prefix=payload.output_prefix,
            language=payload.language,
            aspect_ratio=payload.aspect_ratio,
            idempotency_key=f"{payload.job_id}:shortgen_completed",
            metadata={"asset_id": str(video_asset.id), "gcs_uri": video_uri, **transcode_metadata},
        )
        record_event(session, event, "Prompt-to-short video generated")
        set_job_status(session, UUID(str(payload.job_id)), JobStatus.succeeded)

def generate_script_with_adc(prompt: str, language: str) -> str:
    settings = get_settings()
    if settings.gcp_project_id:
        try:
            from google import genai

            client = genai.Client(
                vertexai=True,
                project=settings.gcp_project_id,
                location=settings.gcp_region,
            )
            response = client.models.generate_content(
                model=settings.gemini_model_name,
                contents=(
                    "Write a concise voiceover script for a social video. "
                    f"Language: {language}. Brand context: Media Prima. Prompt: {prompt}"
                ),
            )
            text = getattr(response, "text", "") or ""
            if text.strip():
                return text.strip()
        except Exception as exc:
            logger.warning("Gemini ADC generation failed, using fallback script: %s", exc)

    return (
        f"{prompt}. A concise social-first video script generated for "
        "Media Prima's Malay and English audience."
    )


if __name__ == "__main__":
    run_worker(AgentTaskKind.shortgen, handle_shortgen)
