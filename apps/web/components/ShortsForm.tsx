"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Captions,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock3,
  Copy,
  Download,
  Film,
  Mic2,
  RefreshCw,
  Search,
  Trash2,
  Video,
  WandSparkles
} from "lucide-react";
import {
  apiFetch,
  type DownloadUrlResponse,
  type JobDetail,
  type JobRecord,
  type WorkspaceRecord,
  type WorkflowResponse
} from "@/lib/api";
import { StatusPill } from "@/components/StatusPill";

const defaultWorkspaceId = "media-prima-shorts";
const lane = "shorts";
const activeJobStatuses = new Set<JobRecord["status"]>(["queued", "running"]);
const keywordStopwords = new Set([
  "about",
  "after",
  "again",
  "build",
  "builds",
  "can",
  "close",
  "create",
  "explain",
  "first",
  "from",
  "hook",
  "into",
  "latest",
  "make",
  "making",
  "mention",
  "more",
  "package",
  "patch",
  "released",
  "same",
  "short",
  "that",
  "the",
  "then",
  "this",
  "using",
  "video",
  "viewer",
  "with"
]);
const voiceOptionsByLanguage: Record<string, Array<{ value: string; label: string }>> = {
  "ms-MY": [
    { value: "ms-MY-Standard-A", label: "ms-MY-Standard-A" },
    { value: "ms-MY-Standard-B", label: "ms-MY-Standard-B" }
  ],
  "en-MY": [
    { value: "en-US-Neural2-F", label: "en-US-Neural2-F" },
    { value: "en-US-Neural2-D", label: "en-US-Neural2-D" }
  ],
  auto: [
    { value: "ms-MY-Standard-A", label: "ms-MY-Standard-A" },
    { value: "ms-MY-Standard-B", label: "ms-MY-Standard-B" },
    { value: "en-US-Neural2-F", label: "en-US-Neural2-F" },
    { value: "en-US-Neural2-D", label: "en-US-Neural2-D" },
    { value: "cmn-CN-Wavenet-A", label: "cmn-CN-Wavenet-A" }
  ]
};
const pipelineSteps = [
  { title: "Script", detail: "Subject, language, narration", icon: WandSparkles },
  { title: "Search terms", detail: "Keywords and visual intent", icon: Search },
  { title: "Media plan", detail: "Stock or Veo render inputs", icon: Film },
  { title: "Voice/Subtitles", detail: "Dubbing and subtitle style", icon: Mic2 },
  { title: "Render review", detail: "Final checks and generation", icon: Video }
];

type Notice = { kind: "error" | "success" | "info"; message: string } | null;
type RefreshOptions = { preserveNotice?: boolean };
type ShortsView = "create" | "gallery";

function extractKeywordTerms(source: string) {
  const text = source.replace(/\s+/g, " ").trim();
  const candidates: Array<{ index: number; priority: number; term: string }> = [];

  function addCandidate(term: string, index: number, priority: number) {
    const cleanTerm = term.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9.]+$/g, "").trim();
    const firstWord = cleanTerm.split(/\s+/)[0]?.toLowerCase();
    if (!cleanTerm || cleanTerm.length < 3 || keywordStopwords.has(firstWord)) return;
    candidates.push({ index, priority, term: cleanTerm });
  }

  const phrasePattern =
    /\b[A-Z][A-Za-z0-9./-]*(?:\s+(?:[A-Z][A-Za-z0-9./-]*|agent|agents|update|updates|release|dependency|package|build|builds|install|installs|research|model|models)){1,3}\b/g;
  for (const match of text.matchAll(phrasePattern)) {
    addCandidate(match[0], match.index || 0, 0);
  }

  const versionPattern = /\bv?\d+(?:\.\d+){1,}(?:-[A-Za-z0-9.-]+)?\b/g;
  for (const match of text.matchAll(versionPattern)) {
    addCandidate(match[0], match.index || 0, 0);
  }

  const fallbackPattern = /\b[A-Za-z][A-Za-z0-9./-]{3,}\b/g;
  for (const match of text.matchAll(fallbackPattern)) {
    addCandidate(match[0], match.index || 0, 1);
  }

  const seen = new Set<string>();
  const acceptedTerms: string[] = [];
  for (const term of candidates
    .sort((left, right) => left.priority - right.priority || left.index - right.index)
    .map((candidate) => candidate.term)) {
    const key = term.toLowerCase();
    const words = term.split(/\s+/);
    const allStopwords = words.every((word) => keywordStopwords.has(word.toLowerCase()));
    const singleWordAlreadyCovered =
      words.length === 1 && acceptedTerms.some((acceptedTerm) => acceptedTerm.toLowerCase().split(/\s+/).includes(key));
    if (seen.has(key) || allStopwords || singleWordAlreadyCovered) continue;
    seen.add(key);
    acceptedTerms.push(term);
    if (acceptedTerms.length === 5) break;
  }
  return acceptedTerms;
}

