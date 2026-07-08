"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Fragment, type ReactNode, useEffect, useMemo, useState } from "react";
import {
  Archive,
  AudioLines,
  Bot,
  Captions,
  Check,
  ChevronDown,
  Copy,
  Crop,
  Download,
  FileCode2,
  FileJson,
  FileText,
  Film,
  GripVertical,
  Image as ImageIcon,
  Layers,
  Link2,
  ListChecks,
  MessageSquare,
  Mic2,
  Moon,
  MoreHorizontal,
  Newspaper,
  PanelRight,
  Play,
  Plus,
  RefreshCw,
  Save,
  Scissors,
  Search,
  Settings,
  Share2,
  Sparkles,
  SplitSquareHorizontal,
  Sun,
  Table2,
  Trash2,
  Type,
  Video,
  WandSparkles
} from "lucide-react";
import {
  apiFetch,
  type AssetRecord,
  type DownloadUrlResponse,
  type JobRecord,
  type JobStatus,
  type NewsroomPackage,
  type WorkspaceRecord
} from "@/lib/api";
import { StatusPill } from "@/components/StatusPill";

type LaneId = NonNullable<WorkspaceRecord["lane"]>;
type RailId = "assets" | "text" | "images" | "video" | "audio" | "ai" | "templates" | "settings";
type FlowMode = "outline" | "storyboard" | "timeline";
type OutputType = "Package" | "Image" | "Short" | "Video" | "Draft";
type WorkbenchKind = "markdown" | "image" | "video" | "audio" | "metadata" | "clip_plan" | "scene" | "group" | "output" | "job" | "ai";
type ElementStatus = "draft" | "ready" | "processing" | "failed" | "exported";

type WorkbenchElement = {
  id: string;
  workspaceId: string;
  kind: WorkbenchKind;
  title: string;
  status: ElementStatus;
  content: Record<string, unknown>;
  asset?: AssetRecord;
  job?: JobRecord;
  sourceJobId?: string;
  sourceElementIds?: string[];
  rails: RailId[];
  flowModes: FlowMode[];
  inFlow?: boolean;
  previewType: "markdown" | "thumbnail" | "player" | "waveform" | "table" | "card";
  outputType?: OutputType;
  sourceLabel?: string;
  detail?: string;
  durationLabel?: string;
  metricLabel?: string;
  confidence?: number;
  createdAt?: string;
  provenance?: Record<string, string>;
};

type JobsByKind = Partial<Record<LaneId, JobRecord[]>>;

const laneKinds: LaneId[] = ["newsroom", "video_clipping", "shorts"];

const starterWorkspaces: WorkspaceRecord[] = [
  { id: "media-prima-newsroom", name: "media-prima-newsroom", lane: "newsroom", created_at: new Date().toISOString() },
  { id: "media-prima-video-clipping", name: "media-prima-video-clipping", lane: "video_clipping", created_at: new Date().toISOString() },
  { id: "media-prima-shorts", name: "media-prima-shorts", lane: "shorts", created_at: new Date().toISOString() }
];

const railItems: Array<{ id: RailId; label: string; icon: ReactNode }> = [
  { id: "assets", label: "Assets", icon: <Archive size={18} /> },
  { id: "text", label: "Text", icon: <Type size={18} /> },
  { id: "images", label: "Images", icon: <ImageIcon size={18} /> },
  { id: "video", label: "Video", icon: <Video size={18} /> },
  { id: "audio", label: "Audio", icon: <AudioLines size={18} /> },
  { id: "ai", label: "AI", icon: <Bot size={18} /> },
  { id: "templates", label: "Templates", icon: <Layers size={18} /> },
  { id: "settings", label: "Settings", icon: <Settings size={18} /> }
];

const outputTypes: OutputType[] = ["Package", "Image", "Short", "Video", "Draft"];

