import json
from dataclasses import asdict

from .contracts import AssetRecord
from .settings import get_settings
from .transcoder import TimelineClip, parse_timestamp_range


def generate_clip_metadata(
    *,
    assets: list[AssetRecord],
    prompt: str,
    language: str,
) -> list[dict]:
    candidates: list[dict] = []
    for index, asset in enumerate(assets):
        generated = _generate_gemini_metadata(asset.gcs_uri, asset.filename, prompt, language)
        if generated:
            for item in generated:
                item.setdefault("source_asset_id", str(asset.id))
                item.setdefault("source_uri", asset.gcs_uri)
                item.setdefault("source_filename", asset.filename)
                item.setdefault("rank", len(candidates) + 1)
                candidates.append(item)
            continue

        raise RuntimeError(
            "Gemini video analysis did not return clip candidates. "
            "Configure GCP/Gemini or rerun with a source Gemini can analyze."
        )
    return candidates


def timeline_from_metadata(metadata_json: str, *, max_clips: int = 8) -> list[TimelineClip]:
    try:
        rows = json.loads(metadata_json)
    except json.JSONDecodeError:
        return []
    if isinstance(rows, dict):
        rows = [rows]
    clips: list[TimelineClip] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        source_uri = row.get("source_uri") or row.get("source_filename")
        if not source_uri:
            continue
        parsed_range = parse_timestamp_range(str(row.get("timestamp_start_end", "")))
        if parsed_range is None:
            continue
        start_seconds, end_seconds = parsed_range
        if end_seconds <= start_seconds:
            continue
        clips.append(TimelineClip(input_uri=source_uri, start_seconds=start_seconds, end_seconds=end_seconds))
        if len(clips) >= max_clips:
            break
    return clips


def timeline_to_json(clips: list[TimelineClip]) -> str:
    return json.dumps([asdict(clip) for clip in clips], indent=2)


def _generate_gemini_metadata(gcs_uri: str, filename: str, prompt: str, language: str) -> list[dict]:
    settings = get_settings()
    if not settings.gcp_project_id:
        return []
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(vertexai=True, project=settings.gcp_project_id, location=settings.gcp_region)
        response = client.models.generate_content(
            model=settings.gemini_model_name,
            contents=[
                (
                    "Analyze this video for short-form clip candidates. "
                    "Return only a JSON array with 6 to 10 candidate shorts when the source has enough material. "
                    "Prefer complete moments that can stand alone as 1 to 5 minute social shorts; "
                    "shorter clips are acceptable only when the source video itself is short. "
                    "Each item must include "
                    "timestamp_start_end as HH:MM:SS - HH:MM:SS, "
                    "using zero-padded hours, minutes, and seconds from this source video's own start time. "
                    "For example, a clip from 18 seconds to 30 seconds must be written as "
                    "00:00:18 - 00:00:30, never as 00:18:00 - 00:30:00. "
                    "Keep every timestamp inside the provided source video duration. "
                    "brief_scene_description, editor_note_clip_rationale, "
                    "dominant_emotional_tone_impact, and trailer_potential_category. "
                    f"Language: {language}. User prompt: {prompt or 'Find the strongest social clips.'}"
                ),
                types.Part.from_uri(file_uri=gcs_uri, mime_type="video/mp4"),
            ],
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )
        rows = json.loads(_strip_json_fence(getattr(response, "text", "[]")))
        if isinstance(rows, list):
            return [row for row in rows if isinstance(row, dict)]
    except Exception:
        return []
    return []


def _strip_json_fence(value: str) -> str:
    text = value.strip()
    if text.startswith("```json"):
        return text[7:].removesuffix("```").strip()
    if text.startswith("```"):
        return text[3:].removesuffix("```").strip()
    return text
