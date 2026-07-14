import json
from types import SimpleNamespace

from mpstudio.research import _configured_channels, collect_newsroom_evidence
from mpstudio.settings import Settings


def _settings(channels: str) -> Settings:
    return Settings(
        newsroom_live_signals=True,
        newsroom_research_channels=channels,
        newsroom_research_max_results=8,
        newsroom_social_max_results=4,
        newsroom_command_timeout_seconds=3,
    )


def test_research_channel_allowlist_excludes_unselected_platforms() -> None:
    assert _configured_channels("gdelt,github,reddit,bilibili,x,xiaohongshu") == (
        "gdelt",
        "x",
        "xiaohongshu",
    )


def test_social_adapters_use_agent_reach_upstream_commands(monkeypatch) -> None:
    calls: list[list[str]] = []

    monkeypatch.setattr(
        "mpstudio.research.shutil.which",
        lambda command: f"/usr/local/bin/{command}" if command in {"twitter", "opencli"} else None,
    )

    def fake_run(command, **_kwargs):
        calls.append(command)
        if command[0] == "twitter":
            return SimpleNamespace(
                returncode=0,
                stdout=json.dumps(
                    [{
                        "text": "X is discussing the new Malaysia policy",
                        "url": "https://x.com/example/status/1",
                        "created_at": "2026-07-14T10:00:00Z",
                    }]
                ),
            )
        return SimpleNamespace(
            returncode=0,
            stdout=json.dumps(
                [{
                    "title": "Apa kata pengguna Malaysia",
                    "desc": "Perbincangan tempatan tentang topik ini",
                    "id": "note-123",
                }]
            ),
        )

    monkeypatch.setattr("mpstudio.research.subprocess.run", fake_run)

    evidence = collect_newsroom_evidence(
        "Malaysia policy discussion",
        settings=_settings("x,xiaohongshu"),
    )

    assert [item.source for item in evidence] == ["X", "Xiaohongshu"]
    assert all(item.evidence_kind == "social_signal" for item in evidence)
    assert evidence[0].url == "https://x.com/example/status/1"
    assert evidence[1].url == "https://www.xiaohongshu.com/explore/note-123"
    assert calls[0][:2] == ["twitter", "search"]
    assert calls[1][:3] == ["opencli", "xiaohongshu", "search"]


def test_gdelt_evidence_is_reported_and_bounded(monkeypatch) -> None:
    class Response:
        content = b""

        def raise_for_status(self):
            return None

        def json(self):
            return {
                "articles": [
                    {
                        "domain": "example.com",
                        "title": "A verified-looking public update",
                        "url": "https://example.com/story",
                        "seendate": "20260714100000",
                    }
                ]
            }

    monkeypatch.setattr("mpstudio.research.requests.get", lambda *args, **kwargs: Response())

    evidence = collect_newsroom_evidence(
        "public update",
        settings=_settings("gdelt"),
    )

    assert len(evidence) == 1
    assert evidence[0].source == "example.com"
    assert evidence[0].evidence_kind == "reported"
