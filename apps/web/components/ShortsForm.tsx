"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Download, RefreshCw, SlidersHorizontal, Trash2, WandSparkles } from "lucide-react";
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
const pipelineSteps = ["Script", "Search terms", "Media plan", "Voice/Subtitles", "Render review"];

export function ShortsForm() {
  const params = useSearchParams();
  const [workspaceId, setWorkspaceId] = useState(params.get("workspace") || defaultWorkspaceId);
  const [prompt, setPrompt] = useState("Buat video pendek tentang kandungan digital baharu Media Prima.");
  const [language, setLanguage] = useState("ms-MY");
  const [voiceName, setVoiceName] = useState("ms-MY-YasminNeural");
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [duration, setDuration] = useState(30);
  const [jobs, setJobs] = useState<JobDetail[]>([]);
  const [downloadUrls, setDownloadUrls] = useState<Record<string, string>>({});
  const [expandedJobId, setExpandedJobId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function refreshHistory(nextWorkspace = workspaceId) {
    setMessage("");
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
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load generated shorts");
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

  useEffect(() => {
    refreshHistory();
  }, []);

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

  async function startWorkflow() {
    setBusy(true);
    setMessage("");
    try {
      const selectedWorkspace = await ensureSelectedWorkspace();
      const response = await apiFetch<WorkflowResponse>("/workflows/shorts", {
        method: "POST",
        body: JSON.stringify({
          workspace_id: selectedWorkspace,
          prompt,
          language,
          aspect_ratio: aspectRatio,
          voice_name: voiceName,
          output_prefix: "outputs/shorts",
          duration_seconds: duration
        })
      });
      await refreshHistory(selectedWorkspace);
      setMessage(`Shorts job queued: ${response.job_id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to start workflow");
    } finally {
      setBusy(false);
    }
  }

  async function openDownload(assetId: string) {
    const response = await apiFetch<DownloadUrlResponse>(`/assets/${assetId}/download-url`);
    window.open(response.download_url, "_blank", "noopener,noreferrer");
  }

  async function deleteGeneratedShort(jobId: string) {
    if (!window.confirm("Delete this generated short and its output assets?")) return;
    setBusy(true);
    setMessage("");
    try {
      await apiFetch<{ status: string }>(`/jobs/${jobId}`, { method: "DELETE" });
      await refreshHistory();
      setMessage("Generated short deleted");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete generated short");
    } finally {
      setBusy(false);
    }
  }

  function showLatestJobStatus(step: string) {
    if (!latestJob) return;
    setExpandedJobId((current) => (current === latestJob.id ? "" : latestJob.id));
    setMessage(`${step}: latest shorts job ${latestJob.id} is ${latestJob.status}.`);
  }

  function toggleJobDetails(jobId: string) {
    setExpandedJobId((current) => (current === jobId ? "" : jobId));
  }

  return (
    <>
      <section className="topbar">
        <div>
          <div className="eyebrow">Shorts Generator</div>
          <h1>Prompt or approved package to rendered short</h1>
          <p className="muted">A dedicated lane for scripts, search terms, media planning, voice, subtitles, BGM, rendering, and output review.</p>
        </div>
        <button className="icon-button" onClick={() => refreshHistory()} aria-label="Refresh generated shorts" title="Refresh generated shorts">
          <RefreshCw size={18} />
        </button>
      </section>

      <section className="split-layout">
        <div className="form-panel wide-panel">
          <div className="section-heading">
            <h2>Prompt</h2>
            <p className="muted">Start from a direct brief or preserve an approved newsroom angle, script, and search terms.</p>
          </div>
          <WorkspaceContext workspaceId={workspaceId} />
          <div className="field">
            <label htmlFor="prompt">Video subject / prompt</label>
            <textarea id="prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
          </div>

          <div className="section-heading">
            <h2>Configuration</h2>
            <p className="muted">These settings map to the script, voice, aspect, duration, and render plan.</p>
          </div>
          <div className="field-grid">
            <div className="field">
              <label htmlFor="language">Language</label>
              <select id="language" value={language} onChange={(event) => setLanguage(event.target.value)}>
                <option value="ms-MY">Malay</option>
                <option value="en-MY">English</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="voice">Voice</label>
              <select id="voice" value={voiceName} onChange={(event) => setVoiceName(event.target.value)}>
                <option value="ms-MY-YasminNeural">Malay female</option>
                <option value="ms-MY-OsmanNeural">Malay male</option>
                <option value="en-MY-YasminNeural">English/Malaysia fallback</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="aspect">Aspect ratio</label>
              <select id="aspect" value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value)}>
                <option value="9:16">9:16 portrait</option>
                <option value="16:9">16:9 landscape</option>
                <option value="1:1">1:1 square</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="duration">Duration seconds</label>
              <input id="duration" type="number" min={10} max={180} value={duration} onChange={(event) => setDuration(Number(event.target.value))} />
            </div>
          </div>
          <div className="actions">
            <button className="button" onClick={startWorkflow} disabled={busy || !prompt}>
              <WandSparkles size={16} /> Generate short
            </button>
          </div>
          {message ? <p className="muted code">{message}</p> : null}
        </div>

        <aside className="side-panel">
          <div className="side-heading">
            <SlidersHorizontal size={18} />
            <h2>Pipeline</h2>
          </div>
          <div className="pipeline-list">
            {pipelineSteps.map((step, index) => (
              <button className="pipeline-step" type="button" key={step} onClick={() => showLatestJobStatus(step)} disabled={!latestJob}>
                <span className="step-number">{index + 1}</span>
                <span>{step}</span>
                {latestJob ? <StatusPill status={latestJob.status} /> : null}
              </button>
            ))}
          </div>
          <div className="pipeline-job-list">
            {jobs.slice(0, 5).map((job, index) => (
              <JobDetailsToggle
                job={job}
                key={job.id}
                label={index === 0 ? "Latest job" : `Job ${index + 1}`}
                expanded={expandedJobId === job.id}
                onToggle={() => toggleJobDetails(job.id)}
              />
            ))}
            {!jobs.length ? <p className="muted">No shorts jobs yet.</p> : null}
          </div>
        </aside>
      </section>

      <section className="list-panel">
        <div className="section-heading">
          <h2>Recent shorts jobs</h2>
          <p className="muted">Track queued, running, failed, and completed jobs without leaving this page.</p>
        </div>
        {jobs.length ? (
          jobs.slice(0, 8).map((job) => (
            <JobDetailsToggle
              job={job}
              key={job.id}
              label={job.id}
              expanded={expandedJobId === job.id}
              onToggle={() => toggleJobDetails(job.id)}
              wide
            />
          ))
        ) : (
          <div className="empty-state">No shorts jobs yet for this workspace.</div>
        )}
      </section>

      <section className="list-panel">
        <div className="section-heading">
          <h2>Generated shorts</h2>
          <p className="muted">Final MP4 outputs from this workspace appear here after each job completes.</p>
        </div>
        {generatedShorts.length ? (
          <div className="output-grid">
            {generatedShorts.map(({ job, asset }) => (
              <article className="output-item" key={asset.id}>
                <div>
                  {downloadUrls[asset.id] ? <video className="video-preview" src={downloadUrls[asset.id]} controls preload="metadata" /> : null}
                  <h3>{asset.filename}</h3>
                  <p className="muted">{new Date(job.created_at).toLocaleString()}</p>
                  <p className="code">{asset.gcs_uri}</p>
                </div>
                <div className="actions">
                  <StatusPill status={job.status} />
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
            ))}
          </div>
        ) : (
          <div className="empty-state">No generated shorts yet for this workspace.</div>
        )}
      </section>
    </>
  );
}

function WorkspaceContext({ workspaceId }: { workspaceId: string }) {
  return (
    <div className="workspace-context">
      <span>
        Workspace <strong>{workspaceId}</strong>
      </span>
      <Link href="/workspaces">Change</Link>
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

  return (
    <article className={wide ? "job-details-row wide" : "job-details-row"}>
      <button className="job-details-toggle" type="button" onClick={onToggle} aria-expanded={expanded}>
        <span className="job-details-title">
          {wide ? <CheckCircle2 size={16} /> : null}
          <strong>{label}</strong>
          <small>{new Date(job.created_at).toLocaleString()}</small>
        </span>
        <StatusPill status={job.status} />
        <Icon size={16} />
      </button>
      {expanded ? (
        <div className="job-details-panel">
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
