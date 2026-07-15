"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  CheckCircle2,
  Download,
  FileVideo,
  PlayCircle,
  RefreshCw,
  Search,
  Trash2,
  UploadCloud,
  Video,
  WandSparkles
} from "lucide-react";
import {
  apiFetch,
  type AssetRecord,
  type DownloadUrlResponse,
  type JobDetail,
  type JobRecord,
  type UploadUrlResponse,
  type WorkflowResponse,
  type WorkspaceRecord
} from "@/lib/api";
import { StatusPill } from "@/components/StatusPill";

const defaultWorkspaceId = "media-prima-video-clipping";
const lane = "video_clipping";

type HighlightCandidate = {
  id: string;
  range: string;
  startSeconds: number;
  endSeconds: number;
  title: string;
  rationale: string;
  tone: string;
  category: string;
  sourceAssetId: string;
  raw: Record<string, unknown>;
};

export function VideoClippingForm() {
  const params = useSearchParams();
  const sourceVideoRef = useRef<HTMLVideoElement>(null);
  const previewEndTimeRef = useRef<number | null>(null);
  const [workspaceId, setWorkspaceId] = useState(params.get("workspace") || defaultWorkspaceId);
  const [assetQuery, setAssetQuery] = useState("");
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [filename, setFilename] = useState("sample-broadcast.mp4");
  const [file, setFile] = useState<File | null>(null);
  const [assetId, setAssetId] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [downloadUrls, setDownloadUrls] = useState<Record<string, string>>({});
  const [language, setLanguage] = useState("ms-MY");
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [exportMode, setExportMode] = useState<"individual" | "joined">("individual");
  const [segmentDuration, setSegmentDuration] = useState(60);
  const [outputPrefix, setOutputPrefix] = useState("outputs/video-clipping");
  const [prompt, setPrompt] = useState("Create a social cut suitable for Media Prima digital audiences.");
  const [busy, setBusy] = useState(false);
  const [uploadingSource, setUploadingSource] = useState(false);
  const [deletingAssetId, setDeletingAssetId] = useState("");
  const [deletingSourceId, setDeletingSourceId] = useState("");
  const [message, setMessage] = useState("");
  const [highlightsMessage, setHighlightsMessage] = useState("");
  const [highlightCandidates, setHighlightCandidates] = useState<HighlightCandidate[]>([]);
  const [selectedHighlightIds, setSelectedHighlightIds] = useState<string[]>([]);
  const [activePreviewCandidateId, setActivePreviewCandidateId] = useState("");
  const [metadataJson, setMetadataJson] = useState("");
  const [sourceDrawerOpen, setSourceDrawerOpen] = useState(true);
  const [expandedJobId, setExpandedJobId] = useState("");
  const [jobDetailsById, setJobDetailsById] = useState<Record<string, JobDetail>>({});
  const [jobDetailBusy, setJobDetailBusy] = useState("");
  const [jobDetailMessage, setJobDetailMessage] = useState("");

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
  const metadataAssets = [...(assetsByKind.metadata || [])].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const clipAssets = assetsByKind.clip || [];
  const finalVideoAssets = [...(assetsByKind.final_video || [])].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const selectedAsset = sourceAssets.find((asset) => asset.id === assetId);
  const workflowReady = Boolean(assetId);
  const latestFinalVideo = finalVideoAssets[0];
  const latestFinalVideoUrl = latestFinalVideo ? downloadUrls[latestFinalVideo.id] : "";
  const latestMetadata = metadataAssets[0];
  const selectedHighlights = highlightCandidates.filter((candidate) => selectedHighlightIds.includes(candidate.id));

  const filteredSourceAssets = useMemo(() => {
    const needle = assetQuery.trim().toLowerCase();
    return sourceAssets.filter(
      (asset) => !needle || asset.filename.toLowerCase().includes(needle) || asset.gcs_uri.toLowerCase().includes(needle)
    );
  }, [sourceAssets, assetQuery]);

  async function registerOrUploadAsset() {
    setUploadingSource(true);
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
      setMessage(error instanceof Error ? error.message : "Failed to upload source");
    } finally {
      setUploadingSource(false);
    }
  }

  useEffect(() => {
    if (assetId || !sourceAssets.length) return;
    setAssetId(sourceAssets[0].id);
  }, [assetId, sourceAssets]);

  useEffect(() => {
    let isMounted = true;
    setPreviewUrl("");
    setPreviewError("");
    previewEndTimeRef.current = null;
    if (!selectedAsset) return;

    apiFetch<DownloadUrlResponse>(`/assets/${selectedAsset.id}/download-url`)
      .then((response) => {
        if (isMounted) setPreviewUrl(response.download_url);
      })
      .catch(() => {
        if (isMounted) setPreviewError("Preview unavailable. Source is still selected for analysis.");
      });

    return () => {
      isMounted = false;
    };
  }, [selectedAsset]);

  useEffect(() => {
    const video = sourceVideoRef.current;
    if (!video) return;

    function stopAtCandidateEnd() {
      const endTime = previewEndTimeRef.current;
      if (endTime === null || !video) return;
      if (video.currentTime >= endTime) {
        video.pause();
        video.currentTime = endTime;
        previewEndTimeRef.current = null;
        setActivePreviewCandidateId("");
      }
    }

    function clearCandidatePreview() {
      previewEndTimeRef.current = null;
      setActivePreviewCandidateId("");
    }

    video.addEventListener("timeupdate", stopAtCandidateEnd);
    video.addEventListener("seeking", stopAtCandidateEnd);
    video.addEventListener("ended", clearCandidatePreview);
    return () => {
      video.removeEventListener("timeupdate", stopAtCandidateEnd);
      video.removeEventListener("seeking", stopAtCandidateEnd);
      video.removeEventListener("ended", clearCandidatePreview);
    };
  }, [previewUrl]);

  useEffect(() => {
    let isMounted = true;
    const missingAssets = [...metadataAssets, ...finalVideoAssets].filter((asset) => !downloadUrls[asset.id]);
    if (!missingAssets.length) return;

    Promise.allSettled(
      missingAssets.map(async (asset) => {
        const response = await apiFetch<DownloadUrlResponse>(`/assets/${asset.id}/download-url`);
        return [asset.id, response.download_url] as const;
      })
    ).then((results) => {
      if (!isMounted) return;
      const nextEntries = results
        .filter((result): result is PromiseFulfilledResult<readonly [string, string]> => result.status === "fulfilled")
        .map((result) => result.value);
      if (nextEntries.length) {
        setDownloadUrls((current) => ({ ...current, ...Object.fromEntries(nextEntries) }));
      }
    });

    return () => {
      isMounted = false;
    };
  }, [downloadUrls, finalVideoAssets, metadataAssets]);

  useEffect(() => {
    let isMounted = true;
    setHighlightsMessage("");
    setHighlightCandidates([]);
    setSelectedHighlightIds([]);
    setActivePreviewCandidateId("");
    setMetadataJson("");
    if (!latestMetadata || !downloadUrls[latestMetadata.id]) return;

    fetch(downloadUrls[latestMetadata.id], { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`Unable to load highlights: ${response.status}`);
        return response.json();
      })
      .then((payload) => {
        if (!isMounted) return;
        setMetadataJson(JSON.stringify(payload, null, 2));
        const rows = Array.isArray(payload) ? payload : [payload];
        const candidates = rows
          .map((row, index) => parseHighlightCandidate(row, index))
          .filter((candidate): candidate is HighlightCandidate => {
            if (!candidate) return false;
            return !selectedAsset || !candidate.sourceAssetId || candidate.sourceAssetId === selectedAsset.id;
          });
        setHighlightCandidates(candidates);
        setSelectedHighlightIds(candidates.map((candidate) => candidate.id));
        if (!candidates.length) setHighlightsMessage("No highlight candidates found for this source yet.");
      })
      .catch((error) => {
        if (isMounted) setHighlightsMessage(error instanceof Error ? error.message : "Unable to load highlights.");
      });

    return () => {
      isMounted = false;
    };
  }, [downloadUrls, latestMetadata, selectedAsset]);

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
      setExpandedJobId(response.job_id);
      setMessage(`Highlight analysis queued: ${response.job_id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to start workflow");
    } finally {
      setBusy(false);
    }
  }

  async function exportSelectedHighlights() {
    setBusy(true);
    setMessage("");
    try {
      const selectedWorkspace = await ensureSelectedWorkspace();
      if (!selectedHighlights.length) throw new Error("Select at least one highlight to export.");
      const response = await apiFetch<WorkflowResponse>("/workflows/video-clipping/render-selection", {
        method: "POST",
        body: JSON.stringify({
          workspace_id: selectedWorkspace,
          source_asset_id: selectedAsset?.id,
          highlights: selectedHighlights.map((candidate, index) => ({
            ...candidate.raw,
            rank: index + 1,
            source_asset_id: candidate.sourceAssetId || selectedAsset?.id,
            source_uri: String(candidate.raw.source_uri || selectedAsset?.gcs_uri || ""),
            source_filename: String(candidate.raw.source_filename || selectedAsset?.filename || ""),
            timestamp_start_end: candidate.range,
          })),
          language,
          aspect_ratio: aspectRatio,
          output_prefix: outputPrefix,
          render_mode: exportMode,
        })
      });
      await refreshWorkspace(selectedWorkspace);
      setExpandedJobId(response.job_id);
      setMessage(`Selected shorts export queued: ${response.job_id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to export selected highlights");
    } finally {
      setBusy(false);
    }
  }

  function previewHighlight(candidate: HighlightCandidate) {
    const video = sourceVideoRef.current;
    if (!video || !previewUrl) {
      setMessage("Select or upload the source video to preview this highlight.");
      return;
    }
    setMessage("");
    setActivePreviewCandidateId(candidate.id);
    previewEndTimeRef.current = candidate.endSeconds;

    const playRange = () => {
      video.currentTime = candidate.startSeconds;
      video.play().catch(() => {
        setMessage("Preview could not autoplay. Press play on the source review video to continue this candidate range.");
      });
    };

    if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
      video.addEventListener("loadedmetadata", playRange, { once: true });
      video.load();
      return;
    }

    playRange();
  }

  function toggleHighlight(candidateId: string) {
    setSelectedHighlightIds((current) =>
      current.includes(candidateId) ? current.filter((id) => id !== candidateId) : [...current, candidateId]
    );
  }

  async function switchWorkspace(nextWorkspaceId: string) {
    const nextWorkspace = nextWorkspaceId.trim();
    if (!nextWorkspace || nextWorkspace === workspaceId) return;
    setWorkspaceId(nextWorkspace);
    setAssetId("");
    setFile(null);
    setPreviewUrl("");
    setPreviewError("");
    setDownloadUrls({});
    setHighlightCandidates([]);
    setSelectedHighlightIds([]);
    setActivePreviewCandidateId("");
    setMetadataJson("");
    setMessage("");
    window.history.replaceState(null, "", `/video-clipping?workspace=${encodeURIComponent(nextWorkspace)}`);
    await refreshWorkspace(nextWorkspace);
  }

  async function toggleJobDetail(jobId: string) {
    const nextExpanded = expandedJobId === jobId ? "" : jobId;
    setExpandedJobId(nextExpanded);
    setJobDetailMessage("");
    if (!nextExpanded || jobDetailsById[jobId]) return;

    await loadJobDetail(jobId);
  }

  async function loadJobDetail(jobId: string) {
    setJobDetailMessage("");
    setJobDetailBusy(jobId);
    try {
      const detail = await apiFetch<JobDetail>(`/jobs/${jobId}`);
      setJobDetailsById((current) => ({ ...current, [jobId]: detail }));
    } catch (error) {
      setJobDetailMessage(error instanceof Error ? error.message : "Unable to load job details");
    } finally {
      setJobDetailBusy("");
    }
  }

  async function deleteGeneratedAsset(asset: AssetRecord) {
    const confirmed = window.confirm(`Delete ${assetDisplayName(asset)} from this workspace?`);
    if (!confirmed) return;

    setDeletingAssetId(asset.id);
    setMessage("");
    try {
      await apiFetch<{ status: string }>(`/assets/${asset.id}`, { method: "DELETE" });
      setDownloadUrls((current) => {
        const next = { ...current };
        delete next[asset.id];
        return next;
      });
      await refreshWorkspace();
      setMessage(`Deleted ${assetDisplayName(asset)}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete generated asset");
    } finally {
      setDeletingAssetId("");
    }
  }

  async function deleteSourceAsset(asset: AssetRecord) {
    const confirmed = window.confirm(`Delete source video ${assetDisplayName(asset)} from this workspace? Generated outputs will not be deleted.`);
    if (!confirmed) return;

    setDeletingSourceId(asset.id);
    setMessage("");
    try {
      await apiFetch<{ status: string }>(`/assets/${asset.id}`, { method: "DELETE" });
      if (asset.id === assetId) {
        const nextSource = sourceAssets.find((candidate) => candidate.id !== asset.id);
        setAssetId(nextSource?.id || "");
      }
      setPreviewUrl("");
      setPreviewError("");
      await refreshWorkspace();
      setMessage(`Deleted source video ${assetDisplayName(asset)}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete source video");
    } finally {
      setDeletingSourceId("");
    }
  }

  return (
    <>
      <section className="studio-command">
        <div>
          <div className="eyebrow">Video Clipping Lane</div>
          <h1>Prepare clips from one source video</h1>
          <p className="muted">
            Pick footage from this workspace, find candidate moments, then export the selected shorts as MP4s.
          </p>
        </div>
        <div className="command-actions">
          <button className="icon-button" onClick={() => refreshWorkspace()} aria-label="Refresh workspace" title="Refresh workspace">
            <RefreshCw size={18} />
          </button>
        </div>
      </section>

      <WorkspaceContext workspaceId={workspaceId} onSelectWorkspace={switchWorkspace} />

      <section className={sourceDrawerOpen ? "clipping-flow" : "clipping-flow source-drawer-collapsed"} aria-label="Video clipping workflow">
        <aside className="clipping-source-panel" aria-label="Source footage">
          <button
            className="source-drawer-tab"
            type="button"
            onClick={() => setSourceDrawerOpen((current) => !current)}
            aria-expanded={sourceDrawerOpen}
            title={sourceDrawerOpen ? "Hide source drawer" : "Show source drawer"}
          >
            <FileVideo size={18} />
            <span>{selectedAsset ? assetDisplayName(selectedAsset) : "Source"}</span>
          </button>

          {sourceDrawerOpen ? (
          <section className="source-video-panel">
            <header className="source-video-heading">
              <span>
                <strong>Source Video</strong>
                <small>{selectedAsset ? assetDisplayName(selectedAsset) : file ? file.name : "No episode selected"}</small>
              </span>
              <button className="icon-button" type="button" onClick={() => setSourceDrawerOpen(false)} aria-label="Collapse source drawer" title="Collapse source drawer">
                <ChevronDown size={18} />
              </button>
            </header>

            <div className="source-video-body">
              {selectedAsset ? (
                <div className="selected-source-card">
                  <FileVideo size={18} />
                  <span>
                    <strong>{assetDisplayName(selectedAsset)}</strong>
                    <small>{shortStoragePath(selectedAsset.gcs_uri, selectedAsset)}</small>
                  </span>
                  <button
                    className="icon-button danger source-delete-button"
                    type="button"
                    onClick={() => deleteSourceAsset(selectedAsset)}
                    disabled={deletingSourceId === selectedAsset.id}
                    aria-label={`Delete source video ${assetDisplayName(selectedAsset)}`}
                    title="Delete source video"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ) : null}

              <div className={selectedAsset ? "upload-drop compact-upload source-change-drop" : "upload-drop editorial-upload compact-upload"}>
                {uploadingSource ? <span className="loading-spinner" aria-hidden="true" /> : <UploadCloud size={selectedAsset ? 18 : 24} />}
                <strong>{selectedAsset ? "Replace source" : "Upload source video"}</strong>
                <span className="upload-filename">{uploadingSource ? `Uploading ${file?.name || "source"}...` : file ? file.name : "No file chosen"}</span>
                <label className={uploadingSource ? "button secondary file-picker-button disabled" : "button secondary file-picker-button"} htmlFor="file">
                  Choose file
                </label>
                <input
                  id="file"
                  className="native-file-input"
                  type="file"
                  accept="video/*"
                  disabled={uploadingSource}
                  onChange={(event) => {
                    const selected = event.target.files?.[0] || null;
                    setFile(selected);
                    if (selected) setFilename(selected.name);
                  }}
                />
              </div>

              {file ? (
                <button className="button secondary" type="button" onClick={registerOrUploadAsset} disabled={uploadingSource}>
                  {uploadingSource ? <span className="loading-spinner small" aria-hidden="true" /> : <UploadCloud size={16} />}
                  {uploadingSource ? "Uploading..." : "Upload source"}
                </button>
              ) : null}

              {sourceAssets.length > 1 ? (
                <details className="technical-details source-library">
                  <summary>Other source videos</summary>
                  <div className="search-field compact">
                    <Search size={16} />
                    <input
                      id="source-search"
                      value={assetQuery}
                      onChange={(event) => setAssetQuery(event.target.value)}
                      placeholder="Search source videos"
                    />
                  </div>
                  <div className="asset-list compact-asset-list source-picker">
                    {filteredSourceAssets.slice(0, 8).map((asset) => (
                      <div className={asset.id === assetId ? "asset-item selected source-asset-row" : "asset-item source-asset-row"} key={asset.id}>
                        <button className="asset-select-button" type="button" onClick={() => setAssetId(asset.id)}>
                          <FileVideo size={16} />
                          <span>
                            <strong>{assetDisplayName(asset)}</strong>
                            <small>{shortStoragePath(asset.gcs_uri, asset)}</small>
                          </span>
                        </button>
                        <button
                          className="icon-button danger source-delete-button"
                          type="button"
                          onClick={() => deleteSourceAsset(asset)}
                          disabled={deletingSourceId === asset.id}
                          aria-label={`Delete source video ${assetDisplayName(asset)}`}
                          title="Delete source video"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          </section>
          ) : null}
        </aside>

        <main className="clipping-review-panel">
          <div className="review-surface-header">
            <div>
              <div className="eyebrow">{activePreviewCandidateId ? "Preview Candidate" : "Review Source"}</div>
              <h2>{selectedAsset ? assetDisplayName(selectedAsset) : "Select footage to begin"}</h2>
            </div>
            <span className="review-badge">{aspectRatio}</span>
          </div>

          <div className="source-preview">
            {previewUrl ? (
              <video ref={sourceVideoRef} src={previewUrl} controls preload="metadata" />
            ) : (
              <div className="source-empty-preview">
                <FileVideo size={34} />
                <strong>{selectedAsset ? "Source selected" : "No source selected"}</strong>
                <span>
                  {selectedAsset
                    ? previewError || "Preview will appear when a playable source URL is available."
                    : "Choose a source video from this workspace."}
                </span>
              </div>
            )}
          </div>

          <section className="clipping-actions-panel highlight-workbench" aria-label="Highlight review">
            <div className="highlight-toolbar">
              <span>
                <strong>{selectedAsset ? "Candidate shorts" : "Select a source first"}</strong>
                <small>
                  {selectedAsset
                    ? "Find candidates creates timestamped suggestions below. Export selected shorts creates MP4s in the output panel."
                    : "The analysis job needs one source video."}
                </small>
              </span>
              <div className="highlight-toolbar-actions">
                {highlightCandidates.length ? (
                  <span>{selectedHighlights.length} of {highlightCandidates.length} selected</span>
                ) : null}
                <button className="button primary-cta" type="button" onClick={startWorkflow} disabled={busy || !workflowReady}>
                  <WandSparkles size={16} /> Find candidate shorts
                </button>
                <button className="button" type="button" onClick={exportSelectedHighlights} disabled={busy || !selectedHighlights.length}>
                  <Video size={16} /> {exportMode === "joined" ? "Export stitched short" : "Export selected shorts"}
                </button>
              </div>
            </div>

            {activePreviewCandidateId ? (
              <div className="candidate-preview-status" aria-live="polite">
                {(() => {
                  const candidate = highlightCandidates.find((item) => item.id === activePreviewCandidateId);
                  return candidate ? (
                    <>
                      <PlayCircle size={16} />
                      <span>
                        Previewing <strong>{candidate.range}</strong> from {candidate.title}
                      </span>
                    </>
                  ) : null;
                })()}
              </div>
            ) : null}

            {highlightCandidates.length ? (
              <div className="highlight-list">
                {highlightCandidates.map((candidate) => (
                  <article
                    className={[
                      "highlight-card",
                      selectedHighlightIds.includes(candidate.id) ? "selected" : "",
                      activePreviewCandidateId === candidate.id ? "previewing" : "",
                    ].filter(Boolean).join(" ")}
                    key={candidate.id}
                  >
                    <label className="highlight-check">
                      <input
                        type="checkbox"
                        checked={selectedHighlightIds.includes(candidate.id)}
                        onChange={() => toggleHighlight(candidate.id)}
                      />
                      <span>{candidate.range}</span>
                    </label>
                    <div className="highlight-copy">
                      <strong>{candidate.title}</strong>
                      <p>{candidate.rationale}</p>
                      <small>{candidate.category || candidate.tone}</small>
                    </div>
                    <button
                      className="button secondary inline-action"
                      type="button"
                      onClick={() => previewHighlight(candidate)}
                      disabled={!previewUrl || !selectedAsset}
                      title={previewUrl && selectedAsset ? "Preview this moment in the source video" : "Select or upload the source video to preview"}
                    >
                      <PlayCircle size={16} /> {activePreviewCandidateId === candidate.id ? "Playing" : "Preview"}
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state compact-empty">
                {highlightsMessage || "Candidate cards will appear here after analysis finishes."}
              </div>
            )}

            <details className="technical-details">
              <summary>Additional notes</summary>
              <div className="field">
                <label htmlFor="metadata-prompt">Notes for finding candidates</label>
                <textarea id="metadata-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
              </div>
            </details>
            {message ? <p className="muted code">{message}</p> : null}
          </section>
        </main>

        <aside className="clipping-output-panel" aria-label="Clip review and export">
          <Panel title="Export Settings">
            <p className="muted panel-note">These settings apply when exporting selected candidates from the source review.</p>
            <div className="field">
              <label htmlFor="aspect">Export shape</label>
              <select id="aspect" value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value)}>
                <option value="9:16">9:16 portrait</option>
                <option value="16:9">16:9 landscape</option>
                <option value="1:1">1:1 square</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="export-mode">Export mode</label>
              <select id="export-mode" value={exportMode} onChange={(event) => setExportMode(event.target.value as "individual" | "joined")}>
                <option value="individual">Separate MP4 for each candidate</option>
                <option value="joined">One stitched MP4 from selected candidates</option>
              </select>
            </div>
            <div className="panel-subheading">
              <strong>Short Outputs</strong>
              <span>Only exported MP4s appear here.</span>
            </div>
            {latestFinalVideo ? (
              <>
                {latestFinalVideoUrl ? (
                  <video className="review-cut-preview" src={latestFinalVideoUrl} controls preload="metadata" />
                ) : null}
                <div className="export-summary">
                  <strong>{assetDisplayName(latestFinalVideo)}</strong>
                  <span>{shortStoragePath(latestFinalVideo.gcs_uri, latestFinalVideo)}</span>
                </div>
                {finalVideoAssets.length > 1 ? (
                  <div className="short-output-list">
                    {finalVideoAssets.slice(0, 5).map((asset) => (
                      <div className="short-output-row" key={asset.id}>
                        <span>
                          <strong>{assetDisplayName(asset)}</strong>
                          <small>{new Date(asset.created_at).toLocaleString()}</small>
                        </span>
                        {downloadUrls[asset.id] ? (
                          <Link className="button secondary inline-action" href={downloadUrls[asset.id]} target="_blank">
                            <Download size={16} /> Download
                          </Link>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
                {latestFinalVideoUrl ? (
                  <div className="actions tight-actions">
                    <Link className="button" href={latestFinalVideoUrl} target="_blank">
                      <Download size={16} /> Download latest short
                    </Link>
                    <button
                      className="button danger"
                      type="button"
                      onClick={() => deleteGeneratedAsset(latestFinalVideo)}
                      disabled={deletingAssetId === latestFinalVideo.id}
                    >
                      <Trash2 size={16} /> Delete latest short
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="empty-state compact-empty">Select candidate shorts and export them here.</div>
            )}
          </Panel>
        </aside>
      </section>

      <section className="list-panel">
        <div className="section-heading">
          <h2>Recent video-clipping jobs</h2>
          <p className="muted">Expand a job to inspect events, outputs, and rerun context without leaving this workflow.</p>
        </div>
        {jobDetailMessage ? <p className="muted code inline-panel-message">{jobDetailMessage}</p> : null}
        {jobs.length ? (
          jobs.slice(0, 8).map((job) => (
            <article className="job-accordion-item" key={job.id}>
              <button className="job-toggle" type="button" onClick={() => toggleJobDetail(job.id)} aria-expanded={expandedJobId === job.id}>
                <span className="job-kind">
                  <CheckCircle2 size={16} />
                  {job.id}
                </span>
                <span className="job-meta">
                  <span>{new Date(job.created_at).toLocaleString()}</span>
                  <StatusPill status={job.status} />
                  <ChevronDown size={18} className={expandedJobId === job.id ? "rotate-up" : ""} />
                </span>
              </button>
              {expandedJobId === job.id ? (
                <JobDetailPanel job={job} detail={jobDetailsById[job.id]} isBusy={jobDetailBusy === job.id} />
              ) : null}
            </article>
          ))
        ) : (
          <div className="empty-state">No video-clipping jobs yet.</div>
        )}
      </section>
    </>
  );

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
              <strong>{assetDisplayName(asset)}</strong>
              <small>{shortStoragePath(asset.gcs_uri, asset)}</small>
            </span>
            <span>{new Date(asset.created_at).toLocaleString()}</span>
          </div>
        ))}
      </div>
    );
  }

  function JobDetailPanel({ job, detail, isBusy }: { job: JobRecord; detail?: JobDetail; isBusy: boolean }) {
    const row = detail || job;
    const events = detail?.events || [];
    const outputs = detail?.outputs || [];

    return (
      <div className="job-detail-panel">
        <div className="job-detail-grid">
          <InfoTile label="Status" value={row.status} />
          <InfoTile label="Aspect" value={row.aspect_ratio} />
          <InfoTile label="Language" value={row.language} />
          <InfoTile label="Input" value={row.input_asset_ids.length ? row.input_asset_ids.join(", ") : "No input asset recorded"} />
          <InfoTile label="Output prefix" value={row.output_prefix} />
          <InfoTile label="Updated" value={new Date(row.updated_at).toLocaleString()} />
        </div>

        {row.error ? (
          <div className="job-error">
            <strong>Error</strong>
            <span>{row.error}</span>
          </div>
        ) : null}

        {isBusy ? <div className="empty-state compact-empty">Loading job events and outputs...</div> : null}

        {!isBusy ? (
          <div className="job-detail-columns">
            <section className="job-detail-section">
              <h3>Events</h3>
              {events.length ? (
                <div className="job-event-list">
                  {events.map((event) => (
                    <div className="job-event" key={event.id}>
                      <strong>{event.step}</strong>
                      <span>
                        {event.message}
                        {event.payload?.metadata?.render_backend ? (
                          <small>Backend: {String(event.payload.metadata.render_backend)}</small>
                        ) : null}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state compact-empty">No events recorded yet.</div>
              )}
            </section>

            <section className="job-detail-section">
              <h3>Outputs</h3>
              {outputs.length ? (
                <div className="job-output-list">
                  {outputs.map((asset) => (
                    <div className="job-output" key={asset.id}>
                      <strong>{asset.kind}</strong>
                      <span>
                        {assetDisplayName(asset)}
                        <small>{shortStoragePath(asset.gcs_uri, asset)}</small>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state compact-empty">Outputs will appear as the job completes.</div>
              )}
            </section>
          </div>
        ) : null}

        <div className="actions">
          <button className="button secondary" type="button" onClick={() => loadJobDetail(job.id)} disabled={isBusy}>
            <RefreshCw size={16} /> Refresh details
          </button>
          <Link className="button secondary" href={`/jobs/${job.id}`}>
            Open full page
          </Link>
        </div>
      </div>
    );
  }

  function InfoTile({ label, value }: { label: string; value: string }) {
    return (
      <div className="info-tile">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    );
  }
}

function assetDisplayName(asset: AssetRecord) {
  if (asset.kind === "metadata") return "Scene metadata JSON";
  if (asset.kind === "final_video") return "Short MP4";
  return friendlyName(asset.filename);
}

function friendlyName(value: string) {
  const basename = value.split("/").pop() || value;
  const withoutHashPrefix = basename.replace(/^[a-z0-9]+_[^[]*\[FULL\]_?/i, "");
  return withoutHashPrefix
    .replace(/_{2,}/g, " ")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shortStoragePath(uri: string, asset?: AssetRecord) {
  if (asset?.kind === "source_video") return `uploads/${friendlyName(asset.filename)}`;
  if (asset?.kind === "metadata") return "outputs/video-clipping/metadata.json";
  if (asset?.kind === "final_video") return "outputs/video-clipping/short.mp4";
  return uri.replace(/^gs:\/\/[^/]+\//, "").replace(/^local-bucket\//, "");
}

function parseHighlightCandidate(row: unknown, index: number): HighlightCandidate | null {
  if (!row || typeof row !== "object") return null;
  const raw = row as Record<string, unknown>;
  const range = String(raw.timestamp_start_end || "");
  const parsedRange = parseTimestampRange(range);
  if (!parsedRange) return null;
  const title =
    String(raw.brief_scene_description || raw.title || raw.scene_title || `Highlight ${index + 1}`).trim() ||
    `Highlight ${index + 1}`;
  const rationale = String(raw.editor_note_clip_rationale || raw.rationale || raw.reason || "").trim();
  const sourceAssetId = String(raw.source_asset_id || "");
  return {
    id: `${sourceAssetId || "source"}:${range}:${index}`,
    range,
    startSeconds: parsedRange.start,
    endSeconds: parsedRange.end,
    title,
    rationale,
    tone: String(raw.dominant_emotional_tone_impact || "").trim(),
    category: String(raw.trailer_potential_category || "").trim(),
    sourceAssetId,
    raw,
  };
}

function parseTimestampRange(value: string) {
  if (!value.includes(" - ")) return null;
  const [startText, endText] = value.split(" - ", 2);
  const start = parseTimestamp(startText);
  const end = parseTimestamp(endText);
  if (start === null || end === null || end <= start) return null;
  return { start, end };
}

function parseTimestamp(value: string) {
  const parts = value.trim().split(":").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part) || part < 0)) return null;
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
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
        workspace.lane === "video_clipping" &&
        (!needle || workspace.id.toLowerCase().includes(needle) || workspace.name.toLowerCase().includes(needle))
    );
  }, [query, workspaces]);

  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    setIsLoading(true);
    apiFetch<WorkspaceRecord[]>("/workspaces?lane=video_clipping")
      .then((rows) => {
        if (isMounted) setWorkspaces(rows.filter((workspace) => workspace.lane === "video_clipping"));
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
        <div className="workspace-popover" role="dialog" aria-label="Choose video clipping workspace">
          <div className="search-field compact">
            <Search size={16} />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search clipping workspaces"
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
              <div className="empty-state compact-empty">No clipping workspaces found.</div>
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
