"""Research adapters used by the newsroom agent.

Agent Reach is an installer/router for upstream internet tools, not a stable
runtime SDK. This module keeps the newsroom contract stable while using the
public command shapes documented by Agent Reach when those tools are present.
Every adapter is optional and failures are intentionally isolated so a local
or offline newsroom run still produces a deterministic package.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import xml.etree.ElementTree as ET
from typing import Any, Iterable
from urllib.parse import urlparse

import requests

from .contracts import NewsroomEvidence
from .settings import Settings, get_settings


DEFAULT_CHANNELS = ("gdelt", "exa", "rss", "x", "xiaohongshu")
SUPPORTED_CHANNELS = frozenset(DEFAULT_CHANNELS)


def collect_newsroom_evidence(
    brief: str,
    *,
    settings: Settings | None = None,
) -> list[NewsroomEvidence]:
    """Collect bounded, source-labelled evidence for an editorial brief."""

    runtime = settings or get_settings()
    if not runtime.newsroom_live_signals:
        return []

    channels = _configured_channels(runtime.newsroom_research_channels)
    evidence: list[NewsroomEvidence] = []
    if "gdelt" in channels:
        evidence.extend(_collect_gdelt(brief, runtime))
    if "exa" in channels:
        evidence.extend(_collect_exa(brief, runtime))
    if "rss" in channels:
        evidence.extend(_collect_rss(brief, runtime))
    if "x" in channels:
        evidence.extend(_collect_social("x", brief, runtime))
    if "xiaohongshu" in channels:
        evidence.extend(_collect_social("xiaohongshu", brief, runtime))
    return _dedupe(evidence, runtime.newsroom_research_max_results)


def _configured_channels(value: str) -> tuple[str, ...]:
    requested = tuple(
        item.strip().lower()
        for item in str(value).split(",")
        if item.strip()
    )
    if not requested:
        return DEFAULT_CHANNELS
    return tuple(dict.fromkeys(item for item in requested if item in SUPPORTED_CHANNELS))


def _collect_gdelt(brief: str, settings: Settings) -> list[NewsroomEvidence]:
    try:
        response = requests.get(
            "https://api.gdeltproject.org/api/v2/doc/doc",
            params={
                "query": brief,
                "mode": "artlist",
                "format": "json",
                "maxrecords": settings.newsroom_research_max_results,
                "sort": "hybridrel",
            },
            timeout=settings.newsroom_signal_timeout_seconds,
        )
        response.raise_for_status()
        articles = response.json().get("articles", [])
    except Exception:
        return []

    evidence: list[NewsroomEvidence] = []
    for index, article in enumerate(articles[: settings.newsroom_research_max_results]):
        title = str(article.get("title") or "").strip()
        if not title:
            continue
        evidence.append(
            NewsroomEvidence(
                source=str(article.get("domain") or "GDELT"),
                signal=_shorten(title, 500),
                url=str(article.get("url") or "") or None,
                freshness=str(article.get("seendate") or "recent"),
                strength=max(55, 92 - index * 4),
                evidence_kind="reported",
            )
        )
    return evidence


def _collect_exa(brief: str, settings: Settings) -> list[NewsroomEvidence]:
    """Use Exa through mcporter when Agent Reach has configured it."""

    if shutil.which("mcporter") is None:
        return []
    tool_call = (
        "exa.web_search_exa("
        f"query: {json.dumps(brief, ensure_ascii=False)}, "
        f"numResults: {settings.newsroom_research_max_results})"
    )
    output = _run_command(
        ["mcporter", "call", tool_call],
        timeout=settings.newsroom_command_timeout_seconds,
    )
    return _evidence_from_output(
        output,
        source="Exa",
        evidence_kind="reported",
        default_strength=78,
        limit=settings.newsroom_research_max_results,
    )


def _collect_rss(brief: str, settings: Settings) -> list[NewsroomEvidence]:
    feeds = [item.strip() for item in settings.newsroom_rss_feeds.split(",") if item.strip()]
    if not feeds:
        return []

    terms = {term.lower() for term in re.findall(r"[A-Za-z0-9][A-Za-z0-9'-]{2,}", brief)}
    evidence: list[NewsroomEvidence] = []
    for feed_url in feeds:
        try:
            response = requests.get(feed_url, timeout=settings.newsroom_signal_timeout_seconds)
            response.raise_for_status()
            root = ET.fromstring(response.content)
        except Exception:
            continue
        for item in _rss_items(root):
            title = _xml_text(item, "title")
            summary = _xml_text(item, "description") or _xml_text(item, "summary")
            haystack = f"{title} {summary}".lower()
            if terms and not any(term in haystack for term in terms):
                continue
            url = _rss_link(item)
            domain = urlparse(url).netloc or urlparse(feed_url).netloc or "RSS"
            evidence.append(
                NewsroomEvidence(
                    source=domain,
                    signal=_shorten(title or summary, 500),
                    url=url or None,
                    freshness=_xml_text(item, "pubDate") or _xml_text(item, "updated") or "current",
                    strength=82,
                    evidence_kind="reported",
                )
            )
            if len(evidence) >= settings.newsroom_research_max_results:
                return evidence
    return evidence


def _collect_social(channel: str, brief: str, settings: Settings) -> list[NewsroomEvidence]:
    """Call Agent Reach's selected upstream social CLI without requiring it."""

    limit = settings.newsroom_social_max_results
    commands: list[list[str]]
    if channel == "x":
        commands = []
        if shutil.which("twitter"):
            commands.append(["twitter", "search", brief, "-n", str(limit)])
        if shutil.which("opencli"):
            commands.append(["opencli", "twitter", "search", brief, "-f", "yaml"])
    else:
        commands = []
        if shutil.which("opencli"):
            commands.append(["opencli", "xiaohongshu", "search", brief, "-f", "yaml"])
        if shutil.which("mcporter"):
            tool_call = f"xiaohongshu.search_feeds(keyword: {json.dumps(brief, ensure_ascii=False)})"
            commands.append(["mcporter", "call", tool_call])

    for command in commands:
        output = _run_command(command, timeout=settings.newsroom_command_timeout_seconds)
        evidence = _evidence_from_output(
            output,
            source="X" if channel == "x" else "Xiaohongshu",
            evidence_kind="social_signal",
            default_strength=66,
            limit=limit,
        )
        if evidence:
            return evidence
    return []


