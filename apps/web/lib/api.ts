export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

export type WorkflowResponse = {
  job_id: string;
  status: JobStatus;
};

export type UploadUrlResponse = {
  asset_id: string;
  upload_url: string;
  method: "PUT";
  gcs_uri: string;
};

export type JobEvent = {
  id: string;
  job_id: string;
  step: string;
  message: string;
  payload?: {
    metadata?: Record<string, unknown>;
  };
  created_at: string;
};

export type AssetRecord = {
  id: string;
  kind: string;
  filename: string;
  gcs_uri: string;
  content_type?: string;
  created_at: string;
};

export type JobDetail = {
  id: string;
  workspace_id: string;
  kind: string;
  status: JobStatus;
  language: string;
  aspect_ratio: string;
  output_prefix: string;
  input_asset_ids: string[];
  output_asset_ids: string[];
  error?: string | null;
  created_at: string;
  updated_at: string;
  events: JobEvent[];
  outputs: AssetRecord[];
};

export type WorkspaceRecord = {
  id: string;
  name: string;
  lane?: "video_clipping" | "shorts" | "newsroom" | null;
  created_at: string;
};

export type JobRecord = Omit<JobDetail, "events" | "outputs">;

export type DownloadUrlResponse = {
  asset_id: string;
  download_url: string;
  gcs_uri: string;
};

export type VideoClippingBucketWorkspacesResponse = {
  bucket: string;
  workspaces: string[];
};

export type VideoClippingBucketSyncResponse = {
  bucket: string;
  workspace_id: string;
  imported: number;
  updated: number;
  skipped: number;
  scanned: number;
};

export type NewsroomEvidence = {
  source: string;
  signal: string;
  url?: string | null;
  freshness: string;
  strength: number;
  evidence_kind: string;
};

export type NewsroomAngle = {
  id: string;
  title: string;
  hook: string;
  rationale: string;
  tone: string;
  risk_level: string;
  editorial_note: string;
};

export type NewsroomTopicCard = {
  id: string;
  title: string;
  summary: string;
  rank_score: number;
  urgency: string;
  audience_fit: string;
  platform_fit: string;
  brand_fit: string;
  evidence: NewsroomEvidence[];
  angles: NewsroomAngle[];
  recommended_angle_id: string;
};

export type NewsroomScenePlan = {
  beat: string;
  visual: string;
  narration: string;
  search_terms: string[];
  duration_seconds: number;
};

export type NewsroomShortsHandoff = {
  prompt: string;
  script: string;
  search_terms: string[];
  caption: string;
  source_newsroom_job_id: string;
  source_topic_id: string;
  source_angle_id: string;
  source_package_uri: string;
};

export type NewsroomNarrativePackage = {
  topic_id: string;
  angle_id: string;
  title: string;
  prompt: string;
  hook_options: string[];
  script: string;
  scene_plan: NewsroomScenePlan[];
  caption_options: string[];
  hashtags: string[];
  search_terms: string[];
  editorial_checks: string[];
  handoff: NewsroomShortsHandoff;
};

export type NewsroomPackage = {
  id: string;
  workspace_id: string;
  brief: string;
  audience: string;
  platform: string;
  urgency: string;
  tone: string;
  brand_fit: string;
  slate_mode: string;
  language: string;
  aspect_ratio: string;
  duration_seconds: number;
  generated_at: string;
  topic_cards: NewsroomTopicCard[];
  selected_topic_id: string;
  selected_angle_id: string;
  narrative_package: NewsroomNarrativePackage;
  narrative_packages: NewsroomNarrativePackage[];
  slate_summary: string[];
};

export function apiBase() {
  return process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers || {})
    },
    cache: "no-store"
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `API request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}
