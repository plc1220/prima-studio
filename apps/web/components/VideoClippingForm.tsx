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

const productionStages = [
  { id: "split", label: "Ingest", legacy: "Video Split", output: "Source footage", icon: <UploadCloud size={17} /> },
  { id: "metadata", label: "Analyze", legacy: "Metadata Generation", output: "Scene intelligence", icon: <WandSparkles size={17} /> },
  { id: "clips", label: "Select", legacy: "Clip Generation", output: "Candidate clips", icon: <Scissors size={17} /> },
  { id: "joining", label: "Assemble", legacy: "Video Joining", output: "Storyboard cut", icon: <ListChecks size={17} /> },
  { id: "ai", label: "Export", legacy: "AI Clip Generation", output: "Review package", icon: <Video size={17} /> }
] as const;

type StageId = (typeof productionStages)[number]["id"];

const artifactKinds = [
  { kind: "source_video", label: "Sources", icon: <FileVideo size={16} /> },
  { kind: "segment", label: "Segments", icon: <Layers size={16} /> },
  { kind: "metadata", label: "Scene JSON", icon: <FileJson size={16} /> },
  { kind: "clip", label: "Clips", icon: <Film size={16} /> },
  { kind: "final_video", label: "Finals", icon: <Video size={16} /> }
] as const;

const sceneInsights = [
  {
    timecode: "00:00:08",
    title: "Doctor sets the concern",
    summary: "Clear setup, strong context, useful as the opening beat.",
    speaker: "Doctor",
    score: 82
  },
  {
    timecode: "00:01:12",
    title: "Practical next step explained",
    summary: "Best candidate for short-form clarity and trust.",
    speaker: "Doctor",
    score: 91
  },
  {
    timecode: "00:02:03",
    title: "Patient reaction beat",
    summary: "Useful transition into emotional payoff.",
    speaker: "Patient",
    score: 74
  }
];

const clipCandidates = [
  {
    duration: "0:26",
    title: "Key explanation for digital audience",
    reason: "Concise explanation, clean speaker focus, low setup cost.",
    tags: ["Hook", "Malay", "9:16"],
    score: 91
  },
  {
    duration: "0:16",
    title: "Reaction bridge",
    reason: "Human beat that creates emotional continuity before the final CTA.",
    tags: ["Reaction", "Bridge", "1:1"],
    score: 74
  }
];

const storyboardBeats = [
  { label: "Hook", range: "00:00:08 - 00:00:24" },
  { label: "Explanation", range: "00:01:12 - 00:01:38" },
  { label: "Reaction", range: "00:02:03 - 00:02:19" }
];

