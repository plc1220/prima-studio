from datetime import datetime
from enum import StrEnum
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


class WorkflowKind(StrEnum):
    video_clipping = "video_clipping"
    shorts = "shorts"
    newsroom = "newsroom"


class JobStatus(StrEnum):
    queued = "queued"
    running = "running"
    succeeded = "succeeded"
    failed = "failed"
    canceled = "canceled"


class AgentTaskKind(StrEnum):
    orchestrate = "orchestrate"
    metadata = "metadata"
    render = "render"
    shortgen = "shortgen"
    newsroom = "newsroom"


class AspectRatio(StrEnum):
    portrait = "9:16"
    landscape = "16:9"
    square = "1:1"


class StepName(StrEnum):
    workflow_requested = "workflow_requested"
    split_requested = "split_requested"
    newsroom_requested = "newsroom_requested"
    newsroom_generated = "newsroom_generated"
    metadata_requested = "metadata_requested"
    render_requested = "render_requested"
    shortgen_requested = "shortgen_requested"
    artifact_uploaded = "artifact_uploaded"
    completed = "completed"
    failed = "failed"


class EventPayload(BaseModel):
    job_id: UUID
    workspace_id: str = Field(min_length=1, max_length=128)
    step: StepName | str
    input_asset_ids: list[UUID] = Field(default_factory=list)
    output_prefix: str = Field(default="", max_length=512)
    language: str = Field(default="ms-MY", max_length=32)
    aspect_ratio: AspectRatio = AspectRatio.portrait
    idempotency_key: str = Field(min_length=8, max_length=256)
    metadata: dict[str, Any] = Field(default_factory=dict)


class JobEvent(BaseModel):
    id: UUID
    job_id: UUID
    step: str
    message: str
    payload: EventPayload
    created_at: datetime


class AssetKind(StrEnum):
    source_video = "source_video"
    segment = "segment"
    metadata = "metadata"
    clip = "clip"
    final_video = "final_video"
    thumbnail = "thumbnail"
    generated_short = "generated_short"


class AssetRecord(BaseModel):
    id: UUID
    workspace_id: str
    kind: AssetKind
    gcs_uri: str
    filename: str
    content_type: str = "application/octet-stream"
    created_at: datetime


class WorkspaceRecord(BaseModel):
    id: str
    name: str
    lane: WorkflowKind | None = None
    created_at: datetime


class UploadUrlRequest(BaseModel):
    workspace_id: str = Field(min_length=1, max_length=128)
    filename: str = Field(min_length=1, max_length=256)
    content_type: str = Field(default="application/octet-stream", max_length=128)
    kind: AssetKind = AssetKind.source_video


class UploadUrlResponse(BaseModel):
    asset_id: UUID
    upload_url: str
    method: Literal["PUT"] = "PUT"
    gcs_uri: str


class DownloadUrlResponse(BaseModel):
    asset_id: UUID
    download_url: str
    gcs_uri: str


class VideoClippingWorkflowRequest(BaseModel):
    workspace_id: str = Field(min_length=1, max_length=128)
    source_asset_ids: list[UUID] = Field(min_length=1)
    language: str = Field(default="ms-MY", max_length=32)
    aspect_ratio: AspectRatio = AspectRatio.portrait
    segment_duration_seconds: int = Field(default=60, ge=10, le=600)
    output_prefix: str = Field(default="outputs/video-clipping", max_length=512)
    prompt: str = Field(default="", max_length=4000)


class VideoClippingRenderSelectionRequest(BaseModel):
    workspace_id: str = Field(min_length=1, max_length=128)
    source_asset_id: UUID | None = None
    highlights: list[dict[str, Any]] = Field(min_length=1)
    language: str = Field(default="ms-MY", max_length=32)
    aspect_ratio: AspectRatio = AspectRatio.portrait
    output_prefix: str = Field(default="outputs/video-clipping", max_length=512)
    render_mode: Literal["individual", "joined"] = "individual"


