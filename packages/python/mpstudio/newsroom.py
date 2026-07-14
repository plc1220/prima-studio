import re
from datetime import datetime, timezone
from uuid import UUID

from .contracts import (
    AspectRatio,
    NewsroomAngle,
    NewsroomEvidence,
    NewsroomNarrativePackage,
    NewsroomPackage,
    NewsroomScenePlan,
    NewsroomShortsHandoff,
    NewsroomTopicCard,
)
from .research import collect_newsroom_evidence
from .settings import get_settings


STOPWORDS = {
    "about",
    "after",
    "again",
    "and",
    "are",
    "audience",
    "audiences",
    "bagaimana",
    "bagi",
    "baharu",
    "baru",
    "dalam",
    "dan",
    "dengan",
    "for",
    "from",
    "ini",
    "itu",
    "kepada",
    "mereka",
    "pada",
    "people",
    "that",
    "the",
    "this",
    "untuk",
    "yang",
    "young",
    "malaysians",
    "discuss",
    "discussing",
}


def build_newsroom_package(
    *,
    job_id: UUID,
    workspace_id: str,
    brief: str,
    audience: str,
    platform: str,
    urgency: str,
    tone: str,
    brand_fit: str,
    slate_mode: str,
    slate_size: int,
    language: str,
    aspect_ratio: AspectRatio | str,
    duration_seconds: int,
    source_package_uri: str = "",
) -> NewsroomPackage:
    keywords = _keywords(brief)
    live_evidence = _collect_live_evidence(brief)
    cards = _build_topic_cards(
        brief=brief,
        keywords=keywords,
        audience=audience,
        platform=platform,
        urgency=urgency,
        tone=tone,
        brand_fit=brand_fit,
        slate_size=slate_size,
        live_evidence=live_evidence,
    )
    narratives = [
        _build_narrative_package(
            job_id=job_id,
            source_package_uri=source_package_uri,
            card=card,
            angle=angle,
            brief=brief,
            keywords=keywords,
            audience=audience,
            platform=platform,
            urgency=urgency,
            tone=tone,
            language=language,
            duration_seconds=duration_seconds,
        )
        for card in cards
        for angle in card.angles
    ]
    selected_card = cards[0]
    selected_angle_id = selected_card.recommended_angle_id or selected_card.angles[0].id
    selected_narrative = _find_narrative(narratives, selected_card.id, selected_angle_id)

    return NewsroomPackage(
        id=job_id,
        workspace_id=workspace_id,
        brief=brief,
        audience=audience,
        platform=platform,
        urgency=urgency,
        tone=tone,
        brand_fit=brand_fit,
        slate_mode=slate_mode,
        language=language,
        aspect_ratio=AspectRatio(str(aspect_ratio)),
        duration_seconds=duration_seconds,
        generated_at=datetime.now(timezone.utc),
        topic_cards=cards,
        selected_topic_id=selected_card.id,
        selected_angle_id=selected_angle_id,
        narrative_package=selected_narrative,
        narrative_packages=narratives,
        slate_summary=[f"{index + 1}. {card.title} ({card.rank_score})" for index, card in enumerate(cards)],
    )


