"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  CheckCircle2,
  ClipboardCheck,
  FileJson,
  FileVideo,
  Film,
  Layers,
  ListChecks,
  PlayCircle,
  RefreshCw,
  Search,
  Scissors,
  UploadCloud,
  Video,
  WandSparkles
} from "lucide-react";
import {
  apiFetch,
  type AssetRecord,
  type JobRecord,
  type UploadUrlResponse,
  type VideoClippingBucketSyncResponse,
  type VideoClippingBucketWorkspacesResponse,
  type WorkflowResponse,
  type WorkspaceRecord
} from "@/lib/api";
import { StatusPill } from "@/components/StatusPill";

const defaultWorkspaceId = "media-prima-video-clipping";
const lane = "video_clipping";

const clipTabs = [
  { id: "split", label: "Video Split", output: "Segment assets", icon: <Scissors size={17} /> },
  { id: "metadata", label: "Metadata Generation", output: "Consolidated JSON", icon: <FileJson size={17} /> },
  { id: "clips", label: "Clip Generation", output: "Clip assets", icon: <Film size={17} /> },
  { id: "joining", label: "Video Joining", output: "Final video", icon: <Video size={17} /> },
  { id: "ai", label: "AI Clip Generation", output: "Editable clip plan", icon: <Bot size={17} /> }
] as const;

type ClipTabId = (typeof clipTabs)[number]["id"];

const artifactKinds = [
  { kind: "source_video", label: "Source videos", icon: <FileVideo size={16} /> },
  { kind: "segment", label: "Segments", icon: <Layers size={16} /> },
  { kind: "metadata", label: "Metadata JSON", icon: <FileJson size={16} /> },
  { kind: "clip", label: "Clips", icon: <Scissors size={16} /> },
  { kind: "final_video", label: "Final videos", icon: <Video size={16} /> }
] as const;