class ShortsWorkflowRequest(BaseModel):
    workspace_id: str = Field(min_length=1, max_length=128)
    prompt: str = Field(min_length=1, max_length=2000)
    language: str = Field(default="ms-MY", max_length=32)
    aspect_ratio: AspectRatio = AspectRatio.portrait
    voice_name: str = Field(default="ms-MY-Standard-A", max_length=128)
    video_source: Literal["stock", "veo3", "veo3_fast"] = "stock"
    video_concat_mode: Literal["random", "sequential"] = "random"
    video_transition_mode: Literal["none", "fade"] = "none"
    max_clip_duration_seconds: int = Field(default=5, ge=3, le=30)
    generated_video_count: int = Field(default=1, ge=1, le=4)
    enable_subtitles: bool = True
    subtitle_font: str = Field(default="DejaVuSans-Bold.ttf", max_length=128)
    subtitle_position: Literal["bottom", "middle", "top"] = "bottom"
    subtitle_font_color: str = Field(default="#ffffff", max_length=24)
    subtitle_font_size: int = Field(default=60, ge=24, le=120)
    subtitle_outline_color: str = Field(default="#000000", max_length=24)
    subtitle_outline_width: float = Field(default=1.5, ge=0, le=10)
    enable_dubbing: bool = True
    tts_server: Literal["gcp", "native", "none"] = "gcp"
    speech_volume: float = Field(default=1.0, ge=0, le=2)
    speech_rate: float = Field(default=1.0, ge=0.5, le=2)
    background_music: Literal["none", "random"] = "none"
    background_music_volume: float = Field(default=0.2, ge=0, le=1)
    output_prefix: str = Field(default="outputs/shorts", max_length=512)
    duration_seconds: int = Field(default=30, ge=10, le=180)
    script: str | None = Field(default=None, max_length=8000)
    search_terms: list[str] = Field(default_factory=list, max_length=12)
    source_newsroom_job_id: UUID | None = None
    source_topic_id: str = Field(default="", max_length=128)
    source_angle_id: str = Field(default="", max_length=128)
    source_package_uri: str = Field(default="", max_length=512)


class NewsroomWorkflowRequest(BaseModel):
    workspace_id: str = Field(min_length=1, max_length=128)
    brief: str = Field(min_length=3, max_length=4000)
    audience: str = Field(default="Malaysia digital news audience", max_length=256)
    platform: str = Field(default="TikTok, Reels, Shorts", max_length=128)
    urgency: str = Field(default="today", max_length=64)
    tone: str = Field(default="clear, social-first, credible", max_length=256)
    brand_fit: str = Field(default="Media Prima newsroom standards", max_length=256)
    slate_mode: str = Field(default="daily", max_length=64)
    slate_size: int = Field(default=5, ge=2, le=8)
    language: str = Field(default="ms-MY", max_length=32)
    aspect_ratio: AspectRatio = AspectRatio.portrait
    duration_seconds: int = Field(default=45, ge=10, le=180)
    output_prefix: str = Field(default="outputs/newsroom", max_length=512)


class NewsroomEvidence(BaseModel):
    source: str = Field(max_length=128)
    signal: str = Field(max_length=512)
    url: str | None = Field(default=None, max_length=1000)
    freshness: str = Field(default="current", max_length=64)
    strength: int = Field(default=70, ge=0, le=100)


class NewsroomAngle(BaseModel):
    id: str = Field(max_length=128)
    title: str = Field(max_length=180)
    hook: str = Field(max_length=300)
    rationale: str = Field(max_length=600)
    tone: str = Field(max_length=180)
    risk_level: str = Field(default="low", max_length=64)
    editorial_note: str = Field(default="", max_length=600)