def _build_topic_cards(
    *,
    brief: str,
    keywords: list[str],
    audience: str,
    platform: str,
    urgency: str,
    tone: str,
    brand_fit: str,
    slate_size: int,
    live_evidence: list[NewsroomEvidence],
) -> list[NewsroomTopicCard]:
    base = _brief_title(brief)
    focus_terms = keywords or _keywords(base) or ["news"]
    templates = [
        ("What changed in {focus} today", "A concise update that separates the new development from background noise."),
        ("Why {focus} matters to {audience}", "A people-first angle that connects the topic to everyday decisions."),
        ("The Malaysia angle on {focus}", "A localized cut that makes a broad trend feel specific and useful."),
        ("Three facts that reframe {focus}", "A structured fact stack for audiences who need the quickest credible version."),
        ("What social audiences are asking about {focus}", "A comments-led angle shaped around likely viewer confusion and curiosity."),
        ("The next 24 hours for {focus}", "A forward-looking watchlist for producers planning a daily slate."),
        ("What to verify before posting about {focus}", "A newsroom-safety angle for topics with claims, speculation, or fast updates."),
        ("The campaign explainer for {focus}", "A reusable campaign entry that can become a sequence of shorts."),
    ]
    cards: list[NewsroomTopicCard] = []
    for index in range(slate_size):
        focus = _focus_phrase(base, focus_terms, index)
        title_template, summary_template = templates[index % len(templates)]
        title = title_template.format(focus=focus, audience=_shorten(audience, 42))
        evidence = _evidence_for_card(
            index=index,
            title=title,
            focus=focus,
            platform=platform,
            urgency=urgency,
            brand_fit=brand_fit,
            live_evidence=live_evidence,
        )
        score = _rank_score(index, urgency, platform, evidence)
        card_id = f"topic-{index + 1}"
        angles = _angles_for_card(card_id, title, focus, tone)
        cards.append(
            NewsroomTopicCard(
                id=card_id,
                title=title,
                summary=f"{summary_template} Brief context: {_shorten(base, 160)}.",
                rank_score=score,
                urgency=urgency,
                audience_fit=f"Localize for {_shorten(audience, 96)}.",
                platform_fit=f"{platform}: hook-first edit with fast visual proof points.",
                brand_fit=f"Fits {brand_fit} when claims are attributed and the close avoids outrage framing.",
                evidence=evidence,
                angles=angles,
                recommended_angle_id=angles[0].id,
            )
        )
    return sorted(cards, key=lambda card: card.rank_score, reverse=True)


def _angles_for_card(card_id: str, title: str, focus: str, tone: str) -> list[NewsroomAngle]:
    return [
        NewsroomAngle(
            id=f"{card_id}-explainer",
            title="Explainer",
            hook=f"The quick version of {focus}: one thing changed, and it affects what happens next.",
            rationale="Best when the audience needs context before opinion.",
            tone=tone,
            risk_level="low",
            editorial_note="Anchor the first claim to a named public source or clearly label it as a watch item.",
        ),
        NewsroomAngle(
            id=f"{card_id}-impact",
            title="Audience impact",
            hook=f"If you only have 30 seconds, here is why {focus} may matter to you.",
            rationale="Best when the topic has practical consequences for viewers.",
            tone=tone,
            risk_level="medium",
            editorial_note="Avoid overstating impact. Use conditional language when outcomes are not settled.",
        ),
        NewsroomAngle(
            id=f"{card_id}-verify",
            title="Verify before sharing",
            hook=f"Before this spreads further, here are the parts of {focus} worth checking.",
            rationale="Best for fast-moving topics, claims, rumors, or high-confusion conversations.",
            tone=tone,
            risk_level="medium",
            editorial_note="Separate confirmed facts, reported claims, and open questions on screen.",
        ),
    ]


def _build_narrative_package(
    *,
    job_id: UUID,
    source_package_uri: str,
    card: NewsroomTopicCard,
    angle: NewsroomAngle,
    brief: str,
    keywords: list[str],
    audience: str,
    platform: str,
    urgency: str,
    tone: str,
    language: str,
    duration_seconds: int,
) -> NewsroomNarrativePackage:
    search_terms = _search_terms(card.title, keywords)
    hook_options = [
        angle.hook,
        f"Here is the clearest way to understand {card.title.lower()}.",
        f"This is the part of {card.title.lower()} that is easiest to miss.",
    ]
    scene_plan = _scene_plan(
        title=card.title,
        angle=angle,
        search_terms=search_terms,
        language=language,
        duration_seconds=duration_seconds,
    )
    script = _script(
        title=card.title,
        angle=angle,
        brief=brief,
        audience=audience,
        urgency=urgency,
        language=language,
    )
    captions = _captions(card.title, angle, language)
    hashtags = _hashtags(keywords, platform)
    prompt = (
        f"Create a {duration_seconds}-second {platform} short for {audience}. "
        f"Approved newsroom angle: {card.title} / {angle.title}. Tone: {tone}. "
        f"Use the provided script, scene plan, captions, and stock search terms."
    )
    handoff = NewsroomShortsHandoff(
        prompt=prompt,
        script=script,
        search_terms=search_terms,
        caption=captions[0],
        source_newsroom_job_id=job_id,
        source_topic_id=card.id,
        source_angle_id=angle.id,
        source_package_uri=source_package_uri,
    )
    return NewsroomNarrativePackage(
        topic_id=card.id,
        angle_id=angle.id,
        title=f"{card.title}: {angle.title}",
        prompt=prompt,
        hook_options=hook_options,
        script=script,
        scene_plan=scene_plan,
        caption_options=captions,
        hashtags=hashtags,
        search_terms=search_terms,
        editorial_checks=[
            "Confirm the newest fact before recording.",
            "Attribute any claim that depends on a third-party report.",
            "Keep speculation out of the headline and first line.",
            "Use neutral visuals if the available stock footage is not topic-specific.",
        ],
        handoff=handoff,
    )