export function VideoClippingForm() {
  const params = useSearchParams();
  const [workspaceId, setWorkspaceId] = useState(params.get("workspace") || defaultWorkspaceId);
  const [workspaceQuery, setWorkspaceQuery] = useState(params.get("workspace") || defaultWorkspaceId);
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [assetQuery, setAssetQuery] = useState("");
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [filename, setFilename] = useState("sample-broadcast.mp4");
  const [file, setFile] = useState<File | null>(null);
  const [assetId, setAssetId] = useState("");
  const [language, setLanguage] = useState("ms-MY");
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [segmentDuration, setSegmentDuration] = useState(60);
  const [outputPrefix, setOutputPrefix] = useState("outputs/video-clipping");
  const [prompt, setPrompt] = useState("Create a social cut suitable for Media Prima digital audiences.");
  const [activeTab, setActiveTab] = useState<ClipTabId>("split");
  const [bucketName, setBucketName] = useState("mp-ai-video-clipping-bucket");
  const [bucketWorkspaces, setBucketWorkspaces] = useState<string[]>([]);
  const [bucketMessage, setBucketMessage] = useState("");
  const [bucketBusy, setBucketBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function refreshWorkspace(nextWorkspace = workspaceId) {
    setMessage("");
    try {
      const [assetRows, jobRows] = await Promise.all([
        apiFetch<AssetRecord[]>(`/workspaces/${encodeURIComponent(nextWorkspace)}/assets`),
        apiFetch<JobRecord[]>(`/workspaces/${encodeURIComponent(nextWorkspace)}/jobs?kind=video_clipping`)
      ]);
      setAssets(assetRows);
      setJobs(jobRows);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load workspace");
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
      await Promise.all([refreshWorkspace(selected), refreshWorkspaces()]);
      setMessage(`Using workspace ${selected}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create workspace");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    refreshWorkspace();
    refreshWorkspaces();
  }, []);

  const filteredWorkspaces = useMemo(() => {
    const needle = workspaceQuery.trim().toLowerCase();
    return workspaces
      .filter((workspace) => !needle || workspace.id.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [workspaceQuery, workspaces]);

  const assetsByKind = useMemo(() => {
    return assets.reduce<Record<string, AssetRecord[]>>((groups, asset) => {
      groups[asset.kind] = [...(groups[asset.kind] || []), asset];
      return groups;
    }, {});
  }, [assets]);

  const sourceAssets = assetsByKind.source_video || [];
  const segmentAssets = assetsByKind.segment || [];
  const metadataAssets = assetsByKind.metadata || [];
  const clipAssets = assetsByKind.clip || [];
  const finalVideoAssets = assetsByKind.final_video || [];
  const selectedAsset = sourceAssets.find((asset) => asset.id === assetId);
  const latestJob = jobs[0];

  const filteredSourceAssets = useMemo(() => {
    const needle = assetQuery.trim().toLowerCase();
    return sourceAssets.filter(
      (asset) => !needle || asset.filename.toLowerCase().includes(needle) || asset.gcs_uri.toLowerCase().includes(needle)
    );
  }, [sourceAssets, assetQuery]);

  async function registerOrUploadAsset() {
    setBusy(true);
    setMessage("");
    try {
      const selectedWorkspace = await ensureSelectedWorkspace();
      const uploadFilename = file?.name || filename;
      const contentType = file?.type || "video/mp4";
      const response = await apiFetch<UploadUrlResponse>("/assets/upload-url", {
        method: "POST",
        body: JSON.stringify({
          workspace_id: selectedWorkspace,
          filename: uploadFilename,
          content_type: contentType,
          kind: "source_video"
        })
      });
      if (file) {
        const upload = await fetch(response.upload_url, {
          method: "PUT",
          headers: { "content-type": contentType },
          body: file
        });
        if (!upload.ok) throw new Error(`Upload failed: ${upload.status}`);
      }
      setAssetId(response.asset_id);
      setFilename(uploadFilename);
      await Promise.all([refreshWorkspace(selectedWorkspace), refreshWorkspaces()]);
      setMessage(file ? `Uploaded ${uploadFilename}.` : `Registered source asset ${response.asset_id}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to register asset");
    } finally {
      setBusy(false);
    }
  }

  async function startWorkflow() {
    setBusy(true);
    setMessage("");
    try {
      const selectedWorkspace = await ensureSelectedWorkspace();
      const response = await apiFetch<WorkflowResponse>("/workflows/video-clipping", {
        method: "POST",
        body: JSON.stringify({
          workspace_id: selectedWorkspace,
          source_asset_ids: [assetId],
          language,
          aspect_ratio: aspectRatio,
          segment_duration_seconds: segmentDuration,
          output_prefix: outputPrefix,
          prompt
        })
      });
      window.location.assign(`/jobs/${response.job_id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to start workflow");
    } finally {
      setBusy(false);
    }
  }

  async function loadBucketWorkspaces() {
    setBucketBusy(true);
    setBucketMessage("");
    try {
      const response = await apiFetch<VideoClippingBucketWorkspacesResponse>(
        `/integrations/video-clipping-bucket/workspaces?bucket=${encodeURIComponent(bucketName)}`
      );
      setBucketWorkspaces(response.workspaces);
      setBucketMessage(response.workspaces.length ? `Found ${response.workspaces.length} workspace folders.` : "No workspace folders found or bucket is not accessible.");
    } catch (error) {
      setBucketMessage(error instanceof Error ? error.message : "Unable to inspect bucket");
    } finally {
      setBucketBusy(false);
    }
  }

  async function syncBucketWorkspace(nextWorkspace = workspaceQuery) {
    setBucketBusy(true);
    setBucketMessage("");
    try {
      const selectedWorkspace = await ensureSelectedWorkspace(nextWorkspace);
      const response = await apiFetch<VideoClippingBucketSyncResponse>("/integrations/video-clipping-bucket/sync", {
        method: "POST",
        body: JSON.stringify({
          bucket: bucketName,
          workspace_id: selectedWorkspace
        })
      });
      await refreshWorkspace(selectedWorkspace);
      setBucketMessage(
        `Synced ${response.workspace_id}: ${response.imported} imported, ${response.updated} updated, ${response.skipped} skipped.`
      );
    } catch (error) {
      setBucketMessage(error instanceof Error ? error.message : "Unable to sync bucket workspace");
    } finally {
      setBucketBusy(false);
    }
  }

  return (
    <>
      <section className="topbar production-topbar">
        <div>
          <div className="eyebrow">Video Clipping Lane</div>
          <h1>Owned footage to reviewable cuts</h1>
          <p className="muted">
            Split source videos, generate metadata, build clips, join finals, and keep every artifact traceable to its workspace.
          </p>
        </div>
        <button className="icon-button" onClick={() => refreshWorkspace()} aria-label="Refresh workspace" title="Refresh workspace">
          <RefreshCw size={18} />
        </button>
      </section>

      <section className="workflow-tabs" role="tablist" aria-label="Video clipping stages">
        {clipTabs.map((tab, index) => (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? "workflow-tab active" : "workflow-tab"}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="step-number">{index + 1}</span>
            <span className="workflow-tab-main">
              <strong>
                {tab.icon}
                {tab.label}
              </strong>
              <small>{tab.output}</small>
            </span>
          </button>
        ))}
      </section>

      <section className="stage-shell">
        <div className="stage-main">{renderActiveStage()}</div>
        <aside className="side-panel artifact-panel">
          <div className="side-heading">
            <ClipboardCheck size={18} />
            <h2>Artifact Inventory</h2>
          </div>
          <div className="bucket-sync">
            <div className="field">
              <label htmlFor="bucket-name">Existing GCS bucket</label>
              <input id="bucket-name" value={bucketName} onChange={(event) => setBucketName(event.target.value)} />
            </div>
            <div className="actions">
              <button className="button secondary" type="button" onClick={loadBucketWorkspaces} disabled={bucketBusy || !bucketName.trim()}>
                Inspect
              </button>
              <button className="button secondary" type="button" onClick={() => syncBucketWorkspace()} disabled={bucketBusy || !bucketName.trim() || !workspaceQuery.trim()}>
                Sync workspace
              </button>
            </div>
            {bucketWorkspaces.length ? (
              <div className="workspace-options compact-options">
                {bucketWorkspaces.slice(0, 8).map((workspace) => (
                  <button
                    type="button"
                    key={workspace}
                    onClick={() => {
                      setWorkspaceQuery(workspace);
                      setWorkspaceId(workspace);
                    }}
                  >
                    {workspace}
                  </button>
                ))}
              </div>
            ) : null}
            {bucketMessage ? <p className="muted code">{bucketMessage}</p> : null}
          </div>
          <div className="artifact-counts">
            {artifactKinds.map((item) => (
              <div className="artifact-count" key={item.kind}>
                <span>
                  {item.icon}
                  {item.label}
                </span>
                <strong>{assetsByKind[item.kind]?.length || 0}</strong>
              </div>
            ))}
          </div>
          <div className="pipeline-list">
            <span>Source video</span>
            <span>Segment assets</span>
            <span>Metadata JSON</span>
            <span>Clips or AI plan</span>
            <span>Final video</span>
          </div>
          {latestJob ? (
            <Link className="job-row compact-job-row" href={`/jobs/${latestJob.id}`}>
              <span>
                <strong>Latest job</strong>
                <small>{new Date(latestJob.created_at).toLocaleString()}</small>
              </span>
              <StatusPill status={latestJob.status} />
            </Link>
          ) : (
            <p className="muted">No clipping jobs yet.</p>
          )}
        </aside>
      </section>

      <section className="list-panel">
        <div className="section-heading">
          <h2>Recent video-clipping jobs</h2>
          <p className="muted">Open a job to review events, output assets, provenance, and rendered videos.</p>
        </div>
        {jobs.length ? (
          jobs.slice(0, 8).map((job) => (
            <Link className="job-row" href={`/jobs/${job.id}`} key={job.id}>
              <span className="job-kind">
                <CheckCircle2 size={16} />
                {job.id}
              </span>
              <span>{new Date(job.created_at).toLocaleString()}</span>
              <StatusPill status={job.status} />
            </Link>
          ))
        ) : (
          <div className="empty-state">No video-clipping jobs yet.</div>
        )}
      </section>
    </>
  );

  function renderActiveStage() {
    if (activeTab === "metadata") return renderMetadataStage();
    if (activeTab === "clips") return renderClipStage();
    if (activeTab === "joining") return renderJoiningStage();
    if (activeTab === "ai") return renderAiStage();
    return renderSplitStage();
  }

  function renderSplitStage() {
    return (
      <div className="stage-grid three-column">
        <Panel title="Source Video">
          <div className="field">
            <label htmlFor="workspace">Workspace</label>
            <div className="search-field compact">
              <Search size={16} />
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

          <div className="upload-drop">
            <UploadCloud size={28} />
            <strong>Upload video file</strong>
            <input
              id="file"
              type="file"
              accept="video/*"
              onChange={(event) => {
                const selected = event.target.files?.[0] || null;
                setFile(selected);
                if (selected) setFilename(selected.name);
              }}
            />
          </div>

          <div className="field">
            <label htmlFor="source-search">Existing source video</label>
            <div className="search-field compact">
              <Search size={16} />
              <input
                id="source-search"
                value={assetQuery}
                onChange={(event) => setAssetQuery(event.target.value)}
                placeholder="Search source assets"
              />
            </div>
            <div className="asset-list compact-asset-list">
              {filteredSourceAssets.slice(0, 5).map((asset) => (
                <button
                  className={asset.id === assetId ? "asset-item selected" : "asset-item"}
                  type="button"
                  key={asset.id}
                  onClick={() => setAssetId(asset.id)}
                >
                  <FileVideo size={16} />
                  <span>
                    <strong>{asset.filename}</strong>
                    <small>{asset.gcs_uri}</small>
                  </span>
                </button>
              ))}
              {!filteredSourceAssets.length ? <p className="muted">No source videos found in this workspace.</p> : null}
            </div>
          </div>

          <div className="field">
            <label htmlFor="filename">Or register filename</label>
            <input id="filename" value={filename} onChange={(event) => setFilename(event.target.value)} />
          </div>

          <div className="actions">
            <button className="button secondary" type="button" onClick={registerOrUploadAsset} disabled={busy || (!filename && !file)}>
              <UploadCloud size={16} /> {file ? "Upload source" : "Register source"}
            </button>
          </div>
          {selectedAsset ? <SelectedAsset asset={selectedAsset} /> : null}
        </Panel>

        <Panel title="Split Settings">
          <div className="field">
            <label htmlFor="asset">Selected source asset ID</label>
            <input id="asset" value={assetId} onChange={(event) => setAssetId(event.target.value)} />
          </div>
          <div className="field-grid compact-grid">
            <div className="field">
              <label htmlFor="duration">Segment duration</label>
              <input
                id="duration"
                type="number"
                min={10}
                max={600}
                value={segmentDuration}
                onChange={(event) => setSegmentDuration(Number(event.target.value))}
              />
            </div>
            <div className="field">
              <label htmlFor="aspect">Aspect ratio</label>
              <select id="aspect" value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value)}>
                <option value="9:16">9:16 portrait</option>
                <option value="16:9">16:9 landscape</option>
                <option value="1:1">1:1 square</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="output-prefix">Output prefix</label>
            <input id="output-prefix" value={outputPrefix} onChange={(event) => setOutputPrefix(event.target.value)} />
          </div>
          <div className="actions">
            <button className="button" type="button" onClick={startWorkflow} disabled={busy || !assetId}>
              <PlayCircle size={16} /> Start workflow
            </button>
          </div>
          {message ? <p className="muted code">{message}</p> : null}
        </Panel>

        <Panel title="Split Results">
          <AssetTable assets={segmentAssets} emptyLabel="No segment assets in this workspace yet." />
        </Panel>
      </div>
    );
  }

  function renderMetadataStage() {
    return (
      <div className="stage-grid three-column">
        <Panel title="Segments">
          <AssetTable assets={segmentAssets} emptyLabel="Segment assets will appear after the split stage." />
        </Panel>

        <Panel title="Gemini Settings">
          <div className="field">
            <label htmlFor="metadata-prompt">Metadata prompt</label>
            <textarea id="metadata-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
          </div>
          <div className="field-grid compact-grid">
            <div className="field">
              <label htmlFor="language">Language</label>
              <select id="language" value={language} onChange={(event) => setLanguage(event.target.value)}>
                <option value="ms-MY">Malay</option>
                <option value="en-MY">English</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="metadata-output-prefix">Output prefix</label>
              <input id="metadata-output-prefix" value={outputPrefix} onChange={(event) => setOutputPrefix(event.target.value)} />
            </div>
          </div>
          <div className="actions">
            <button className="button" type="button" onClick={startWorkflow} disabled={busy || !assetId}>
              <WandSparkles size={16} /> Generate metadata and render
            </button>
          </div>
          {message ? <p className="muted code">{message}</p> : null}
        </Panel>

        <Panel title="Metadata Preview">
          <AssetTable assets={metadataAssets} emptyLabel="No metadata JSON has been generated yet." />
        </Panel>
      </div>
    );
  }

  function renderClipStage() {
    return (
      <div className="stage-grid two-column">
        <Panel title="Reviewed Metadata">
          <AssetTable assets={metadataAssets} emptyLabel="Generate metadata before selecting clip rows." />
        </Panel>

        <Panel title="Manual Clip Plan">
          <div className="review-grid">
            <ReviewItem label="Input" value="Selected metadata rows" />
            <ReviewItem label="Edit" value="Start and end timestamps" />
            <ReviewItem label="Output" value="Clip assets" />
          </div>
          <div className="timeline-table">
            <div className="timeline-row header">
              <span>Source</span>
              <span>Start</span>
              <span>End</span>
              <span>Status</span>
            </div>
            <div className="timeline-row muted">
              <span>metadata row</span>
              <span>00:00:00</span>
              <span>00:00:00</span>
              <span>Awaiting selection</span>
            </div>
          </div>
          <div className="actions">
            <button className="button" type="button" disabled title="Clip-stage endpoint required">
              <Scissors size={16} /> Generate selected clips
            </button>
          </div>
        </Panel>
      </div>
    );
  }

  function renderJoiningStage() {
    return (
      <div className="stage-grid two-column">
        <Panel title="Clip Order">
          <AssetTable assets={clipAssets} emptyLabel="Clip assets will appear after manual clip generation." />
          <div className="actions">
            <button className="button" type="button" disabled title="Join-stage endpoint required">
              <ListChecks size={16} /> Join selected clips
            </button>
          </div>
        </Panel>

        <Panel title="Final Outputs">
          <AssetTable assets={finalVideoAssets} emptyLabel="Final video outputs will appear here after render." />
          {latestJob ? (
            <Link className="button secondary inline-action" href={`/jobs/${latestJob.id}`}>
              Open latest job
            </Link>
          ) : null}
        </Panel>
      </div>
    );
  }

  function renderAiStage() {
    return (
      <div className="stage-grid two-column">
        <Panel title="AI Clip Brief">
          <div className="field">
            <label htmlFor="ai-prompt">Clip plan prompt</label>
            <textarea id="ai-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
          </div>
          <div className="review-grid">
            <ReviewItem label="Input" value="Metadata JSON" />
            <ReviewItem label="Review gate" value="Editable AI clip plan" />
            <ReviewItem label="Default output" value="Approved final video" />
          </div>
          <div className="actions">
            <button className="button" type="button" disabled title="AI-plan endpoint required">
              <Bot size={16} /> Generate AI clip plan
            </button>
            <button className="button secondary" type="button" onClick={startWorkflow} disabled={busy || !assetId}>
              <PlayCircle size={16} /> Run current AI-assisted cut
            </button>
          </div>
        </Panel>

        <Panel title="Plan And Provenance">
          <AssetTable assets={metadataAssets} emptyLabel="Metadata JSON is required before an AI plan can preserve provenance." />
          <div className="approval-card">
            <strong>Approval trail</strong>
            <span>{"Source video > metadata JSON > reviewed plan > final render"}</span>
          </div>
        </Panel>
      </div>
    );
  }

  function Panel({ title, children }: { title: string; children: React.ReactNode }) {
    return (
      <article className="stage-panel">
        <div className="panel-heading">
          <h2>{title}</h2>
        </div>
        {children}
      </article>
    );
  }

  function SelectedAsset({ asset }: { asset: AssetRecord }) {
    return (
      <div className="selected-asset">
        <FileVideo size={16} />
        <span>
          <strong>{asset.filename}</strong>
          <small>{asset.gcs_uri}</small>
        </span>
      </div>
    );
  }

  function ReviewItem({ label, value }: { label: string; value: string }) {
    return (
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    );
  }

  function AssetTable({ assets: rows, emptyLabel }: { assets: AssetRecord[]; emptyLabel: string }) {
    if (!rows.length) return <div className="empty-state compact-empty">{emptyLabel}</div>;

    return (
      <div className="asset-table">
        <div className="asset-table-row header">
          <span>Kind</span>
          <span>Filename</span>
          <span>Created</span>
        </div>
        {rows.slice(0, 8).map((asset) => (
          <div className="asset-table-row" key={asset.id}>
            <span>{asset.kind}</span>
            <span>
              <strong>{asset.filename}</strong>
              <small>{asset.gcs_uri}</small>
            </span>
            <span>{new Date(asset.created_at).toLocaleString()}</span>
          </div>
        ))}
      </div>
    );
  }
}