class NewsroomTopicCard(BaseModel):
    id: str = Field(max_length=128)
    title: str = Field(max_length=220)
    summary: str = Field(max_length=900)
    rank_score: int = Field(ge=0, le=100)
    urgency: str = Field(max_length=64)
    audience_fit: str = Field(max_length=180)
    platform_fit: str = Field(max_length=180)
    brand_fit: str = Field(max_length=180)
    evidence: list[NewsroomEvidence] = Field(default_factory=list)
    angles: list[NewsroomAngle] = Field(default_factory=list)
    recommended_angle_id: str = Field(default="", max_length=128)


class NewsroomScenePlan(BaseModel):
    beat: str = Field(max_length=160)
    visual: str = Field(max_length=360)
    narration: str = Field(max_length=700)
    search_terms: list[str] = Field(default_factory=list, max_length=6)
    duration_seconds: int = Field(default=6, ge=1, le=60)


class NewsroomShortsHandoff(BaseModel):
    prompt: str = Field(max_length=2500)
    script: str = Field(max_length=8000)
    search_terms: list[str] = Field(default_factory=list, max_length=12)
    caption: str = Field(default="", max_length=600)
    source_newsroom_job_id: UUID
    source_topic_id: str = Field(max_length=128)
    source_angle_id: str = Field(max_length=128)
    source_package_uri: str = Field(default="", max_length=512)


class NewsroomNarrativePackage(BaseModel):
    topic_id: str = Field(max_length=128)
    angle_id: str = Field(max_length=128)
    title: str = Field(max_length=220)
    prompt: str = Field(max_length=2500)
    hook_options: list[str] = Field(default_factory=list, max_length=5)
    script: str = Field(max_length=8000)
    scene_plan: list[NewsroomScenePlan] = Field(default_factory=list)
    caption_options: list[str] = Field(default_factory=list, max_length=5)
    hashtags: list[str] = Field(default_factory=list, max_length=12)
    search_terms: list[str] = Field(default_factory=list, max_length=12)
    editorial_checks: list[str] = Field(default_factory=list, max_length=10)
    handoff: NewsroomShortsHandoff


class NewsroomPackage(BaseModel):
    id: UUID
    workspace_id: str
    brief: str
    audience: str
    platform: str
    urgency: str
    tone: str
    brand_fit: str
    slate_mode: str
    language: str
    aspect_ratio: AspectRatio
    duration_seconds: int
    generated_at: datetime
    topic_cards: list[NewsroomTopicCard]
    selected_topic_id: str = Field(max_length=128)
    selected_angle_id: str = Field(max_length=128)
    narrative_package: NewsroomNarrativePackage
    narrative_packages: list[NewsroomNarrativePackage] = Field(default_factory=list)
    slate_summary: list[str] = Field(default_factory=list)


class WorkflowResponse(BaseModel):
    job_id: UUID
    status: JobStatus


class JobRecord(BaseModel):
    id: UUID
    workspace_id: str
    kind: WorkflowKind
    status: JobStatus
    language: str
    aspect_ratio: AspectRatio
    output_prefix: str
    input_asset_ids: list[UUID] = Field(default_factory=list)
    output_asset_ids: list[UUID] = Field(default_factory=list)
    error: str | None = None
    created_at: datetime
    updated_at: datetime


class JobDetail(JobRecord):
    events: list[JobEvent] = Field(default_factory=list)
    outputs: list[AssetRecord] = Field(default_factory=list)


class AgentTaskPayload(BaseModel):
    job_id: UUID
    workspace_id: str
    workflow_kind: WorkflowKind
    step: str
    input_asset_ids: list[UUID] = Field(default_factory=list)
    output_prefix: str
    language: str
    aspect_ratio: AspectRatio
    idempotency_key: str
    params: dict[str, Any] = Field(default_factory=dict)


class AgentTaskRecord(BaseModel):
    id: UUID
    kind: AgentTaskKind
    status: JobStatus
    attempts: int
    payload: AgentTaskPayload
    created_at: datetime
    updated_at: datetime
