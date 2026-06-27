"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Download, RefreshCw, SlidersHorizontal, Trash2, WandSparkles } from "lucide-react";
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

export function ShortsForm() {
  const params = useSearchParams();
  const [workspaceId, setWorkspaceId] = useState(params.get("workspace") || defaultWorkspaceId);
  const [workspaceQuery, setWorkspaceQuery] = useState(params.get("workspace") || defaultWorkspaceId);
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [prompt, setPrompt] = useState("Buat video pendek tentang kandungan digital baharu Media Prima.");
  const [language, setLanguage] = useState("ms-MY");
  const [voiceName, setVoiceName] = useState("ms-MY-YasminNeural");
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [duration, setDuration] = useState(30);
  const [jobs, setJobs] = useState<JobDetail[]>([]);
  const [downloadUrls, setDownloadUrls] = useState<Record<string, string>>({});
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

  async function refreshWorkspaces() {
    try {
      setWorkspaces(await apiFetch<WorkspaceRecord[]>(`/workspaces?lane=${lane}`));
    } catch {
      setWorkspaces([]);
    }
  }

  async function ensureSelectedWorkspace(nextWorkspace = workspaceQuery) {
    const trimmed = nextWorkspace.trim();
    if (!trimmed) throw new Error("Workspace is required");
    await apiFetch<WorkspaceRecord>("/workspaces", {
      method: "POST",
      body: JSON.stringify({ workspace_id: trimmed, lane })
    });
    setWorkspaceId(trimmed);
    setWorkspaceQuery(trimmed);
    return trimmed;
  }

  async function useWorkspace(nextWorkspace = workspaceQuery) {
    setBusy(true);
    setMessage("");
    try {
      const selected = await ensureSelectedWorkspace(nextWorkspace);
      await Promise.all([refreshHistory(selected), refreshWorkspaces()]);
      setMessage(`Using workspace ${selected}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create workspace");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    refreshHistory();
    refreshWorkspaces();
  }, []);

  const filteredWorkspaces = useMemo(() => {
    const needle = workspaceQuery.trim().toLowerCase();
    return workspaces
      .filter((workspace) => !needle || workspace.id.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [workspaceQuery, workspaces]);

  const generatedShorts = useMemo(
    () =>
      jobs.flatMap((job) =>
        job.outputs
          .filter((asset) => asset.kind === "generated_short")
          .map((asset) => ({ job, asset }))
      ),
    [jobs]
  );

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
      window.location.assign(`/jobs/${response.job_id}`);
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
              <label htmlFor="workspace">Workspace</label>
              <div className="search-field compact">
                <input
                  id="workspace"
                  value={workspaceQuery}
                  onChange={(event) => setWorkspaceQuery(event.target.value)}
                  placeholder="Search or type a new workspace"
                />
              </div>
              <div className="actions">
                <button className="button secondary" type="button" onClick={() => useWorkspace()} disabled={busy || !workspaceQuery.trim()}>
                  Use/Create
                </button>
                <span className="muted code">{workspaceId}</span>
              </div>
              <div className="workspace-options">
                {filteredWorkspaces.map((workspace) => (
                  <button type="button" key={workspace.id} onClick={() => useWorkspace(workspace.id)}>
                    {workspace.id}
                  </button>
                ))}
              </div>
            </div>
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
            <span>Script</span>
            <span>Search terms</span>
            <span>Media plan</span>
            <span>Voice/Subtitles</span>
            <span>Render review</span>
          </div>
        </aside>
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