export function VideoClippingForm() {
  const params = useSearchParams();
  const [workspaceId, setWorkspaceId] = useState(params.get("workspace") || defaultWorkspaceId);
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
  const [activeStage, setActiveStage] = useState<StageId>("split");
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
    refreshWorkspace();
  }, []);

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
  const activeStageMeta = productionStages.find((stage) => stage.id === activeStage) || productionStages[0];

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
      await refreshWorkspace(selectedWorkspace);
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
      await refreshWorkspace(selectedWorkspace);
      setMessage(`Video-clipping job queued: ${response.job_id}`);
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

  async function syncBucketWorkspace(nextWorkspace = workspaceId) {
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
      setWorkspaceId(selectedWorkspace);
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
      <section className="studio-command">
        <div>
          <div className="eyebrow">Video Clipping Lane</div>
          <h1>Owned footage to reviewable social cuts</h1>
          <p className="muted">
            Work from a source video through scene intelligence, clip candidates, storyboard assembly, and final export while keeping every artifact traceable.
          </p>
        </div>
        <div className="command-actions">
          <button className="icon-button" onClick={() => refreshWorkspace()} aria-label="Refresh workspace" title="Refresh workspace">
            <RefreshCw size={18} />
          </button>
          <button className="button" type="button" onClick={startWorkflow} disabled={busy || !assetId}>
            <PlayCircle size={16} /> Run cut
          </button>
        </div>
      </section>

      <WorkspaceContext workspaceId={workspaceId} />

      <section className="clipping-workstation" aria-label="Video clipping workstation">
        <aside className="clip-stage-rail" aria-label="Production stages">
          <div className="rail-heading">
            <strong>Prima Studio</strong>
            <span>Production flow</span>
          </div>
          {productionStages.map((stage) => (
            <button
              type="button"
              key={stage.id}
              className={activeStage === stage.id ? "production-stage active" : "production-stage"}
              onClick={() => setActiveStage(stage.id)}
            >
              <span className="stage-icon">{stage.icon}</span>
              <span>
                <strong>{stage.label}</strong>
                <small>{stage.output}</small>
              </span>
            </button>
          ))}
        </aside>

        <main className="review-surface">
          <div className="review-surface-header">
            <div>
              <div className="eyebrow">{activeStageMeta.legacy}</div>
              <h2>{activeStageMeta.label}: {activeStageMeta.output}</h2>
            </div>
            <span className="timecode">00:01:12:04</span>
          </div>

          <div className="video-review-canvas">
            <div className="video-frame">
              <div className="video-frame-copy">
                <span>{selectedAsset?.filename || filename}</span>
                <strong>{selectedAsset ? "Source locked" : "Awaiting source selection"}</strong>
              </div>
              <div className="video-playhead"><span /></div>
            </div>
            <div className="review-meta-strip">
              <span><strong>{sourceAssets.length}</strong> sources</span>
              <span><strong>{metadataAssets.length || sceneInsights.length}</strong> scene signals</span>
              <span><strong>{clipAssets.length || clipCandidates.length}</strong> candidates</span>
              <span><strong>{finalVideoAssets.length}</strong> finals</span>
            </div>
          </div>

          {renderActiveStage()}
        </main>

        <aside className="assembly-panel" aria-label="Storyboard and export">
          <div>
            <div className="eyebrow">Assemble</div>
            <h2>Storyboard</h2>
          </div>
          <div className="storyboard-list">
            {storyboardBeats.map((beat, index) => (
              <div className="storyboard-card" key={beat.label}>
                <strong>{index + 1}. {beat.label}</strong>
                <span>{beat.range}</span>
              </div>
            ))}
          </div>
          <div className="export-summary">
            <strong>58s review cut</strong>
            <span>Fits TikTok, Reels, Shorts, and Media Prima social review.</span>
          </div>
          <button className="button" type="button" onClick={startWorkflow} disabled={busy || !assetId}>
            <Video size={16} /> Export review cut
          </button>
          {latestJob ? (
            <Link className="button secondary" href={`/jobs/${latestJob.id}`}>
              Open latest job
            </Link>
          ) : null}
        </aside>
      </section>

      <section className="provenance-drawer">
        <div className="side-heading">
          <ClipboardCheck size={18} />
          <h2>Provenance and workspace control</h2>
        </div>
        <div className="provenance-grid">
          <div className="bucket-sync">
            <div className="field">
              <label htmlFor="bucket-name">Existing GCS bucket</label>
              <input id="bucket-name" value={bucketName} onChange={(event) => setBucketName(event.target.value)} />
            </div>
            <div className="actions">
              <button className="button secondary" type="button" onClick={loadBucketWorkspaces} disabled={bucketBusy || !bucketName.trim()}>
                Inspect
              </button>
              <button className="button secondary" type="button" onClick={() => syncBucketWorkspace()} disabled={bucketBusy || !bucketName.trim() || !workspaceId.trim()}>
                Sync workspace
              </button>
            </div>
            {bucketWorkspaces.length ? (
              <div className="workspace-options compact-options">
                {bucketWorkspaces.slice(0, 8).map((workspace) => (
                  <button type="button" key={workspace} onClick={() => syncBucketWorkspace(workspace)}>
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
            <span>Scene intelligence</span>
            <span>Candidate clips</span>
            <span>Storyboard cut</span>
            <span>Final export</span>
          </div>
        </div>
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
    if (activeStage === "metadata") return renderAnalyzeStage();
    if (activeStage === "clips") return renderSelectStage();
    if (activeStage === "joining") return renderAssembleStage();
    if (activeStage === "ai") return renderExportStage();
    return renderIngestStage();
  }

  function renderIngestStage() {
    return (
      <div className="production-grid three">
        <Panel title="Source Footage">
          <div className="upload-drop editorial-upload">
            <UploadCloud size={28} />
            <strong>Upload owned footage</strong>
            <span className="muted">MP4, MOV, or broadcast exports for clipping review.</span>
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
            <label htmlFor="filename">Register filename</label>
            <input id="filename" value={filename} onChange={(event) => setFilename(event.target.value)} />
          </div>
          <button className="button secondary" type="button" onClick={registerOrUploadAsset} disabled={busy || (!filename && !file)}>
            <UploadCloud size={16} /> {file ? "Upload source" : "Register source"}
          </button>
          {selectedAsset ? <SelectedAsset asset={selectedAsset} /> : null}
        </Panel>

        <Panel title="Workspace Sources">
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
            {filteredSourceAssets.slice(0, 6).map((asset) => (
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
          <button className="button" type="button" onClick={startWorkflow} disabled={busy || !assetId}>
            <PlayCircle size={16} /> Start analysis workflow
          </button>
          {message ? <p className="muted code">{message}</p> : null}
        </Panel>
      </div>
    );
  }

  function renderAnalyzeStage() {
    return (
      <div className="production-grid two">
        <Panel title="Scene Intelligence">
          <div className="scene-intelligence-list">
            {sceneInsights.map((scene) => (
              <div className="scene-intelligence-row" key={scene.timecode}>
                <span className="timecode">{scene.timecode}</span>
                <span>
                  <strong>{scene.title}</strong>
                  <small>{scene.speaker} - {scene.summary}</small>
                </span>
                <strong className="signal-score">{scene.score}</strong>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Metadata Controls">
          <div className="field">
            <label htmlFor="metadata-prompt">Analysis prompt</label>
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
          <button className="button" type="button" onClick={startWorkflow} disabled={busy || !assetId}>
            <WandSparkles size={16} /> Generate scene intelligence
          </button>
          {metadataAssets.length ? <AssetTable assets={metadataAssets} emptyLabel="No metadata JSON has been generated yet." /> : null}
        </Panel>
      </div>
    );
  }

  function renderSelectStage() {
    return (
      <div className="production-grid two">
        <Panel title="AI Clip Candidates">
          <div className="clip-candidate-grid">
            {clipCandidates.map((candidate) => (
              <article className="clip-candidate-card" key={candidate.title}>
                <div className="clip-thumb" />
                <div className="clip-candidate-body">
                  <div className="chip-row">
                    <span className="chip signal">{candidate.score} score</span>
                    <span className="chip">{candidate.duration}</span>
                    {candidate.tags.map((tag) => <span className="chip" key={tag}>{tag}</span>)}
                  </div>
                  <h3>{candidate.title}</h3>
                  <p>Why this clip: {candidate.reason}</p>
                  <div className="actions">
                    <button className="button secondary" type="button">Preview</button>
                    <button className="button" type="button" disabled title="Clip-stage endpoint required">
                      Add to storyboard
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </Panel>

        <Panel title="Selected Clip Assets">
          <AssetTable assets={clipAssets} emptyLabel="Clip assets will appear after clip generation." />
          <button className="button" type="button" disabled title="Clip-stage endpoint required">
            <Scissors size={16} /> Generate selected clips
          </button>
        </Panel>
      </div>
    );
  }

  function renderAssembleStage() {
    return (
      <div className="production-grid two">
        <Panel title="Clip Order">
          <div className="storyboard-strip">
            {storyboardBeats.map((beat, index) => (
              <div className="storyboard-card" key={beat.label}>
                <strong>{index + 1}. {beat.label}</strong>
                <span>{beat.range}</span>
              </div>
            ))}
          </div>
          <AssetTable assets={clipAssets} emptyLabel="Clip assets will appear after manual clip generation." />
          <button className="button" type="button" disabled title="Join-stage endpoint required">
            <ListChecks size={16} /> Join selected clips
          </button>
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

  function renderExportStage() {
    return (
      <div className="production-grid two">
        <Panel title="AI Review Package">
          <div className="field">
            <label htmlFor="ai-prompt">Clip plan prompt</label>
            <textarea id="ai-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
          </div>
          <div className="review-grid">
            <ReviewItem label="Input" value="Scene intelligence" />
            <ReviewItem label="Review gate" value="Editable AI clip plan" />
            <ReviewItem label="Default output" value={`${aspectRatio} final review cut`} />
          </div>
          <div className="actions">
            <button className="button" type="button" disabled title="AI-plan endpoint required">
              <Bot size={16} /> Generate AI plan
            </button>
            <button className="button secondary" type="button" onClick={startWorkflow} disabled={busy || !assetId}>
              <PlayCircle size={16} /> Run current cut
            </button>
          </div>
        </Panel>

        <Panel title="Export Provenance">
          <AssetTable assets={finalVideoAssets.length ? finalVideoAssets : metadataAssets} emptyLabel="Final exports and metadata will appear here." />
          <div className="approval-card">
            <strong>Approval trail</strong>
            <span>{"Source video > scene intelligence > reviewed storyboard > final render"}</span>
          </div>
        </Panel>
      </div>
    );
  }

  function Panel({ title, children }: { title: string; children: React.ReactNode }) {
    return (
      <article className="stage-panel editorial-panel">
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