export function UnifiedWorkbench() {
  const params = useSearchParams();
  const initialWorkspace = params.get("workspace") || starterWorkspaces[0].id;
  const initialMode = toFlowMode(params.get("mode")) || modeForLane(params.get("lane") as LaneId | null);
  const [workspaceId, setWorkspaceId] = useState(initialWorkspace);
  const [projectName, setProjectName] = useState(titleFromWorkspace(initialWorkspace));
  const [outputType, setOutputType] = useState<OutputType>(outputForMode(initialMode));
  const [saveState, setSaveState] = useState("Local draft");
  const [themeMode, setThemeMode] = useState<"light" | "dark">("light");
  const [activeRail, setActiveRail] = useState<RailId>("assets");
  const [flowMode, setFlowMode] = useState<FlowMode>(initialMode);
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [jobsByKind, setJobsByKind] = useState<JobsByKind>({});
  const [packagesByJob, setPackagesByJob] = useState<Record<string, NewsroomPackage>>({});
  const [selectedElementId, setSelectedElementId] = useState("");
  const [flowIds, setFlowIds] = useState<string[]>([]);
  const [localElements, setLocalElements] = useState<WorkbenchElement[]>([]);
  const [elementOverrides, setElementOverrides] = useState<Record<string, Partial<WorkbenchElement>>>({});
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    refreshWorkspaces();
  }, []);

  useEffect(() => {
    refreshWorkspace(workspaceId);
  }, [workspaceId]);

  useEffect(() => {
    document.documentElement.style.colorScheme = themeMode;
  }, [themeMode]);

  const baseElements = useMemo(
    () => buildElements({ workspaceId, assets, jobsByKind, packagesByJob }),
    [assets, jobsByKind, packagesByJob, workspaceId]
  );

  const elements = useMemo(() => {
    const merged = [...baseElements, ...localElements]
      .filter((element) => !hiddenIds.has(element.id))
      .map((element) => mergeElement(element, elementOverrides[element.id]));
    return merged.sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""));
  }, [baseElements, elementOverrides, hiddenIds, localElements]);

  const elementMap = useMemo(() => new Map(elements.map((element) => [element.id, element])), [elements]);
  const validFlowIds = useMemo(() => flowIds.filter((id) => elementMap.has(id)), [elementMap, flowIds]);
  const flowElements = useMemo(() => validFlowIds.map((id) => elementMap.get(id)).filter(Boolean) as WorkbenchElement[], [elementMap, validFlowIds]);
  const panelElements = useMemo(() => elements.filter((element) => elementMatchesRail(element, activeRail)), [activeRail, elements]);
  const selectedElement = selectedElementId ? elementMap.get(selectedElementId) || null : null;
  const selectedPreviewUrl = selectedElement?.asset ? previewUrls[selectedElement.asset.id] : undefined;
  const workspaceRows = workspaces.length ? workspaces : starterWorkspaces;
  const currentWorkspace = workspaceRows.find((workspace) => workspace.id === workspaceId);
  const allJobs = useMemo(() => laneKinds.flatMap((kind) => jobsByKind[kind] || []), [jobsByKind]);
  const latestActiveJob = allJobs.find((job) => job.status === "queued" || job.status === "running");
  const selectedNeedsTimelineTools = flowMode === "timeline" || selectedElement?.kind === "video" || selectedElement?.kind === "audio";
  const selectedNeedsTextTools = selectedElement?.kind === "markdown";
  const selectedNeedsImageTools = selectedElement?.kind === "image";

  useEffect(() => {
    const defaultIds = baseElements
      .filter((element) => element.inFlow && element.flowModes.includes(flowMode))
      .map((element) => element.id);
    setFlowIds((current) => {
      const validCurrent = current.filter((id) => elementMap.has(id));
      const nextIds = defaultIds.filter((id) => !validCurrent.includes(id));
      if (validCurrent.length || nextIds.length) return [...validCurrent, ...nextIds];
      return defaultIds;
    });
  }, [baseElements, elementMap, flowMode]);

  useEffect(() => {
    if (selectedElementId && elementMap.has(selectedElementId)) return;
    const nextSelected = flowElements[0] || panelElements[0] || elements[0];
    setSelectedElementId(nextSelected?.id || "");
  }, [elementMap, elements, flowElements, panelElements, selectedElementId]);

  useEffect(() => {
    const asset = selectedElement?.asset;
    if (!asset || previewUrls[asset.id] || !shouldFetchPreview(selectedElement)) return;
    let isMounted = true;
    apiFetch<DownloadUrlResponse>(`/assets/${asset.id}/download-url`)
      .then((response) => {
        if (isMounted) setPreviewUrls((current) => ({ ...current, [asset.id]: response.download_url }));
      })
      .catch(() => undefined);
    return () => {
      isMounted = false;
    };
  }, [previewUrls, selectedElement]);

  async function refreshWorkspaces() {
    try {
      const rows = await apiFetch<WorkspaceRecord[]>("/workspaces");
      setWorkspaces(rows);
      if (!rows.find((workspace) => workspace.id === workspaceId) && rows[0]) {
        applyWorkspace(rows[0]);
      }
    } catch {
      setWorkspaces([]);
    }
  }

  async function refreshWorkspace(nextWorkspace: string) {
    setIsLoading(true);
    setMessage("");
    try {
      const [assetResult, ...jobResults] = await Promise.allSettled([
        apiFetch<AssetRecord[]>(`/workspaces/${encodeURIComponent(nextWorkspace)}/assets`),
        ...laneKinds.map((kind) => apiFetch<JobRecord[]>(`/workspaces/${encodeURIComponent(nextWorkspace)}/jobs?kind=${kind}`))
      ]);

      if (assetResult.status === "fulfilled") {
        setAssets(assetResult.value);
      } else {
        setAssets([]);
      }

      const nextJobs: JobsByKind = {};
      jobResults.forEach((result, index) => {
        nextJobs[laneKinds[index]] = result.status === "fulfilled" ? result.value : [];
      });
      setJobsByKind(nextJobs);

      const newsroomJobs = nextJobs.newsroom || [];
      const packageResults = await Promise.allSettled(
        newsroomJobs.slice(0, 5).map((job) => apiFetch<NewsroomPackage>(`/jobs/${job.id}/newsroom-package`))
      );
      setPackagesByJob(
        Object.fromEntries(
          packageResults
            .map((result, index) => (result.status === "fulfilled" ? [newsroomJobs[index].id, result.value] : null))
            .filter(Boolean) as Array<[string, NewsroomPackage]>
        )
      );

      const failedJobs = jobResults.filter((result) => result.status === "rejected").length;
      if (assetResult.status === "rejected" && failedJobs === jobResults.length) {
        setMessage("Workbench is ready, but the API did not return assets or jobs for this workspace.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  function applyWorkspace(workspace: WorkspaceRecord) {
    const nextMode = modeForLane(workspace.lane || null);
    setWorkspaceId(workspace.id);
    setProjectName(titleFromWorkspace(workspace.name || workspace.id));
    setFlowMode(nextMode);
    setOutputType(outputForMode(nextMode, workspace.lane || null));
    setSelectedElementId("");
    setFlowIds([]);
    setLocalElements([]);
    setHiddenIds(new Set());
    setElementOverrides({});
  }

  function switchFlowMode(nextMode: FlowMode) {
    setFlowMode(nextMode);
    setOutputType(outputForMode(nextMode, currentWorkspace?.lane || null));
  }

  function updateSelectedElement(patch: Partial<WorkbenchElement>) {
    if (!selectedElement) return;
    setElementOverrides((current) => ({
      ...current,
      [selectedElement.id]: mergeElement(selectedElement, patch)
    }));
    setSaveState("Unsaved local edits");
  }

  function updateSelectedContent(key: string, value: string) {
    if (!selectedElement) return;
    updateSelectedElement({ content: { ...selectedElement.content, [key]: value } });
  }

  function addSelectedToFlow() {
    if (!selectedElement || validFlowIds.includes(selectedElement.id)) return;
    setFlowIds((current) => [...current, selectedElement.id]);
    setSaveState("Flow changed locally");
  }

  function duplicateSelected() {
    if (!selectedElement) return;
    const duplicateId = `local-${selectedElement.id}-${Date.now()}`;
    const duplicate: WorkbenchElement = {
      ...selectedElement,
      id: duplicateId,
      title: `${selectedElement.title} copy`,
      status: "draft",
      sourceElementIds: [selectedElement.id],
      inFlow: true,
      createdAt: new Date().toISOString()
    };
    setLocalElements((current) => [duplicate, ...current]);
    setFlowIds((current) => [...current, duplicateId]);
    setSelectedElementId(duplicateId);
    setSaveState("Flow changed locally");
  }

  function deleteSelected() {
    if (!selectedElement) return;
    setHiddenIds((current) => new Set([...current, selectedElement.id]));
    setFlowIds((current) => current.filter((id) => id !== selectedElement.id));
    setSelectedElementId("");
    setSaveState("Flow changed locally");
  }

  function moveFlowElement(elementId: string, direction: -1 | 1) {
    setFlowIds((current) => {
      const index = current.indexOf(elementId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
    setSaveState("Flow changed locally");
  }

  function markSaved() {
    setSaveState("Saved just now");
    setMessage("Local workbench state saved for this session.");
  }

  function setActionMessage(action: string) {
    setMessage(`${action} prepared for ${outputType.toLowerCase()} output.`);
  }

  return (
    <section className="workbench-route" aria-label="Unified Prima Studio workbench">
      <section className="workbench-topbar" aria-label="Workbench controls">
        <span className="workbench-brand">
          <span className="workbench-mark">PS</span>
          <span>
            <strong>Prima Studio</strong>
            <small>Unified Workbench</small>
          </span>
        </span>
        <label className="workbench-project-field">
          <span>Project</span>
          <input value={projectName} onChange={(event) => setProjectName(event.target.value)} aria-label="Project name" />
        </label>
        <label className="workbench-select">
          <span>Workspace</span>
          <select
            value={workspaceId}
            onChange={(event) => {
              const workspace = workspaceRows.find((row) => row.id === event.target.value);
              if (workspace) applyWorkspace(workspace);
            }}
          >
            {workspaceRows.map((workspace) => (
              <option value={workspace.id} key={workspace.id}>
                {workspace.name || workspace.id}
              </option>
            ))}
          </select>
        </label>
        <label className="workbench-select compact">
          <span>Output</span>
          <select value={outputType} onChange={(event) => setOutputType(event.target.value as OutputType)}>
            {outputTypes.map((type) => (
              <option value={type} key={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <span className="save-state">
          <Check size={15} />
          {saveState}
        </span>
        {latestActiveJob ? (
          <Link className="topbar-job-status" href={`/jobs/${latestActiveJob.id}`}>
            <StatusPill status={latestActiveJob.status} />
            <span>{labelForLane(latestActiveJob.kind)}</span>
          </Link>
        ) : null}
        <span className="workbench-top-actions">
          <button className="icon-button" type="button" onClick={markSaved} aria-label="Save workbench" title="Save workbench">
            <Save size={18} />
          </button>
          <button className="icon-button" type="button" onClick={() => setActionMessage("Review link")} aria-label="Share or review" title="Share or review">
            <Share2 size={18} />
          </button>
          <button className="button" type="button" onClick={() => setActionMessage("Export")}>
            <Download size={16} /> Export
          </button>
          <button className="icon-button" type="button" onClick={() => setActionMessage("Feedback")} aria-label="Send feedback" title="Send feedback">
            <MessageSquare size={18} />
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={() => setThemeMode((current) => (current === "light" ? "dark" : "light"))}
            aria-label="Toggle theme"
            aria-pressed={themeMode === "dark"}
            title="Toggle theme"
          >
            {themeMode === "light" ? <Moon size={18} /> : <Sun size={18} />}
          </button>
        </span>
      </section>

      {message ? <p className="workbench-message">{message}</p> : null}

      <section className="workbench-shell">
        <aside className="workbench-rail" aria-label="Workbench tools">
          {railItems.map((item) => (
            <button
              type="button"
              className={activeRail === item.id ? "rail-tool active" : "rail-tool"}
              onClick={() => setActiveRail(item.id)}
              title={item.label}
              aria-label={item.label}
              key={item.id}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </aside>

        <aside className="workbench-library" aria-label={`${railLabel(activeRail)} library`}>
          <header className="workbench-panel-heading">
            <span>
              <strong>{railLabel(activeRail)}</strong>
              <small>{librarySubtitle(activeRail, panelElements.length)}</small>
            </span>
            <button className="icon-button" type="button" onClick={() => refreshWorkspace(workspaceId)} aria-label="Refresh workbench data" title="Refresh">
              <RefreshCw size={17} />
            </button>
          </header>
          {activeRail === "assets" ? <StartSurface workspaceId={workspaceId} /> : null}
          <section className="element-list">
            {panelElements.length ? (
              panelElements.map((element) => (
                <ElementCard
                  element={element}
                  isSelected={selectedElementId === element.id}
                  onSelect={() => setSelectedElementId(element.id)}
                  onAddToFlow={() => {
                    setSelectedElementId(element.id);
                    if (!validFlowIds.includes(element.id)) setFlowIds((current) => [...current, element.id]);
                  }}
                  key={element.id}
                />
              ))
            ) : (
              <section className="workbench-empty compact-empty">
                <Sparkles size={20} />
                <strong>{isLoading ? "Loading production objects" : emptyLabel(activeRail)}</strong>
                <span>{isLoading ? "Fetching assets, jobs, and packages." : emptyDetail(activeRail)}</span>
              </section>
            )}
          </section>
        </aside>

        <main className="workbench-canvas" aria-label="Composition canvas">
          <header className="workbench-panel-heading">
            <span>
              <strong>{selectedElement ? selectedElement.title : "Canvas"}</strong>
              <small>{selectedElement ? canvasModeFor(selectedElement) : "No element selected"}</small>
            </span>
            <span className="canvas-tools">
              {selectedElement ? (
                <button className="button secondary" type="button" onClick={addSelectedToFlow} disabled={validFlowIds.includes(selectedElement.id)}>
                  <Plus size={16} /> Add to Flow
                </button>
              ) : null}
              <button className="icon-button" type="button" aria-label="More canvas actions" title="More canvas actions">
                <MoreHorizontal size={18} />
              </button>
            </span>
          </header>
          <CanvasPreview element={selectedElement} previewUrl={selectedPreviewUrl} workspaceId={workspaceId} />
        </main>

        <aside className="workbench-inspector" aria-label="Contextual inspector">
          <header className="workbench-panel-heading">
            <span>
              <strong>Inspector</strong>
              <small>{selectedElement ? labelForKind(selectedElement.kind) : "Workbench summary"}</small>
            </span>
            <PanelRight size={18} />
          </header>
          <Inspector
            element={selectedElement}
            activeJob={latestActiveJob}
            allJobs={allJobs}
            flowMode={flowMode}
            onTitleChange={(title) => updateSelectedElement({ title })}
            onContentChange={updateSelectedContent}
          />
        </aside>

        <section className="workbench-flow" aria-label="Flow sequencing area">
          <header className="flow-toolbar">
            <span className="flow-title">
              <strong>Flow</strong>
              <small>{flowMode === "timeline" ? "Timeline mode" : flowMode === "storyboard" ? "Storyboard mode" : "Outline mode"}</small>
            </span>
            <span className="segmented-control" aria-label="Flow mode">
              {(["outline", "storyboard", "timeline"] as FlowMode[]).map((mode) => (
                <button type="button" className={flowMode === mode ? "active" : ""} onClick={() => switchFlowMode(mode)} key={mode}>
                  {capitalize(mode)}
                </button>
              ))}
            </span>
            <span className="flow-actions">
              <button className="icon-button" type="button" onClick={addSelectedToFlow} disabled={!selectedElement} aria-label="Add selected element" title="Add selected element">
                <Plus size={17} />
              </button>
              <button className="icon-button" type="button" onClick={duplicateSelected} disabled={!selectedElement} aria-label="Duplicate selected element" title="Duplicate selected element">
                <Copy size={17} />
              </button>
              <button className="icon-button danger" type="button" onClick={deleteSelected} disabled={!selectedElement} aria-label="Delete selected element" title="Delete selected element">
                <Trash2 size={17} />
              </button>
              <button className="button secondary" type="button" onClick={() => setActionMessage("Preview")}>
                <Play size={16} /> Preview
              </button>
              <button className="button" type="button" onClick={() => setActionMessage("Export selected")}>
                <Download size={16} /> Export selected
              </button>
            </span>
            {selectedNeedsTimelineTools ? (
              <span className="precision-tools" aria-label="Timeline controls">
                <button type="button"><Scissors size={15} /> Split</button>
                <button type="button"><Crop size={15} /> Trim</button>
                <button type="button"><SplitSquareHorizontal size={15} /> Ripple</button>
                <button type="button"><GripVertical size={15} /> Snap</button>
              </span>
            ) : null}
            {selectedNeedsTextTools ? (
              <span className="precision-tools" aria-label="Text controls">
                <button type="button"><FileText size={15} /> Edit markdown</button>
                <button type="button"><WandSparkles size={15} /> Rewrite</button>
                <button type="button"><Captions size={15} /> Captions</button>
              </span>
            ) : null}
            {selectedNeedsImageTools ? (
              <span className="precision-tools" aria-label="Image controls">
                <button type="button"><Crop size={15} /> Crop</button>
                <button type="button"><ImageIcon size={15} /> Fit</button>
                <button type="button"><WandSparkles size={15} /> Regenerate</button>
              </span>
            ) : null}
          </header>
          <section className={`flow-surface ${flowMode}`}>
            {flowElements.length ? (
              flowElements.map((element, index) => (
                <FlowCard
                  element={element}
                  flowMode={flowMode}
                  index={index}
                  isSelected={selectedElementId === element.id}
                  canMoveBack={index > 0}
                  canMoveForward={index < flowElements.length - 1}
                  onSelect={() => setSelectedElementId(element.id)}
                  onMoveBack={() => moveFlowElement(element.id, -1)}
                  onMoveForward={() => moveFlowElement(element.id, 1)}
                  key={element.id}
                />
              ))
            ) : (
              <section className="workbench-empty flow-empty">
                <ListChecks size={22} />
                <strong>Add elements to Flow</strong>
                <span>Select an asset, package, scene, or clip candidate, then add it here for outline, storyboard, or timeline assembly.</span>
              </section>
            )}
          </section>
        </section>
      </section>
    </section>
  );
}

function StartSurface({ workspaceId }: { workspaceId: string }) {
  return (
    <section className="start-surface" aria-label="Start actions">
      <Link href={`/video-clipping?workspace=${encodeURIComponent(workspaceId)}`}>
        <Archive size={16} /> Import files
      </Link>
      <Link href={`/newsroom?workspace=${encodeURIComponent(workspaceId)}`}>
        <Newspaper size={16} /> Start from brief
      </Link>
      <Link href={`/shorts?workspace=${encodeURIComponent(workspaceId)}`}>
        <WandSparkles size={16} /> Generate short
      </Link>
    </section>
  );
}

function ElementCard({
  element,
  isSelected,
  onSelect,
  onAddToFlow
}: {
  element: WorkbenchElement;
  isSelected: boolean;
  onSelect: () => void;
  onAddToFlow: () => void;
}) {
  return (
    <article className={isSelected ? "element-card selected" : "element-card"}>
      <button className="element-card-main" type="button" onClick={onSelect}>
        <span className="element-thumb">
          <ElementIcon element={element} />
        </span>
        <span className="element-copy">
          <strong>{element.title}</strong>
          <small>{element.detail || element.sourceLabel || labelForKind(element.kind)}</small>
          <span className="element-meta">
            <span className={`element-status ${element.status}`}>{element.status}</span>
            {element.metricLabel ? <span>{element.metricLabel}</span> : null}
          </span>
        </span>
      </button>
      <span className="asset-actions">
        <button type="button" onClick={onAddToFlow} title="Add to Flow" aria-label={`Add ${element.title} to Flow`}>
          <Plus size={15} />
        </button>
        <button type="button" onClick={onSelect} title="Preview" aria-label={`Preview ${element.title}`}>
          <Play size={15} />
        </button>
      </span>
    </article>
  );
}

function CanvasPreview({
  element,
  previewUrl,
  workspaceId
}: {
  element: WorkbenchElement | null;
  previewUrl?: string;
  workspaceId: string;
}) {
  if (!element) {
    return (
      <section className="canvas-empty">
        <Sparkles size={28} />
        <strong>Start assembling a production object</strong>
        <span>Import source material, generate a newsroom package, or create a short. Selected elements will render here with review controls.</span>
        <span className="canvas-empty-actions">
          <Link className="button secondary" href={`/newsroom?workspace=${encodeURIComponent(workspaceId)}`}>
            <Newspaper size={16} /> Brief
          </Link>
          <Link className="button secondary" href={`/video-clipping?workspace=${encodeURIComponent(workspaceId)}`}>
            <Video size={16} /> Video
          </Link>
          <Link className="button secondary" href={`/shorts?workspace=${encodeURIComponent(workspaceId)}`}>
            <WandSparkles size={16} /> Short
          </Link>
        </span>
      </section>
    );
  }

  if (element.kind === "markdown") {
    return (
      <section className="canvas-document">
        <MarkdownRenderer markdown={String(element.content.markdown || "")} />
      </section>
    );
  }

  if (element.kind === "image") {
    return (
      <section className="canvas-media image-mode">
        {previewUrl ? (
          <img src={previewUrl} alt={String(element.content.alt || element.title)} />
        ) : (
          <span className="image-placeholder">
            <ImageIcon size={34} />
            Preview image is available after a signed URL is loaded.
          </span>
        )}
        <span className="safe-area-frame" aria-hidden="true" />
      </section>
    );
  }

  if (element.kind === "video" || element.kind === "output") {
    return (
      <section className="canvas-media video-mode">
        {previewUrl ? (
          <video src={previewUrl} controls preload="metadata" />
        ) : (
          <span className="video-placeholder">
            <Video size={38} />
            <strong>{element.durationLabel || "00:00"}</strong>
            <small>{element.asset?.gcs_uri || element.detail || "Video preview surface"}</small>
          </span>
        )}
        <span className="safe-area-frame reels" aria-hidden="true" />
        <span className="timecode">00:00:00</span>
      </section>
    );
  }

  if (element.kind === "metadata") {
    return (
      <section className="canvas-table">
        <MetadataTable rows={(element.content.rows as Array<Record<string, string>>) || metadataRowsFor(element)} />
      </section>
    );
  }

  if (element.kind === "scene") {
    return (
      <section className="canvas-scene">
        <span className="scene-preview-card">
          <strong>{element.title}</strong>
          <small>{String(element.content.visual || "Visual beat")}</small>
          <p>{String(element.content.narration || element.detail || "")}</p>
          <span>{element.durationLabel}</span>
        </span>
      </section>
    );
  }

  if (element.kind === "audio") {
    return (
      <section className="canvas-audio">
        <AudioLines size={30} />
        <span className="waveform" aria-hidden="true">
          {Array.from({ length: 24 }).map((_, index) => (
            <i key={index} />
          ))}
        </span>
        <strong>{element.title}</strong>
      </section>
    );
  }

  return (
    <section className="canvas-card-preview">
      <ElementIcon element={element} />
      <strong>{element.title}</strong>
      <span>{element.detail || element.sourceLabel || labelForKind(element.kind)}</span>
    </section>
  );
}

function Inspector({
  element,
  activeJob,
  allJobs,
  flowMode,
  onTitleChange,
  onContentChange
}: {
  element: WorkbenchElement | null;
  activeJob?: JobRecord;
  allJobs: JobRecord[];
  flowMode: FlowMode;
  onTitleChange: (title: string) => void;
  onContentChange: (key: string, value: string) => void;
}) {
  if (!element) {
    return (
      <section className="inspector-body">
        <InspectorSection title="Workbench summary">
          <InfoLine label="Flow mode" value={capitalize(flowMode)} />
          <InfoLine label="Recent jobs" value={String(allJobs.length)} />
          <InfoLine label="Recommended action" value={activeJob ? "Inspect the running job before export." : "Select an element or start a lane workflow."} />
          {activeJob ? (
            <Link className="button secondary inline-action" href={`/jobs/${activeJob.id}`}>
              Open active job
            </Link>
          ) : null}
        </InspectorSection>
      </section>
    );
  }

  const markdown = String(element.content.markdown || "");

  return (
    <section className="inspector-body">
      <InspectorSection title="Selection">
        <label className="field">
          <span>Title</span>
          <input value={element.title} onChange={(event) => onTitleChange(event.target.value)} />
        </label>
        <InfoLine label="Kind" value={labelForKind(element.kind)} />
        <InfoLine label="Status" value={element.status} />
      </InspectorSection>

      {element.kind === "markdown" ? (
        <InspectorSection title="Markdown">
          <label className="field">
            <span>Raw markdown</span>
            <textarea value={markdown} onChange={(event) => onContentChange("markdown", event.target.value)} />
          </label>
          <InfoLine label="Words" value={String(wordCount(markdown))} />
          <InfoLine label="Source package" value={element.sourceJobId || "Local draft"} />
        </InspectorSection>
      ) : null}

      {element.kind === "image" ? (
        <InspectorSection title="Image">
          <label className="field">
            <span>Fit</span>
            <select defaultValue="cover">
              <option>cover</option>
              <option>contain</option>
              <option>fill</option>
            </select>
          </label>
          <label className="field">
            <span>Alt text</span>
            <textarea defaultValue={String(element.content.alt || element.title)} />
          </label>
          <InfoLine label="Prompt" value={String(element.content.prompt || "No prompt recorded")} />
          <InfoLine label="Dimensions" value={element.metricLabel || "Unknown"} />
        </InspectorSection>
      ) : null}

      {element.kind === "video" || element.kind === "output" ? (
        <InspectorSection title="Video">
          <InfoLine label="In point" value={String(element.content.inPoint || "00:00:00")} />
          <InfoLine label="Out point" value={String(element.content.outPoint || "Auto")} />
          <InfoLine label="Duration" value={element.durationLabel || "Unknown"} />
          <InfoLine label="Captions" value={String(element.content.captions || "Available after transcript generation")} />
          <InfoLine label="Source segment" value={element.asset?.id || element.sourceJobId || "Not recorded"} />
        </InspectorSection>
      ) : null}

      {element.kind === "audio" ? (
        <InspectorSection title="Audio">
          <InfoLine label="Volume" value="100%" />
          <InfoLine label="Fade" value="None" />
          <InfoLine label="Voice" value={String(element.content.voice || "Original")} />
          <InfoLine label="Transcript" value={String(element.content.transcript || "Not available")} />
        </InspectorSection>
      ) : null}

      {element.kind === "scene" ? (
        <InspectorSection title="Scene">
          <InfoLine label="Target duration" value={element.durationLabel || "Unset"} />
          <InfoLine label="Output role" value={String(element.content.role || "Storyboard beat")} />
          <InfoLine label="Included elements" value={String(element.sourceElementIds?.length || 0)} />
          <label className="field">
            <span>Notes</span>
            <textarea defaultValue={String(element.content.notes || element.detail || "")} />
          </label>
        </InspectorSection>
      ) : null}

      {element.kind === "ai" ? (
        <InspectorSection title="AI suggestion">
          <InfoLine label="Rationale" value={String(element.content.rationale || element.detail || "No rationale recorded")} />
          <InfoLine label="Source evidence" value={String(element.content.evidence || element.sourceLabel || "Unknown")} />
          <span className="inspector-actions">
            <button className="button secondary" type="button">Accept</button>
            <button className="button secondary" type="button">Edit</button>
            <button className="button secondary" type="button">Reject</button>
          </span>
        </InspectorSection>
      ) : null}

      {element.kind === "job" ? (
        <InspectorSection title="Job">
          {element.job ? <StatusPill status={element.job.status} /> : null}
          <InfoLine label="Artifacts" value={String(element.job?.output_asset_ids.length || 0)} />
          <InfoLine label="Errors" value={String(element.job?.error || "None recorded")} />
          {element.sourceJobId ? (
            <Link className="button secondary inline-action" href={`/jobs/${element.sourceJobId}`}>
              Open job
            </Link>
          ) : null}
        </InspectorSection>
      ) : null}

      <InspectorSection title="Provenance">
        {Object.entries(element.provenance || {}).map(([label, value]) => (
          <InfoLine label={label} value={value} key={label} />
        ))}
        {element.asset ? <InfoLine label="Source asset" value={element.asset.gcs_uri} /> : null}
      </InspectorSection>
    </section>
  );
}

function FlowCard({
  element,
  flowMode,
  index,
  isSelected,
  canMoveBack,
  canMoveForward,
  onSelect,
  onMoveBack,
  onMoveForward
}: {
  element: WorkbenchElement;
  flowMode: FlowMode;
  index: number;
  isSelected: boolean;
  canMoveBack: boolean;
  canMoveForward: boolean;
  onSelect: () => void;
  onMoveBack: () => void;
  onMoveForward: () => void;
}) {
  return (
    <article className={isSelected ? "flow-card selected" : "flow-card"} data-kind={element.kind}>
      <button className="flow-card-main" type="button" onClick={onSelect}>
        <span className="flow-index">{flowMode === "timeline" ? secondsLabel(index * 6) : index + 1}</span>
        <span className="flow-preview">
          <ElementIcon element={element} />
        </span>
        <span className="flow-copy">
          <strong>{element.title}</strong>
          <small>{flowSummary(element, flowMode)}</small>
        </span>
      </button>
      <span className="flow-card-actions">
        <button type="button" onClick={onMoveBack} disabled={!canMoveBack} aria-label={`Move ${element.title} earlier`}>
          <ChevronDown className="rotate-up" size={15} />
        </button>
        <button type="button" onClick={onMoveForward} disabled={!canMoveForward} aria-label={`Move ${element.title} later`}>
          <ChevronDown size={15} />
        </button>
      </span>
    </article>
  );
}

function MarkdownRenderer({ markdown }: { markdown: string }) {
  const blocks = useMemo(() => parseMarkdown(markdown), [markdown]);
  if (!markdown.trim()) {
    return (
      <section className="workbench-empty">
        <FileText size={24} />
        <strong>Empty markdown block</strong>
        <span>Add text in the inspector to preview it here.</span>
      </section>
    );
  }
  return (
    <article className="markdown-renderer">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          return <MarkdownHeading level={block.level || 1} text={block.text || ""} key={index} />;
        }
        if (block.type === "quote") return <blockquote key={index}>{renderInline(block.text || "")}</blockquote>;
        if (block.type === "ordered-list") {
          return (
            <ol key={index}>
              {block.items?.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>)}
            </ol>
          );
        }
        if (block.type === "unordered-list") {
          return (
            <ul key={index}>
              {block.items?.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>)}
            </ul>
          );
        }
        if (block.type === "table") {
          return (
            <table key={index}>
              <thead>
                <tr>{block.headers?.map((header) => <th key={header}>{renderInline(header)}</th>)}</tr>
              </thead>
              <tbody>
                {block.rows?.map((row, rowIndex) => (
                  <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{renderInline(cell)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          );
        }
        return <p key={index}>{renderInline(block.text || "")}</p>;
      })}
    </article>
  );
}

function MarkdownHeading({ level, text }: { level: number; text: string }) {
  if (level === 1) return <h1>{renderInline(text)}</h1>;
  if (level === 2) return <h2>{renderInline(text)}</h2>;
  if (level === 3) return <h3>{renderInline(text)}</h3>;
  if (level === 4) return <h4>{renderInline(text)}</h4>;
  if (level === 5) return <h5>{renderInline(text)}</h5>;
  return <h6>{renderInline(text)}</h6>;
}

function MetadataTable({ rows }: { rows: Array<Record<string, string>> }) {
  const headers = Object.keys(rows[0] || {});
  return (
    <table>
      <thead>
        <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex}>{headers.map((header) => <td key={header}>{row[header]}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

function InspectorSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="inspector-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <span className="info-line">
      <strong>{label}</strong>
      <span>{value}</span>
    </span>
  );
}

function ElementIcon({ element }: { element: WorkbenchElement }) {
  if (element.kind === "markdown") return <FileText size={18} />;
  if (element.kind === "image") return <ImageIcon size={18} />;
  if (element.kind === "video" || element.kind === "output") return <Film size={18} />;
  if (element.kind === "audio") return <Mic2 size={18} />;
  if (element.kind === "metadata") return <Table2 size={18} />;
  if (element.kind === "clip_plan") return <Scissors size={18} />;
  if (element.kind === "scene") return <ListChecks size={18} />;
  if (element.kind === "ai") return <Bot size={18} />;
  if (element.kind === "job") return <FileJson size={18} />;
  return <Layers size={18} />;
}

function buildElements({
  workspaceId,
  assets,
  jobsByKind,
  packagesByJob
}: {
  workspaceId: string;
  assets: AssetRecord[];
  jobsByKind: JobsByKind;
  packagesByJob: Record<string, NewsroomPackage>;
}) {
  const elements: WorkbenchElement[] = [];

  for (const asset of assets) {
    elements.push(assetToElement(workspaceId, asset));
  }

  for (const kind of laneKinds) {
    for (const job of jobsByKind[kind] || []) {
      elements.push(jobToElement(workspaceId, job));
    }
  }

  for (const newsroomPackage of Object.values(packagesByJob)) {
    elements.push(...newsroomPackageToElements(workspaceId, newsroomPackage));
  }

  return elements;
}

function assetToElement(workspaceId: string, asset: AssetRecord): WorkbenchElement {
  const kind = kindForAsset(asset);
  const outputAsset = ["generated_short", "final_video"].includes(asset.kind);
  return {
    id: `asset-${asset.id}`,
    workspaceId,
    kind,
    title: asset.filename || asset.id,
    status: outputAsset ? "exported" : "ready",
    content: {
      uri: asset.gcs_uri,
      contentType: asset.content_type || "",
      inPoint: "00:00:00",
      captions: kind === "video" ? "Caption review available after transcript generation" : ""
    },
    asset,
    rails: railsForKind(kind, asset.kind),
    flowModes: flowModesForKind(kind),
    inFlow: outputAsset || asset.kind === "clip" || asset.kind === "metadata",
    previewType: previewForKind(kind),
    outputType: outputAsset ? "Video" : undefined,
    sourceLabel: asset.kind,
    detail: asset.gcs_uri,
    metricLabel: asset.content_type || asset.kind,
    createdAt: asset.created_at,
    provenance: {
      source: asset.gcs_uri,
      asset_id: asset.id,
      asset_kind: asset.kind
    }
  };
}

function jobToElement(workspaceId: string, job: JobRecord): WorkbenchElement {
  const status: ElementStatus = job.status === "failed" ? "failed" : job.status === "succeeded" ? "ready" : "processing";
  return {
    id: `job-${job.id}`,
    workspaceId,
    kind: "job",
    title: `${labelForLane(job.kind)} job`,
    status,
    content: {
      language: job.language,
      aspectRatio: job.aspect_ratio,
      outputPrefix: job.output_prefix
    },
    job,
    sourceJobId: job.id,
    rails: ["assets", "ai", "settings"],
    flowModes: ["outline"],
    previewType: "card",
    outputType: outputForLane(job.kind),
    sourceLabel: job.kind,
    detail: job.id,
    metricLabel: `${job.output_asset_ids.length} outputs`,
    createdAt: job.created_at,
    provenance: {
      job_id: job.id,
      lane: job.kind,
      output_prefix: job.output_prefix
    }
  };
}

function newsroomPackageToElements(workspaceId: string, newsroomPackage: NewsroomPackage) {
  const elements: WorkbenchElement[] = [];
  const narrative = newsroomPackage.narrative_package;
  const packageMarkdown = [
    `# ${narrative.title}`,
    "",
    "## Brief",
    newsroomPackage.brief,
    "",
    "## Script",
    narrative.script,
    "",
    "## Caption Options",
    ...narrative.caption_options.map((caption) => `- ${caption}`),
    "",
    "## Editorial Checks",
    ...narrative.editorial_checks.map((check) => `- ${check}`),
    "",
    "## Hashtags",
    narrative.hashtags.join(" ")
  ].join("\n");

  elements.push({
    id: `newsroom-${newsroomPackage.id}-brief`,
    workspaceId,
    kind: "markdown",
    title: "Newsroom brief",
    status: "ready",
    content: {
      markdown: `# Brief\n\n${newsroomPackage.brief}\n\n- Audience: ${newsroomPackage.audience}\n- Platform: ${newsroomPackage.platform}\n- Tone: ${newsroomPackage.tone}`
    },
    sourceJobId: newsroomPackage.id,
    rails: ["assets", "text", "ai"],
    flowModes: ["outline"],
    inFlow: true,
    previewType: "markdown",
    outputType: "Package",
    sourceLabel: "Newsroom package",
    detail: newsroomPackage.slate_summary.join(" "),
    metricLabel: `${wordCount(newsroomPackage.brief)} words`,
    createdAt: newsroomPackage.generated_at,
    provenance: {
      job_id: newsroomPackage.id,
      model: "newsroom workflow",
      workspace: newsroomPackage.workspace_id
    }
  });

  elements.push({
    id: `newsroom-${newsroomPackage.id}-package`,
    workspaceId,
    kind: "markdown",
    title: narrative.title,
    status: "ready",
    content: { markdown: packageMarkdown },
    sourceJobId: newsroomPackage.id,
    rails: ["assets", "text"],
    flowModes: ["outline", "storyboard"],
    inFlow: true,
    previewType: "markdown",
    outputType: "Package",
    sourceLabel: "Narrative package",
    detail: narrative.prompt,
    metricLabel: `${wordCount(packageMarkdown)} words`,
    createdAt: newsroomPackage.generated_at,
    provenance: {
      job_id: newsroomPackage.id,
      topic_id: narrative.topic_id,
      angle_id: narrative.angle_id
    }
  });

  narrative.scene_plan.forEach((scene, index) => {
    elements.push({
      id: `newsroom-${newsroomPackage.id}-scene-${index}`,
      workspaceId,
      kind: "scene",
      title: scene.beat,
      status: "ready",
      content: {
        role: index === 0 ? "Opening hook" : "Storyboard beat",
        visual: scene.visual,
        narration: scene.narration,
        searchTerms: scene.search_terms.join(", ")
      },
      sourceJobId: newsroomPackage.id,
      rails: ["assets", "text", "video", "ai"],
      flowModes: ["outline", "storyboard"],
      inFlow: true,
      previewType: "card",
      outputType: "Short",
      sourceLabel: "Scene plan",
      detail: scene.visual,
      durationLabel: `${scene.duration_seconds}s`,
      metricLabel: `${scene.search_terms.length} search terms`,
      createdAt: newsroomPackage.generated_at,
      provenance: {
        job_id: newsroomPackage.id,
        source_topic: narrative.topic_id,
        search_terms: scene.search_terms.join(", ")
      }
    });
  });

  newsroomPackage.topic_cards.forEach((topic) => {
    const evidence = topic.evidence.map((item) => `${item.source}: ${item.signal}`).join("; ");
    elements.push({
      id: `newsroom-${newsroomPackage.id}-topic-${topic.id}`,
      workspaceId,
      kind: "ai",
      title: topic.title,
      status: "ready",
      content: {
        rationale: topic.summary,
        evidence,
        audienceFit: topic.audience_fit,
        platformFit: topic.platform_fit
      },
      sourceJobId: newsroomPackage.id,
      rails: ["assets", "ai", "text"],
      flowModes: ["outline"],
      previewType: "card",
      outputType: "Package",
      sourceLabel: "Topic slate",
      detail: topic.summary,
      confidence: topic.rank_score,
      metricLabel: `${Math.round(topic.rank_score)} score`,
      createdAt: newsroomPackage.generated_at,
      provenance: {
        topic_id: topic.id,
        urgency: topic.urgency,
        brand_fit: topic.brand_fit
      }
    });
  });

  return elements;
}

function kindForAsset(asset: AssetRecord): WorkbenchKind {
  const contentType = asset.content_type || "";
  if (contentType.startsWith("image/") || asset.kind.includes("image")) return "image";
  if (contentType.startsWith("audio/") || asset.kind.includes("audio")) return "audio";
  if (contentType.startsWith("video/") || ["source_video", "segment", "clip", "final_video", "generated_short"].includes(asset.kind)) return "video";
  if (asset.kind === "metadata" || contentType.includes("json")) return "metadata";
  return "output";
}

function railsForKind(kind: WorkbenchKind, assetKind?: string): RailId[] {
  if (kind === "markdown") return ["assets", "text"];
  if (kind === "image") return ["assets", "images"];
  if (kind === "video") return ["assets", "video"];
  if (kind === "audio") return ["assets", "audio"];
  if (kind === "metadata") return ["assets", "ai", "settings"];
  if (kind === "ai") return ["assets", "ai"];
  if (assetKind === "template") return ["templates"];
  return ["assets"];
}

function flowModesForKind(kind: WorkbenchKind): FlowMode[] {
  if (kind === "markdown") return ["outline", "storyboard"];
  if (kind === "image") return ["storyboard"];
  if (kind === "video" || kind === "audio") return ["storyboard", "timeline"];
  if (kind === "metadata" || kind === "clip_plan") return ["outline", "storyboard", "timeline"];
  if (kind === "scene") return ["outline", "storyboard"];
  return ["outline"];
}

function previewForKind(kind: WorkbenchKind): WorkbenchElement["previewType"] {
  if (kind === "markdown") return "markdown";
  if (kind === "image") return "thumbnail";
  if (kind === "video" || kind === "output") return "player";
  if (kind === "audio") return "waveform";
  if (kind === "metadata") return "table";
  return "card";
}

function mergeElement(element: WorkbenchElement, patch?: Partial<WorkbenchElement>) {
  if (!patch) return element;
  return {
    ...element,
    ...patch,
    content: {
      ...element.content,
      ...(patch.content || {})
    },
    provenance: {
      ...element.provenance,
      ...(patch.provenance || {})
    }
  };
}

function elementMatchesRail(element: WorkbenchElement, rail: RailId) {
  if (rail === "settings") return element.rails.includes("settings") || element.kind === "job";
  return element.rails.includes(rail);
}

function shouldFetchPreview(element: WorkbenchElement) {
  return ["image", "video", "output"].includes(element.kind);
}

function labelForKind(kind: WorkbenchKind) {
  const labels: Record<WorkbenchKind, string> = {
    markdown: "Markdown block",
    image: "Image",
    video: "Video clip",
    audio: "Audio",
    metadata: "Metadata table",
    clip_plan: "Clip plan",
    scene: "Scene",
    group: "Group",
    output: "Output",
    job: "Job",
    ai: "AI suggestion"
  };
  return labels[kind];
}

function labelForLane(kind: string) {
  if (kind === "video_clipping") return "Video Clipping";
  if (kind === "shorts") return "Shorts Generator";
  if (kind === "newsroom") return "Newsroom";
  return kind;
}

function outputForLane(kind: string): OutputType {
  if (kind === "video_clipping") return "Video";
  if (kind === "shorts") return "Short";
  if (kind === "newsroom") return "Package";
  return "Draft";
}

function modeForLane(lane: LaneId | null): FlowMode {
  if (lane === "video_clipping") return "timeline";
  if (lane === "shorts") return "storyboard";
  return "outline";
}

function outputForMode(mode: FlowMode, lane?: LaneId | null): OutputType {
  if (lane) return outputForLane(lane);
  if (mode === "timeline") return "Video";
  if (mode === "storyboard") return "Short";
  return "Package";
}

function toFlowMode(value: string | null): FlowMode | null {
  if (value === "outline" || value === "storyboard" || value === "timeline") return value;
  return null;
}

function canvasModeFor(element: WorkbenchElement) {
  if (element.kind === "markdown") return "Text package";
  if (element.kind === "image") return "Image composition";
  if (element.kind === "video" || element.kind === "output") return "Video preview";
  if (element.kind === "metadata") return "Metadata preview";
  return "Mixed media";
}

function railLabel(rail: RailId) {
  return railItems.find((item) => item.id === rail)?.label || "Assets";
}

function librarySubtitle(rail: RailId, count: number) {
  if (rail === "ai") return `${count} suggestions and jobs`;
  if (rail === "settings") return `${count} provenance records`;
  return `${count} production elements`;
}

function emptyLabel(rail: RailId) {
  if (rail === "text") return "No text elements yet";
  if (rail === "images") return "No image assets yet";
  if (rail === "video") return "No video clips yet";
  if (rail === "audio") return "No audio elements yet";
  if (rail === "ai") return "No AI suggestions yet";
  if (rail === "templates") return "No templates yet";
  if (rail === "settings") return "No provenance records yet";
  return "No assets yet";
}

function emptyDetail(rail: RailId) {
  if (rail === "text") return "Generate a newsroom package or draft a markdown block.";
  if (rail === "images") return "Upload or generate an image, then arrange it in storyboard Flow.";
  if (rail === "video") return "Import footage or render a short to preview video elements.";
  if (rail === "audio") return "Voiceover, extracted audio, and music will appear here.";
  if (rail === "ai") return "Plans, rationales, and rewrite suggestions will appear after jobs run.";
  if (rail === "templates") return "Story formats and platform presets can be added in a later pass.";
  if (rail === "settings") return "Storage, provenance, and output settings will appear here.";
  return "Use the start actions above to bring material into this workspace.";
}

function titleFromWorkspace(workspace: string) {
  return workspace
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function secondsLabel(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function flowSummary(element: WorkbenchElement, flowMode: FlowMode) {
  if (flowMode === "timeline") return element.durationLabel || element.metricLabel || "Clip on main track";
  if (flowMode === "storyboard") return element.detail || element.metricLabel || "Storyboard element";
  if (element.kind === "markdown") return `${wordCount(String(element.content.markdown || ""))} words`;
  return element.detail || element.metricLabel || labelForKind(element.kind);
}

function metadataRowsFor(element: WorkbenchElement) {
  return [
    { field: "asset_id", value: element.asset?.id || element.id },
    { field: "kind", value: element.asset?.kind || element.kind },
    { field: "source", value: element.asset?.gcs_uri || element.sourceLabel || "local" },
    { field: "status", value: element.status }
  ];
}

type MarkdownBlock = {
  type: "paragraph" | "heading" | "ordered-list" | "unordered-list" | "quote" | "table";
  text?: string;
  level?: number;
  items?: string[];
  headers?: string[];
  rows?: string[][];
};

function parseMarkdown(markdown: string): MarkdownBlock[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) {
      index += 1;
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2] });
      index += 1;
      continue;
    }

    if (trimmed.startsWith(">")) {
      const quotes: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith(">")) {
        quotes.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push({ type: "quote", text: quotes.join(" ") });
      continue;
    }

    if (isTableStart(lines, index)) {
      const headers = splitTableLine(lines[index]);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        rows.push(splitTableLine(lines[index]));
        index += 1;
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s+/, ""));
        index += 1;
      }
      blocks.push({ type: "ordered-list", items });
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*]\s+/, ""));
        index += 1;
      }
      blocks.push({ type: "unordered-list", items });
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !startsMarkdownBlock(lines, index)) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
  }

  return blocks;
}

function startsMarkdownBlock(lines: string[], index: number) {
  const trimmed = lines[index].trim();
  return /^(#{1,6})\s+/.test(trimmed) || trimmed.startsWith(">") || /^\d+\.\s+/.test(trimmed) || /^[-*]\s+/.test(trimmed) || isTableStart(lines, index);
}

function isTableStart(lines: string[], index: number) {
  return Boolean(lines[index]?.includes("|") && /^:?-{3,}:?(\s*\|\s*:?-{3,}:?)*$/.test(lines[index + 1]?.trim() || ""));
}

function splitTableLine(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderInline(text: string) {
  const nodes: ReactNode[] = [];
  const tokenPattern = /(!?\[[^\]]+\]\([^)]+\)|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const token = match[0];
    if (token.startsWith("`")) {
      nodes.push(<code key={`${token}-${match.index}`}>{token.slice(1, -1)}</code>);
    } else {
      const parsed = token.match(/^(!?)\[([^\]]+)\]\(([^)]+)\)$/);
      if (parsed?.[1]) {
        nodes.push(
          <span className="markdown-image-ref" key={`${token}-${match.index}`}>
            <ImageIcon size={14} />
            {parsed[2]}
            <code>{parsed[3]}</code>
          </span>
        );
      } else if (parsed) {
        nodes.push(
          <a href={parsed[3]} target="_blank" rel="noreferrer" key={`${token}-${match.index}`}>
            {parsed[2]}
          </a>
        );
      }
    }
    lastIndex = tokenPattern.lastIndex;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes.map((node, index) => <Fragment key={index}>{node}</Fragment>);
}