export function ShortsForm() {
  const params = useSearchParams();
  const [activeStep, setActiveStep] = useState(0);
  const [workspaceId, setWorkspaceId] = useState(params.get("workspace") || defaultWorkspaceId);
  const [prompt, setPrompt] = useState("Buat video pendek tentang kandungan digital baharu Media Prima.");
  const [script, setScript] = useState("");
  const [keywords, setKeywords] = useState("");
  const [language, setLanguage] = useState("ms-MY");
  const [voiceName, setVoiceName] = useState("ms-MY-Standard-A");
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [duration, setDuration] = useState(30);
  const [videoSource, setVideoSource] = useState("stock");
  const [concatMode, setConcatMode] = useState("random");
  const [transitionMode, setTransitionMode] = useState("none");
  const [maxClipDuration, setMaxClipDuration] = useState(5);
  const [generatedVideoCount, setGeneratedVideoCount] = useState(1);
  const [enableSubtitles, setEnableSubtitles] = useState(true);
  const [subtitleFont, setSubtitleFont] = useState("DejaVuSans-Bold.ttf");
  const [subtitlePosition, setSubtitlePosition] = useState("bottom");
  const [subtitleFontColor, setSubtitleFontColor] = useState("#ffffff");
  const [subtitleFontSize, setSubtitleFontSize] = useState(60);
  const [subtitleOutlineColor, setSubtitleOutlineColor] = useState("#000000");
  const [subtitleOutlineWidth, setSubtitleOutlineWidth] = useState(1.5);
  const [enableDubbing, setEnableDubbing] = useState(true);
  const [ttsServer, setTtsServer] = useState("gcp");
  const [speechVolume, setSpeechVolume] = useState(1);
  const [speechRate, setSpeechRate] = useState(1);
  const [backgroundMusic, setBackgroundMusic] = useState("none");
  const [backgroundMusicVolume, setBackgroundMusicVolume] = useState(0.2);
  const [jobs, setJobs] = useState<JobDetail[]>([]);
  const [downloadUrls, setDownloadUrls] = useState<Record<string, string>>({});
  const [expandedJobId, setExpandedJobId] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [trackedJobId, setTrackedJobId] = useState("");
  const [activeView, setActiveView] = useState<ShortsView>("create");
  const [copiedAssetId, setCopiedAssetId] = useState("");

  async function refreshHistory(nextWorkspace = workspaceId, options: RefreshOptions = {}) {
    if (!options.preserveNotice) setNotice(null);
    try {
      const rows = await apiFetch<JobRecord[]>(`/workspaces/${encodeURIComponent(nextWorkspace)}/jobs?kind=shorts`);
      const details = await Promise.all(rows.slice(0, 8).map((job) => apiFetch<JobDetail>(`/jobs/${job.id}`)));
      setJobs(details);
      const outputAssets = details.flatMap((job) => job.outputs.filter((asset) => asset.kind === "generated_short"));
      const pairs = await Promise.all(
        outputAssets.map(async (asset) => {
          const response = await apiFetch<DownloadUrlResponse>(`/assets/${asset.id}/download-url`);
          return [asset.id, response.download_url] as const;
        })
      );
      setDownloadUrls(Object.fromEntries(pairs));
      return details;
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Unable to load generated shorts" });
      return [];
    }
  }

  async function ensureSelectedWorkspace(nextWorkspace = workspaceId) {
    const trimmed = nextWorkspace.trim();
    if (!trimmed) throw new Error("Workspace is required");
    await apiFetch<WorkspaceRecord>("/workspaces", {
      method: "POST",
      body: JSON.stringify({ workspace_id: trimmed, lane })
    });
    setWorkspaceId(trimmed);
    return trimmed;
  }

  async function switchWorkspace(nextWorkspaceId: string) {
    const nextWorkspace = nextWorkspaceId.trim();
    if (!nextWorkspace || nextWorkspace === workspaceId) return;
    setWorkspaceId(nextWorkspace);
    setJobs([]);
    setDownloadUrls({});
    setExpandedJobId("");
    setNotice(null);
    const searchParams = new URLSearchParams(window.location.search);
    searchParams.set("workspace", nextWorkspace);
    window.history.replaceState(null, "", `/shorts?${searchParams.toString()}`);
    await refreshHistory(nextWorkspace);
  }

  useEffect(() => {
    refreshHistory();
  }, []);

  useEffect(() => {
    if (!trackedJobId) return;
    updateTrackedJobNotice(trackedJobId, jobs);
  }, [jobs, trackedJobId]);

  useEffect(() => {
    if (!jobs.some((job) => activeJobStatuses.has(job.status))) return;
    let isMounted = true;
    const timer = window.setTimeout(async () => {
      const details = await refreshHistory(workspaceId, { preserveNotice: true });
      if (!isMounted || !trackedJobId) return;
      updateTrackedJobNotice(trackedJobId, details);
    }, 2500);
    return () => {
      isMounted = false;
      window.clearTimeout(timer);
    };
  }, [jobs, trackedJobId, workspaceId]);

  const generatedShorts = useMemo(() => {
    const seenUris = new Set<string>();
    return jobs.flatMap((job) =>
      job.outputs
        .filter((asset) => asset.kind === "generated_short")
        .filter((asset) => {
          if (seenUris.has(asset.gcs_uri)) return false;
          seenUris.add(asset.gcs_uri);
          return true;
        })
        .map((asset) => ({ job, asset }))
    );
  }, [jobs]);
  const latestJob = jobs[0];
  const isFinalStep = activeStep === pipelineSteps.length - 1;
  const voiceOptions = voiceOptionsByLanguage[language] || voiceOptionsByLanguage.auto;

  useEffect(() => {
    if (!voiceOptions.some((option) => option.value === voiceName)) {
      setVoiceName(voiceOptions[0].value);
    }
  }, [voiceName, voiceOptions]);

  async function startWorkflow() {
    setBusy(true);
    setNotice(null);
    try {
      const selectedWorkspace = await ensureSelectedWorkspace();
      const response = await apiFetch<WorkflowResponse>("/workflows/shorts", {
        method: "POST",
        body: JSON.stringify({
          workspace_id: selectedWorkspace,
          prompt,
          script: script.trim() || null,
          search_terms: parsedKeywords(),
          language,
          aspect_ratio: aspectRatio,
          voice_name: voiceName,
          video_source: videoSource,
          video_concat_mode: concatMode,
          video_transition_mode: transitionMode,
          max_clip_duration_seconds: maxClipDuration,
          generated_video_count: generatedVideoCount,
          enable_subtitles: enableSubtitles,
          subtitle_font: subtitleFont,
          subtitle_position: subtitlePosition,
          subtitle_font_color: subtitleFontColor,
          subtitle_font_size: subtitleFontSize,
          subtitle_outline_color: subtitleOutlineColor,
          subtitle_outline_width: subtitleOutlineWidth,
          enable_dubbing: enableDubbing,
          tts_server: enableDubbing ? ttsServer : "none",
          speech_volume: speechVolume,
          speech_rate: speechRate,
          background_music: backgroundMusic,
          background_music_volume: backgroundMusicVolume,
          output_prefix: "outputs/shorts",
          duration_seconds: duration
        })
      });
      setTrackedJobId(response.job_id);
      setNotice({ kind: "info", message: `Shorts job queued: ${response.job_id}` });
      const details = await refreshHistory(selectedWorkspace, { preserveNotice: true });
      updateTrackedJobNotice(response.job_id, details);
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Failed to start workflow" });
    } finally {
      setBusy(false);
    }
  }

  async function openDownload(assetId: string) {
    const response = await apiFetch<DownloadUrlResponse>(`/assets/${assetId}/download-url`);
    window.open(response.download_url, "_blank", "noopener,noreferrer");
  }

  async function copyAssetUri(assetId: string, assetUri: string) {
    try {
      await navigator.clipboard.writeText(assetUri);
      setCopiedAssetId(assetId);
      window.setTimeout(() => setCopiedAssetId((current) => (current === assetId ? "" : current)), 1800);
    } catch {
      setNotice({ kind: "error", message: "Unable to copy asset URI" });
    }
  }

  async function deleteGeneratedShort(jobId: string) {
    if (!window.confirm("Delete this generated short and its output assets?")) return;
    setBusy(true);
    setNotice(null);
    try {
      await apiFetch<{ status: string }>(`/jobs/${jobId}`, { method: "DELETE" });
      await refreshHistory();
      setNotice({ kind: "success", message: "Generated short deleted" });
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Unable to delete generated short" });
    } finally {
      setBusy(false);
    }
  }

  function parsedKeywords() {
    return keywords
      .split(",")
      .map((term) => term.trim())
      .filter(Boolean);
  }

  function draftTerms(source = `${prompt} ${script}`) {
    const terms = extractKeywordTerms(source);
    return terms.length ? terms.join(", ") : "Malaysia newsroom, digital media, social video";
  }

  function generateDraftScript() {
    const draftScript = `${prompt}\n\nHook the viewer in the first two seconds, explain the key point clearly, then close with a practical next step.`;
    setScript(draftScript);
  }

  function generateDraftKeywords() {
    setKeywords(draftTerms());
  }

  function toggleJobDetails(jobId: string) {
    setExpandedJobId((current) => (current === jobId ? "" : jobId));
  }

  function updateTrackedJobNotice(jobId: string, details: JobDetail[]) {
    const trackedJob = details.find((job) => job.id === jobId);
    if (trackedJob?.status === "succeeded") {
      setNotice({ kind: "success", message: `Short generated successfully: ${trackedJob.id}` });
      setTrackedJobId("");
      setActiveView("gallery");
      return true;
    }
    if (trackedJob?.status === "failed" || trackedJob?.status === "canceled") {
      setNotice({
        kind: "error",
        message: trackedJob.error || `Shorts job ${trackedJob.status}: ${trackedJob.id}`
      });
      setTrackedJobId("");
      return true;
    }
    return false;
  }

  function isStepComplete(index: number): boolean {
    if (index === 0) return Boolean(script.trim());
    if (index === 1) return parsedKeywords().length > 0;
    if (index === 2) return Boolean(videoSource && aspectRatio && duration >= 10 && maxClipDuration >= 3 && generatedVideoCount >= 1);
    if (index === 3) return (!enableDubbing || Boolean(voiceName)) && (!enableSubtitles || Boolean(subtitleFont));
    return Boolean(prompt.trim() && isStepComplete(0) && isStepComplete(1) && isStepComplete(2) && isStepComplete(3));
  }

  function canAdvanceCurrentStep() {
    if (activeStep === 0) return isStepComplete(0);
    if (activeStep === 1) return isStepComplete(1);
    if (activeStep === 2) return isStepComplete(2);
    if (activeStep === 3) return isStepComplete(3);
    return true;
  }

  function renderBackendForJob(job: JobDetail) {
    for (const event of [...job.events].reverse()) {
      const backend = event.payload?.metadata?.render_backend;
      if (typeof backend === "string" && backend) return backend;
    }
    return "";
  }

  function renderNoteForJob(job: JobDetail) {
    const backend = renderBackendForJob(job);
    if (backend === "local_demo_fallback") {
      return {
        kind: "warning",
        title: "Demo fallback render",
        body: "No stock or Veo source clips were available, so this MP4 is a text-based local demo output."
      };
    }
    if (backend) {
      return {
        kind: "info",
        title: `Render backend: ${backend}`,
        body: "This output was rendered from available workflow media."
      };
    }
    return null;
  }

  return (
    <>
      <section className="topbar">
        <div>
          <div className="eyebrow">Shorts Generator</div>
          <h1>AI social short generation</h1>
          <p className="muted">Follow the pipeline from script to render with Veo, stock media, dubbing, subtitles, and review controls.</p>
        </div>
        <div className="topbar-actions">
          <div className="shorts-view-tabs" role="tablist" aria-label="Shorts generator views">
            <button
              className={`workflow-tab${activeView === "create" ? " active" : ""}`}
              type="button"
              role="tab"
              id="shorts-create-tab"
              aria-selected={activeView === "create"}
              aria-controls="shorts-create-panel"
              onClick={() => setActiveView("create")}
            >
              Create
            </button>
            <button
              className={`workflow-tab${activeView === "gallery" ? " active" : ""}`}
              type="button"
              role="tab"
              id="shorts-gallery-tab"
              aria-selected={activeView === "gallery"}
              aria-controls="shorts-gallery-panel"
              onClick={() => setActiveView("gallery")}
            >
              Gallery
              <span>{generatedShorts.length}</span>
            </button>
          </div>
          <button className="icon-button" onClick={() => refreshHistory()} aria-label="Refresh generated shorts" title="Refresh generated shorts">
            <RefreshCw size={18} />
          </button>
        </div>
      </section>

      {notice ? <AlertBanner notice={notice} /> : null}

      {activeView === "create" ? (
      <section className="wizard-shell shorts-workbench" id="shorts-create-panel" role="tabpanel" aria-labelledby="shorts-create-tab">
        <aside className="wizard-steps" aria-label="Shorts generation pipeline">
          {pipelineSteps.map((step, index) => {
            const Icon = step.icon;
            const isComplete = index < activeStep && isStepComplete(index);
            return (
              <button
                className={`wizard-step${activeStep === index ? " active" : ""}${isComplete ? " complete" : ""}`}
                type="button"
                key={step.title}
                onClick={() => setActiveStep(index)}
                aria-label={`${step.title}, ${isComplete ? "complete" : "incomplete"}`}
              >
                <span className="wizard-step-index" aria-hidden="true">
                  <span className="wizard-step-number">{isComplete ? <CheckCircle2 size={16} /> : index + 1}</span>
                  <Icon size={17} />
                </span>
                <span className="wizard-step-copy">
                  <strong>{step.title}</strong>
                  <small>{step.detail}</small>
                </span>
              </button>
            );
          })}
        </aside>

        <div className="wizard-card">
          <div className="wizard-heading">
            <div>
              <div className="eyebrow">Step {activeStep + 1} of {pipelineSteps.length}</div>
              <h2>{pipelineSteps[activeStep].title}</h2>
            </div>
            <WorkspaceContext workspaceId={workspaceId} onSelectWorkspace={switchWorkspace} />
          </div>

          {activeStep === 0 ? (
            <div className="wizard-content">
              <div className="field">
                <label htmlFor="prompt">Video subject</label>
                <textarea id="prompt" className="compact-textarea" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="language">Language for generating video script</label>
                <select id="language" value={language} onChange={(event) => setLanguage(event.target.value)}>
                  <option value="ms-MY">Malay</option>
                  <option value="en-MY">English</option>
                  <option value="auto">Auto detect</option>
                </select>
              </div>
              <button className="button secondary inline-action" type="button" onClick={generateDraftScript}>
                <WandSparkles size={16} /> Draft script
              </button>
              <div className="field">
                <label htmlFor="script">Video script</label>
                <textarea
                  id="script"
                  className="script-textarea"
                  value={script}
                  onChange={(event) => setScript(event.target.value)}
                  placeholder="Your generated script will appear here. You can also type or edit it manually."
                />
              </div>
            </div>
          ) : null}

          {activeStep === 1 ? (
            <div className="wizard-content">
              <div className="field">
                <label htmlFor="keywords">Video keywords</label>
                <textarea
                  id="keywords"
                  className="compact-textarea"
                  value={keywords}
                  onChange={(event) => setKeywords(event.target.value)}
                  placeholder="Add search terms separated by commas, or generate them from the script."
                />
              </div>
              <button className="button secondary inline-action" type="button" onClick={generateDraftKeywords} disabled={!script.trim()}>
                <WandSparkles size={16} /> Generate search terms from script
              </button>
              <div className="review-grid two-up">
                <div>
                  <span>Keyword count</span>
                  <strong>{parsedKeywords().length}</strong>
                </div>
                <div>
                  <span>Script ready</span>
                  <strong>{script.trim() ? "Yes" : "No"}</strong>
                </div>
              </div>
            </div>
          ) : null}

          {activeStep === 2 ? (
            <div className="wizard-content">
              <div className="field-grid">
                <div className="field">
                  <label htmlFor="video-source">Video source</label>
                  <select id="video-source" value={videoSource} onChange={(event) => setVideoSource(event.target.value)}>
                    <option value="stock">Stock video</option>
                    <option value="veo3">Veo 3 / 3.1 quality</option>
                    <option value="veo3_fast">Veo 3 / 3.1 fast</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="aspect">Video aspect ratio</label>
                  <select id="aspect" value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value)}>
                    <option value="9:16">Portrait 9:16</option>
                    <option value="16:9">Landscape 16:9</option>
                    <option value="1:1">Square 1:1</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="concat">Video concatenation mode</label>
                  <select id="concat" value={concatMode} onChange={(event) => setConcatMode(event.target.value)}>
                    <option value="random">Random concatenation</option>
                    <option value="sequential">Sequential concatenation</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="transition">Video transition mode</label>
                  <select id="transition" value={transitionMode} onChange={(event) => setTransitionMode(event.target.value)}>
                    <option value="none">None</option>
                    <option value="fade">Fade</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="clip-duration">Maximum clip seconds</label>
                  <input id="clip-duration" type="number" min={3} max={30} value={maxClipDuration} onChange={(event) => setMaxClipDuration(Number(event.target.value))} />
                </div>
                <div className="field">
                  <label htmlFor="duration">Final duration seconds</label>
                  <input id="duration" type="number" min={10} max={180} value={duration} onChange={(event) => setDuration(Number(event.target.value))} />
                </div>
                <div className="field">
                  <label htmlFor="count">Videos generated simultaneously</label>
                  <input id="count" type="number" min={1} max={4} value={generatedVideoCount} onChange={(event) => setGeneratedVideoCount(Number(event.target.value))} />
                </div>
              </div>
            </div>
          ) : null}

          {activeStep === 3 ? (
            <div className="wizard-content two-column-content">
              <div className="sub-panel">
                <div className="section-heading">
                  <h3>Voiceover</h3>
                </div>
                <label className="check-row">
                  <input type="checkbox" checked={enableDubbing} onChange={(event) => setEnableDubbing(event.target.checked)} />
                  <span>Enable dubbing / voiceover</span>
                </label>
                <div className="field">
                  <label htmlFor="tts">TTS server</label>
                  <select id="tts" value={ttsServer} onChange={(event) => setTtsServer(event.target.value)} disabled={!enableDubbing}>
                    <option value="gcp">Google Cloud Text-to-Speech</option>
                    <option value="native">Native audio only</option>
                    <option value="none">None</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="voice">Speech synthesis voice</label>
                  <select id="voice" value={voiceName} onChange={(event) => setVoiceName(event.target.value)} disabled={!enableDubbing}>
                    {voiceOptions.map((option) => (
                      <option value={option.value} key={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <SliderField id="volume" label="Speech volume" min={0} max={2} step={0.1} value={speechVolume} onChange={setSpeechVolume} disabled={!enableDubbing} />
                <SliderField id="rate" label="Speech rate" min={0.5} max={2} step={0.1} value={speechRate} onChange={setSpeechRate} disabled={!enableDubbing} />
                <div className="field">
                  <label htmlFor="bgm">Background music</label>
                  <select id="bgm" value={backgroundMusic} onChange={(event) => setBackgroundMusic(event.target.value)}>
                    <option value="none">None</option>
                    <option value="random">Random background music</option>
                  </select>
                </div>
                <SliderField id="bgm-volume" label="Background music volume" min={0} max={1} step={0.05} value={backgroundMusicVolume} onChange={setBackgroundMusicVolume} />
              </div>

              <div className="sub-panel">
                <div className="section-heading">
                  <h3>Subtitles</h3>
                </div>
                <label className="check-row">
                  <input type="checkbox" checked={enableSubtitles} onChange={(event) => setEnableSubtitles(event.target.checked)} />
                  <span>Enable subtitles</span>
                </label>
                <div className="field">
                  <label htmlFor="subtitle-font">Subtitle font</label>
                  <select id="subtitle-font" value={subtitleFont} onChange={(event) => setSubtitleFont(event.target.value)} disabled={!enableSubtitles}>
                    <option value="DejaVuSans-Bold.ttf">DejaVuSans-Bold.ttf</option>
                    <option value="MicrosoftYaHeiBold.ttc">MicrosoftYaHeiBold.ttc</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="subtitle-position">Subtitle position</label>
                  <select id="subtitle-position" value={subtitlePosition} onChange={(event) => setSubtitlePosition(event.target.value)} disabled={!enableSubtitles}>
                    <option value="bottom">Bottom</option>
                    <option value="middle">Middle</option>
                    <option value="top">Top</option>
                  </select>
                </div>
                <div className="swatch-grid">
                  <ColorField id="subtitle-color" label="Subtitle font color" value={subtitleFontColor} onChange={setSubtitleFontColor} disabled={!enableSubtitles} />
                  <ColorField id="outline-color" label="Subtitle outline color" value={subtitleOutlineColor} onChange={setSubtitleOutlineColor} disabled={!enableSubtitles} />
                </div>
                <SliderField id="font-size" label="Subtitle font size" min={24} max={120} step={1} value={subtitleFontSize} onChange={setSubtitleFontSize} disabled={!enableSubtitles} />
                <SliderField id="outline-width" label="Subtitle outline width" min={0} max={10} step={0.5} value={subtitleOutlineWidth} onChange={setSubtitleOutlineWidth} disabled={!enableSubtitles} />
              </div>
            </div>
          ) : null}

          {activeStep === 4 ? (
            <div className="wizard-content">
              <div className="review-grid">
                <div>
                  <span>Source</span>
                  <strong>{videoSource === "stock" ? "Stock video" : videoSource === "veo3" ? "Veo 3 / 3.1 quality" : "Veo 3 / 3.1 fast"}</strong>
                </div>
                <div>
                  <span>Format</span>
                  <strong>{aspectRatio}, {duration}s</strong>
                </div>
                <div>
                  <span>Voice</span>
                  <strong>{enableDubbing ? voiceName : "Disabled"}</strong>
                </div>
                <div>
                  <span>Subtitles</span>
                  <strong>{enableSubtitles ? `${subtitlePosition}, ${subtitleFontSize}px` : "Disabled"}</strong>
                </div>
                <div>
                  <span>Search terms</span>
                  <strong>{parsedKeywords().length || "Auto"}</strong>
                </div>
                <div>
                  <span>Latest job</span>
                  <strong>{latestJob ? latestJob.status : "None"}</strong>
                </div>
              </div>
            </div>
          ) : null}

          <div className="wizard-actions">
            <button className="button secondary" type="button" onClick={() => setActiveStep((step) => Math.max(0, step - 1))} disabled={activeStep === 0 || busy}>
              <ChevronLeft size={16} /> Back
            </button>
            {isFinalStep ? (
              <button className="button primary-cta" onClick={startWorkflow} disabled={busy || !isStepComplete(4)}>
                <WandSparkles size={16} /> Generate Video
              </button>
            ) : (
              <button className="button primary-cta" type="button" onClick={() => setActiveStep((step) => Math.min(pipelineSteps.length - 1, step + 1))} disabled={busy || !canAdvanceCurrentStep()}>
                Next <ChevronRight size={16} />
              </button>
            )}
          </div>
        </div>
      </section>
      ) : null}

      {activeView === "gallery" ? (
      <section className="shorts-gallery" id="shorts-gallery-panel" role="tabpanel" aria-labelledby="shorts-gallery-tab">
        <div className="section-heading gallery-heading">
          <div>
            <h2>Gallery</h2>
            <p className="muted">Review generated shorts, job history, downloads, and technical details.</p>
          </div>
          <button className="button secondary" type="button" onClick={() => setActiveView("create")}>
            <WandSparkles size={16} /> New short
          </button>
        </div>
        <div className="shorts-output-panel" aria-label="Shorts output review">
          <section className="list-panel shorts-jobs-panel">
          <div className="section-heading">
            <h2>Recent shorts jobs</h2>
          </div>
          {jobs.length ? (
            jobs.slice(0, 5).map((job, index) => (
              <JobDetailsToggle
                job={job}
                key={job.id}
                label={index === 0 ? "Latest job" : `Job ${index + 1}`}
                expanded={expandedJobId === job.id}
                onToggle={() => toggleJobDetails(job.id)}
                wide
              />
            ))
          ) : (
            <EmptyState icon="clock" title="No shorts jobs yet" body="Generated jobs will appear here after you render a short." />
          )}
          </section>

          <section className="list-panel shorts-generated-panel">
          <div className="section-heading">
            <h2>Generated shorts</h2>
          </div>
          {generatedShorts.length ? (
            <div className="output-grid compact-output-grid">
              {generatedShorts.map(({ job, asset }) => {
                const renderNote = renderNoteForJob(job);
                return (
                  <article className="output-item shorts-output-item" key={asset.id}>
                    <div className="shorts-output-preview">
                      {downloadUrls[asset.id] ? <video className="video-preview" src={downloadUrls[asset.id]} controls preload="metadata" /> : null}
                    </div>
                    <div className="shorts-output-copy">
                      <h3>{asset.filename}</h3>
                      <p className="muted">{new Date(job.created_at).toLocaleString()}</p>
                      {renderNote ? (
                        <div className={`render-note ${renderNote.kind}`}>
                          {renderNote.kind === "warning" ? <AlertTriangle size={17} /> : <CheckCircle2 size={17} />}
                          <span>
                            <strong>{renderNote.title}</strong>
                            <span>{renderNote.body}</span>
                          </span>
                        </div>
                      ) : null}
                      <details className="asset-details">
                        <summary>Advanced details</summary>
                        <p className="code">{asset.gcs_uri}</p>
                      </details>
                    </div>
                    <div className="actions shorts-output-actions">
                      <StatusPill status={job.status} />
                      <button
                        className="icon-button"
                        onClick={() => copyAssetUri(asset.id, asset.gcs_uri)}
                        aria-label={copiedAssetId === asset.id ? "Asset URI copied" : "Copy asset URI"}
                        title={copiedAssetId === asset.id ? "Asset URI copied" : "Copy asset URI"}
                      >
                        {copiedAssetId === asset.id ? <CheckCircle2 size={18} /> : <Copy size={18} />}
                      </button>
                      <button className="icon-button" onClick={() => openDownload(asset.id)} aria-label="Download output" title="Download output">
                        <Download size={18} />
                      </button>
                      <button
                        className="icon-button danger"
                        onClick={() => deleteGeneratedShort(job.id)}
                        disabled={busy}
                        aria-label="Delete generated short"
                        title="Delete generated short"
                      >
                        <Trash2 size={18} />
                      </button>
                      <Link className="button secondary" href={`/jobs/${job.id}`}>
                        Job
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState icon="video" title="No generated shorts yet" body="Final MP4 outputs will appear here with preview, status, and download actions." />
          )}
          </section>
        </div>
      </section>
      ) : null}
    </>
  );
}

function AlertBanner({ notice }: { notice: NonNullable<Notice> }) {
  const Icon = notice.kind === "error" ? AlertCircle : notice.kind === "info" ? Clock3 : CheckCircle2;
  return (
    <div className={`alert-banner ${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>
      <Icon size={18} />
      <strong>{notice.kind === "error" ? "Action needed" : notice.kind === "success" ? "Success" : "Status"}</strong>
      <span>{notice.message}</span>
    </div>
  );
}

function WorkspaceContext({ workspaceId, onSelectWorkspace }: { workspaceId: string; onSelectWorkspace: (workspaceId: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const filteredWorkspaces = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return workspaces.filter(
      (workspace) =>
        workspace.lane === "shorts" &&
        (!needle || workspace.id.toLowerCase().includes(needle) || workspace.name.toLowerCase().includes(needle))
    );
  }, [query, workspaces]);

  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    setIsLoading(true);
    apiFetch<WorkspaceRecord[]>("/workspaces?lane=shorts")
      .then((rows) => {
        if (isMounted) setWorkspaces(rows.filter((workspace) => workspace.lane === "shorts"));
      })
      .catch(() => {
        if (isMounted) setWorkspaces([]);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  function chooseWorkspace(nextWorkspaceId: string) {
    onSelectWorkspace(nextWorkspaceId);
    setIsOpen(false);
    setQuery("");
  }

  return (
    <div className="workspace-context">
      <button className="workspace-switcher-button" type="button" onClick={() => setIsOpen((current) => !current)} aria-expanded={isOpen}>
        <Search size={15} />
        <span>Workspace</span>
        <strong>{workspaceId}</strong>
      </button>
      {isOpen ? (
        <div className="workspace-popover align-right" role="dialog" aria-label="Choose shorts workspace">
          <div className="search-field compact">
            <Search size={16} />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search shorts workspaces"
            />
          </div>
          <div className="workspace-result-list">
            {isLoading ? <div className="empty-state compact-empty">Loading workspaces...</div> : null}
            {!isLoading && filteredWorkspaces.length ? (
              filteredWorkspaces.slice(0, 10).map((workspace) => (
                <button
                  className={workspace.id === workspaceId ? "workspace-result active" : "workspace-result"}
                  type="button"
                  key={workspace.id}
                  onClick={() => chooseWorkspace(workspace.id)}
                >
                  <strong>{workspace.name}</strong>
                  {workspace.name !== workspace.id ? <small>{workspace.id}</small> : null}
                </button>
              ))
            ) : null}
            {!isLoading && !filteredWorkspaces.length ? (
              <div className="empty-state compact-empty">No shorts workspaces found.</div>
            ) : null}
          </div>
          <Link className="workspace-manage-link" href="/workspaces">
            Manage workspaces
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function SliderField({
  id,
  label,
  min,
  max,
  step,
  value,
  onChange,
  disabled = false
}: {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="field slider-field">
      <label htmlFor={id}>{label}</label>
      <div className="slider-control">
        <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} disabled={disabled} />
        <input
          aria-label={`${label} value`}
          className="number-mini"
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

function ColorField({
  id,
  label,
  value,
  onChange,
  disabled = false
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="field color-field">
      <label htmlFor={id}>{label}</label>
      <div className="color-control">
        <input id={id} type="color" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} />
        <input aria-label={`${label} hex value`} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} />
      </div>
    </div>
  );
}

function EmptyState({ icon, title, body }: { icon: "clock" | "video"; title: string; body: string }) {
  const Icon = icon === "clock" ? Clock3 : Captions;
  return (
    <div className="empty-state polished-empty">
      <span className="empty-icon">
        <Icon size={24} />
      </span>
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}

function JobDetailsToggle({
  job,
  label,
  expanded,
  onToggle,
  wide = false
}: {
  job: JobDetail;
  label: string;
  expanded: boolean;
  onToggle: () => void;
  wide?: boolean;
}) {
  const Icon = expanded ? ChevronUp : ChevronDown;
  const latestEvent = job.events[job.events.length - 1];
  const createdAt = new Date(job.created_at).toLocaleString();
  const panelId = `job-details-${job.id}`;

  return (
    <article className={wide ? "job-details-row wide" : "job-details-row"}>
      <button
        className="job-details-toggle"
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        aria-label={`${expanded ? "Collapse" : "Expand"} ${label}: ${job.status}, created ${createdAt}`}
      >
        <span className="job-details-title">
          {wide ? <CheckCircle2 size={16} /> : null}
          <strong>{label}</strong>
          <small>{createdAt}</small>
        </span>
        <StatusPill status={job.status} />
        <Icon size={16} />
      </button>
      {expanded ? (
        <div className="job-details-panel" id={panelId}>
          <div className="job-detail-grid">
            <span>
              <strong>ID</strong>
              <small>{job.id}</small>
            </span>
            <span>
              <strong>Updated</strong>
              <small>{new Date(job.updated_at).toLocaleString()}</small>
            </span>
            <span>
              <strong>Outputs</strong>
              <small>{job.outputs.length}</small>
            </span>
          </div>
          {job.error ? <p className="job-error">{job.error}</p> : null}
          {latestEvent ? (
            <div className="job-event-summary">
              <strong>{latestEvent.step}</strong>
              <span>{latestEvent.message}</span>
            </div>
          ) : (
            <p className="muted">No events recorded yet.</p>
          )}
          {job.outputs.length ? (
            <div className="job-output-list">
              {job.outputs.slice(0, 3).map((asset) => (
                <span key={asset.id}>
                  <strong>{asset.filename}</strong>
                  <small>{asset.kind}</small>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