def _collect_live_evidence(brief: str) -> list[NewsroomEvidence]:
    return collect_newsroom_evidence(brief, settings=get_settings())


def _evidence_for_card(
    *,
    index: int,
    title: str,
    focus: str,
    platform: str,
    urgency: str,
    brand_fit: str,
    live_evidence: list[NewsroomEvidence],
) -> list[NewsroomEvidence]:
    selected_live = live_evidence[index : index + 2] or live_evidence[:1]
    fallback = [
        NewsroomEvidence(
            source="Search queue",
            signal=f"Validate freshness with searches for '{focus}', '{title}', and local Malaysia updates.",
            freshness=urgency,
            strength=78 - min(index * 3, 18),
        ),
        NewsroomEvidence(
            source="Social listening",
            signal=f"Check {platform} comments and creator posts for repeated questions, confusion, and shareable phrasing.",
            freshness="current platform scan",
            strength=74 - min(index * 2, 14),
        ),
        NewsroomEvidence(
            source="Editorial fit",
            signal=f"Package with {brand_fit}: sourced claims, neutral framing, and a useful viewer takeaway.",
            freshness="pre-publish review",
            strength=82 - min(index * 2, 12),
        ),
    ]
    return [*selected_live, *fallback][:4]


def _scene_plan(
    *,
    title: str,
    angle: NewsroomAngle,
    search_terms: list[str],
    language: str,
    duration_seconds: int,
) -> list[NewsroomScenePlan]:
    beats = _malay_beats(title, angle) if language.startswith("ms") else _english_beats(title, angle)
    per_scene = max(3, duration_seconds // max(len(beats), 1))
    return [
        NewsroomScenePlan(
            beat=beat,
            visual=visual,
            narration=narration,
            search_terms=search_terms[index : index + 2] or search_terms[:2],
            duration_seconds=per_scene,
        )
        for index, (beat, visual, narration) in enumerate(beats)
    ]


def _english_beats(title: str, angle: NewsroomAngle) -> list[tuple[str, str, str]]:
    return [
        ("Hook", "Fast opener with phone/newsroom/social feed visuals", angle.hook),
        ("Context", "Headline card, map, public-location b-roll, or abstract explainer visual", f"{title} is moving because the audience needs the simplest verified version first."),
        ("What changed", "Two to three text beats over relevant b-roll", "Start with what is new, then separate confirmed facts from open questions."),
        ("Viewer relevance", "People, commute, office, school, or city-life visuals", "Make the impact practical, local, and easy to repeat accurately."),
        ("Close", "Clean end card with one takeaway", "Follow the next update, but do not share claims that have not been checked."),
    ]


def _malay_beats(title: str, angle: NewsroomAngle) -> list[tuple[str, str, str]]:
    return [
        ("Pembuka", "Visual telefon, bilik berita, atau suapan sosial yang bergerak pantas", angle.hook),
        ("Konteks", "Kad tajuk, peta, lokasi awam, atau visual penerangan ringkas", f"{title} perlu dijelaskan dengan versi yang paling mudah dan disahkan dahulu."),
        ("Apa berubah", "Dua hingga tiga poin teks di atas visual berkaitan", "Mulakan dengan perkembangan baharu, kemudian asingkan fakta sah daripada persoalan terbuka."),
        ("Kesan penonton", "Visual orang ramai, tempat kerja, sekolah, atau suasana bandar", "Jadikan kesannya praktikal, tempatan, dan mudah dikongsi dengan tepat."),
        ("Penutup", "Kad akhir bersih dengan satu kesimpulan", "Ikuti perkembangan seterusnya, tetapi jangan kongsi dakwaan yang belum disemak."),
    ]


def _script(
    *,
    title: str,
    angle: NewsroomAngle,
    brief: str,
    audience: str,
    urgency: str,
    language: str,
) -> str:
    if language.startswith("ms"):
        return (
            f"{angle.hook}\n\n"
            f"Ini ringkasan pantas tentang {title}. Fokus kita ialah apa yang baharu, "
            f"apa yang sudah disahkan, dan apa yang masih perlu dipantau. "
            f"Berdasarkan brief editor: {_shorten(brief, 260)}. "
            f"Untuk {audience}, perkara paling penting ialah kesannya dalam kehidupan harian "
            f"dan apa yang perlu disemak sebelum berkongsi. "
            f"Status editorial: {urgency}. Semak sumber terkini sebelum rakaman akhir."
        )
    return (
        f"{angle.hook}\n\n"
        f"Here is the quick newsroom version of {title}. Start with what is new, "
        f"separate verified facts from open questions, and keep the viewer takeaway practical. "
        f"Editor brief: {_shorten(brief, 260)}. "
        f"For {audience}, the strongest frame is what changes, who is affected, "
        f"and what should be checked before sharing. "
        f"Editorial status: {urgency}. Confirm the latest source before final recording."
    )


def _captions(title: str, angle: NewsroomAngle, language: str) -> list[str]:
    if language.startswith("ms"):
        return [
            f"{title}: ini versi ringkas yang perlu anda tahu.",
            f"Apa yang berubah, apa yang disahkan, dan apa yang masih perlu dipantau.",
            f"Semak fakta sebelum kongsi. {angle.title} dalam 60 saat.",
        ]
    return [
        f"{title}: the quick version you need before sharing.",
        "What changed, what is verified, and what still needs watching.",
        f"A clear {angle.title.lower()} angle for the next social update.",
    ]


def _find_narrative(
    narratives: list[NewsroomNarrativePackage],
    topic_id: str,
    angle_id: str,
) -> NewsroomNarrativePackage:
    for narrative in narratives:
        if narrative.topic_id == topic_id and narrative.angle_id == angle_id:
            return narrative
    return narratives[0]


def _rank_score(index: int, urgency: str, platform: str, evidence: list[NewsroomEvidence]) -> int:
    urgency_bonus = 10 if any(word in urgency.lower() for word in ["today", "breaking", "now"]) else 4
    platform_bonus = 6 if any(word in platform.lower() for word in ["tiktok", "reels", "shorts"]) else 3
    evidence_bonus = int(sum(item.strength for item in evidence[:2]) / max(len(evidence[:2]), 1) / 10)
    return max(45, min(98, 82 + urgency_bonus + platform_bonus + evidence_bonus - index * 7))


def _search_terms(title: str, keywords: list[str]) -> list[str]:
    base = keywords[:5] or _keywords(title)[:5]
    phrases = [
        f"{term} Malaysia news" for term in base
    ] + [
        "newsroom presenter",
        "social media phone",
        "Malaysia city crowd",
        "broadcast studio",
        "breaking news graphics",
    ]
    return list(dict.fromkeys([_shorten(term, 64) for term in phrases if term.strip()]))[:8]


def _hashtags(keywords: list[str], platform: str) -> list[str]:
    tags = ["#MediaPrima", "#NewsUpdate"]
    for term in keywords[:5]:
        cleaned = re.sub(r"[^A-Za-z0-9]", "", term.title())
        if cleaned:
            tags.append(f"#{cleaned}")
    if "tiktok" in platform.lower():
        tags.append("#TikTokNews")
    return list(dict.fromkeys(tags))[:8]


def _keywords(text: str) -> list[str]:
    tokens = re.findall(r"[A-Za-z0-9][A-Za-z0-9'-]{2,}", text.lower())
    result: list[str] = []
    for token in tokens:
        cleaned = token.strip("-'")
        if cleaned in STOPWORDS or cleaned.isdigit():
            continue
        if cleaned not in result:
            result.append(cleaned)
        if len(result) >= 10:
            break
    return result


def _focus_phrase(base: str, terms: list[str], index: int) -> str:
    if not terms:
        return _shorten(base, 72)
    rotated = terms[index % len(terms) :] + terms[: index % len(terms)]
    phrase = " ".join(rotated[: min(3, len(rotated))])
    return phrase.title() if phrase else _shorten(base, 72)


def _brief_title(brief: str) -> str:
    first_line = next((line.strip() for line in brief.splitlines() if line.strip()), brief.strip())
    return _shorten(first_line.rstrip("."), 120) or "Newsroom brief"


def _shorten(value: str, limit: int) -> str:
    text = " ".join(str(value).split())
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 1)].rstrip() + "..."
