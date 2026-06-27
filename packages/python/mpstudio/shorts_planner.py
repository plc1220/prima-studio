import json
import re
from dataclasses import asdict, dataclass
from pathlib import Path

from .settings import get_settings
from .storage import StorageClient
from .transcoder import TimelineClip


@dataclass(frozen=True)
class StockVideo:
    provider: str
    url: str
    duration_seconds: int
    description: str = ""


@dataclass(frozen=True)
class ShortsPlan:
    prompt: str
    language: str
    script: str
    search_terms: list[str]
    stock_videos: list[StockVideo]
    stock_asset_uris: list[str]
    timeline: list[TimelineClip]

    def to_json(self) -> str:
        data = asdict(self)
        data["timeline"] = [asdict(clip) for clip in self.timeline]
        return json.dumps(data, indent=2)


def build_shorts_plan(
    *,
    workspace_id: str,
    job_id: str,
    prompt: str,
    language: str,
    aspect_ratio: str,
    duration_seconds: int,
    output_prefix: str,
    script: str | None = None,
    search_terms: list[str] | None = None,
) -> ShortsPlan:
    final_script = script.strip() if script and script.strip() else generate_script_with_vertex(prompt, language)
    terms = _clean_terms(search_terms) or generate_search_terms_with_vertex(prompt, final_script, language)
    stock_videos = search_stock_videos(terms, aspect_ratio=aspect_ratio, minimum_duration=4)
    stock_asset_uris = download_and_store_stock_videos(
        workspace_id=workspace_id,
        job_id=job_id,
        output_prefix=output_prefix,
        videos=stock_videos[: max(1, min(6, len(stock_videos)))],
    )
    timeline = build_timeline(stock_asset_uris, duration_seconds=duration_seconds)
    return ShortsPlan(
        prompt=prompt,
        language=language,
        script=final_script,
        search_terms=terms,
        stock_videos=stock_videos,
        stock_asset_uris=stock_asset_uris,
        timeline=timeline,
    )


def generate_script_with_vertex(prompt: str, language: str) -> str:
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
                    "Keep it practical for Media Prima newsroom/social teams. "
                    f"Language: {language}. Prompt: {prompt}"
                ),
            )
            if getattr(response, "text", ""):
                return response.text.strip()
        except Exception:
            pass
    return f"{prompt}. A concise social-first video script generated for Media Prima."


def generate_search_terms_with_vertex(prompt: str, script: str, language: str) -> list[str]:
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
                    "Return only a JSON array of 5 short English stock-video search terms. "
                    f"Prompt: {prompt}\nLanguage: {language}\nScript:\n{script}"
                ),
            )
            terms = json.loads(_strip_json_fence(getattr(response, "text", "[]")))
            if isinstance(terms, list):
                cleaned = [str(term).strip() for term in terms if str(term).strip()]
                if cleaned:
                    return cleaned[:8]
        except Exception:
            pass
    words = re.findall(r"[A-Za-z]{4,}", f"{prompt} {script}".lower())
    fallback = list(dict.fromkeys(words[:6]))
    return fallback or ["Malaysia newsroom", "broadcast studio", "social media video"]


def search_stock_videos(
    search_terms: list[str],
    *,
    aspect_ratio: str,
    minimum_duration: int,
) -> list[StockVideo]:
    settings = get_settings()
    source = settings.stock_video_source.lower().strip()
    api_keys = _api_keys_for_source(source)
    if not api_keys:
        return []
    results: list[StockVideo] = []
    for term in search_terms:
        if source == "pixabay":
            results.extend(_search_pixabay(term, api_keys[0], minimum_duration))
        else:
            results.extend(_search_pexels(term, api_keys[0], aspect_ratio, minimum_duration))
        if len(results) >= 6:
            break
    return results


def download_and_store_stock_videos(
    *,
    workspace_id: str,
    job_id: str,
    output_prefix: str,
    videos: list[StockVideo],
) -> list[str]:
    if not videos:
        return []
    import requests

    settings = get_settings()
    storage = StorageClient()
    scratch = Path(settings.scratch_root) / "shorts-planner" / job_id / "stock"
    scratch.mkdir(parents=True, exist_ok=True)
    uris: list[str] = []
    for index, video in enumerate(videos, start=1):
        filename = f"{job_id}-stock-{index:02d}.mp4"
        local_path = scratch / filename
        try:
            response = requests.get(video.url, timeout=settings.stock_download_timeout_seconds)
            response.raise_for_status()
            local_path.write_bytes(response.content)
            if local_path.stat().st_size <= 0:
                continue
            gcs_uri = storage.build_uri(workspace_id, f"{output_prefix}/stock", filename)
            storage.copy_file(local_path, gcs_uri, "video/mp4")
            uris.append(gcs_uri)
        except Exception:
            continue
    return uris


def build_timeline(asset_uris: list[str], *, duration_seconds: int) -> list[TimelineClip]:
    if not asset_uris:
        return []
    per_clip = max(3, min(8, int(duration_seconds / max(len(asset_uris), 1)) or 5))
    return [TimelineClip(input_uri=uri, start_seconds=0, end_seconds=per_clip) for uri in asset_uris]


def _api_keys_for_source(source: str) -> list[str]:
    settings = get_settings()
    raw = {
        "pixabay": settings.pixabay_api_keys,
        "pexels": settings.pexels_api_keys,
        "coverr": settings.coverr_api_keys,
    }.get(source, settings.pexels_api_keys)
    return [key.strip() for key in raw.split(",") if key.strip()]


def _clean_terms(search_terms: list[str] | None) -> list[str]:
    if not search_terms:
        return []
    cleaned: list[str] = []
    for term in search_terms:
        value = str(term).strip()
        if value and value not in cleaned:
            cleaned.append(value[:80])
        if len(cleaned) >= 8:
            break
    return cleaned


def _search_pexels(term: str, api_key: str, aspect_ratio: str, minimum_duration: int) -> list[StockVideo]:
    import requests

    orientation = "portrait" if aspect_ratio == "9:16" else "landscape" if aspect_ratio == "16:9" else "square"
    response = requests.get(
        "https://api.pexels.com/videos/search",
        params={"query": term, "per_page": 10, "orientation": orientation},
        headers={"Authorization": api_key},
        timeout=30,
    )
    response.raise_for_status()
    videos = []
    for item in response.json().get("videos", []):
        duration = int(item.get("duration") or 0)
        if duration < minimum_duration:
            continue
        files = sorted(item.get("video_files", []), key=lambda row: int(row.get("width") or 0), reverse=True)
        if files and files[0].get("link"):
            videos.append(StockVideo(provider="pexels", url=files[0]["link"], duration_seconds=duration, description=term))
    return videos


def _search_pixabay(term: str, api_key: str, minimum_duration: int) -> list[StockVideo]:
    import requests

    response = requests.get(
        "https://pixabay.com/api/videos/",
        params={"q": term, "video_type": "all", "per_page": 10, "key": api_key},
        timeout=30,
    )
    response.raise_for_status()
    videos = []
    for item in response.json().get("hits", []):
        duration = int(item.get("duration") or 0)
        if duration < minimum_duration:
            continue
        files = item.get("videos", {})
        best = files.get("large") or files.get("medium") or files.get("small")
        if best and best.get("url"):
            videos.append(StockVideo(provider="pixabay", url=best["url"], duration_seconds=duration, description=term))
    return videos


def _strip_json_fence(value: str) -> str:
    text = value.strip()
    if text.startswith("```json"):
        return text[7:].removesuffix("```").strip()
    if text.startswith("```"):
        return text[3:].removesuffix("```").strip()
    return text