def _run_command(command: list[str], *, timeout: float) -> str:
    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
            env=_safe_command_environment(),
        )
    except (OSError, subprocess.TimeoutExpired):
        return ""
    if completed.returncode != 0:
        return ""
    return completed.stdout.strip()


def _safe_command_environment() -> dict[str, str]:
    """Keep CLI calls UTF-8 and avoid passing unrelated process secrets."""

    import os

    allowed = {
        "HOME",
        "PATH",
        "LANG",
        "LC_ALL",
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "NO_PROXY",
        "TWITTER_AUTH_TOKEN",
        "TWITTER_CT0",
    }
    env = {key: value for key, value in os.environ.items() if key in allowed}
    env.setdefault("LANG", "C.UTF-8")
    env.setdefault("LC_ALL", "C.UTF-8")
    return env


def _evidence_from_output(
    output: str,
    *,
    source: str,
    evidence_kind: str,
    default_strength: int,
    limit: int,
) -> list[NewsroomEvidence]:
    if not output:
        return []
    records = list(_structured_records(output))
    if not records:
        records = [{"text": line} for line in output.splitlines() if line.strip()]

    evidence: list[NewsroomEvidence] = []
    for record in records[:limit]:
        signal = _record_signal(record)
        if not signal:
            continue
        url = _record_url(record, source)
        freshness = str(
            record.get("created_at")
            or record.get("published_at")
            or record.get("time")
            or "current social scan"
        )
        engagement = _engagement_strength(record)
        evidence.append(
            NewsroomEvidence(
                source=source,
                signal=_shorten(signal, 500),
                url=url,
                freshness=_shorten(freshness, 64),
                strength=min(90, max(40, default_strength + engagement)),
                evidence_kind=evidence_kind,
            )
        )
    return evidence


def _structured_records(output: str) -> Iterable[dict[str, Any]]:
    parsed: Any = None
    try:
        parsed = json.loads(output)
    except json.JSONDecodeError:
        try:
            import yaml

            parsed = yaml.safe_load(output)
        except Exception:
            return []
    return _walk_records(parsed)


def _walk_records(value: Any) -> Iterable[dict[str, Any]]:
    if isinstance(value, list):
        for item in value:
            yield from _walk_records(item)
        return
    if not isinstance(value, dict):
        return

    content_keys = {"text", "content", "desc", "description", "title", "signal"}
    if any(str(value.get(key) or "").strip() for key in content_keys):
        yield value
        return
    for nested in value.values():
        yield from _walk_records(nested)


def _record_signal(record: dict[str, Any]) -> str:
    for key in ("text", "content", "desc", "description", "title", "signal", "name"):
        value = record.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _record_url(record: dict[str, Any], source: str) -> str | None:
    for key in ("url", "link", "permalink", "share_url"):
        value = record.get(key)
        if isinstance(value, str) and value.startswith(("http://", "https://")):
            return value
    identifier = record.get("id") or record.get("note_id")
    if source == "Xiaohongshu" and identifier:
        return f"https://www.xiaohongshu.com/explore/{identifier}"
    return None


def _engagement_strength(record: dict[str, Any]) -> int:
    total = 0
    for key in ("likes", "like_count", "liked_count", "comments", "comment_count", "share_count"):
        value = record.get(key)
        try:
            total += min(int(value), 1000)
        except (TypeError, ValueError):
            continue
    return min(16, total // 100)


def _rss_items(root: ET.Element) -> Iterable[ET.Element]:
    items = list(root.findall(".//item"))
    if items:
        return items
    return list(root.findall(".//{*}entry"))


def _xml_text(item: ET.Element, name: str) -> str:
    value = item.findtext(name) or item.findtext(f"{{*}}{name}") or ""
    return " ".join(value.split())


def _rss_link(item: ET.Element) -> str:
    link = _xml_text(item, "link")
    if link:
        return link
    for element in item.findall(".//{*}link"):
        href = element.attrib.get("href", "")
        if href.startswith(("http://", "https://")):
            return href
    return ""


def _dedupe(evidence: list[NewsroomEvidence], limit: int) -> list[NewsroomEvidence]:
    seen: set[str] = set()
    result: list[NewsroomEvidence] = []
    for item in evidence:
        key = (item.url or item.signal).strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        result.append(item)
        if len(result) >= limit:
            break
    return result


def _shorten(value: str, limit: int) -> str:
    text = " ".join(str(value).split())
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 1)].rstrip() + "..."
