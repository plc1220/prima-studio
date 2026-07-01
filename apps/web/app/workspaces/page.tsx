"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Film,
  FolderSearch,
  Newspaper,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  WandSparkles
} from "lucide-react";
import { apiFetch, type WorkspaceRecord } from "@/lib/api";

type LaneId = "newsroom" | "video_clipping" | "shorts";

const laneMeta: Record<
  LaneId,
  {
    title: string;
    tag: string;
    href: string;
    placeholder: string;
    icon: React.ReactNode;
  }
> = {
  newsroom: {
    title: "Newsroom",
    tag: "Newsroom",
    href: "/newsroom",
    placeholder: "daily-newsroom",
    icon: <Newspaper size={18} />
  },
  video_clipping: {
    title: "Video Clipping",
    tag: "Video Clipping",
    href: "/video-clipping",
    placeholder: "campaign-clips",
    icon: <Film size={18} />
  },
  shorts: {
    title: "Shorts Generator",
    tag: "Shorts",
    href: "/shorts",
    placeholder: "social-shorts",
    icon: <WandSparkles size={18} />
  }
};

const starterWorkspaces: WorkspaceRecord[] = [
  { id: "media-prima-newsroom", name: "media-prima-newsroom", lane: "newsroom", created_at: "2024-01-01T00:00:00.000Z" },
  { id: "media-prima-video-clipping", name: "media-prima-video-clipping", lane: "video_clipping", created_at: "2024-01-01T00:00:00.000Z" },
  { id: "media-prima-shorts", name: "media-prima-shorts", lane: "shorts", created_at: "2024-01-01T00:00:00.000Z" }
];

function isLaneId(value: WorkspaceRecord["lane"]): value is LaneId {
  return value === "newsroom" || value === "video_clipping" || value === "shorts";
}

function formatCreatedAt(value: string) {
  return value.slice(0, 10);
}

export default function WorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [hasLoadedWorkspaces, setHasLoadedWorkspaces] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedLane, setSelectedLane] = useState<LaneId>("newsroom");
  const [newWorkspaceId, setNewWorkspaceId] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [busyWorkspace, setBusyWorkspace] = useState("");
  const [workspaceToDelete, setWorkspaceToDelete] = useState<WorkspaceRecord | null>(null);
  const [message, setMessage] = useState("");

  async function refresh() {
    setMessage("");
    try {
      setWorkspaces(await apiFetch<WorkspaceRecord[]>("/workspaces"));
      setHasLoadedWorkspaces(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load workspaces");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const rows = hasLoadedWorkspaces ? workspaces : starterWorkspaces;
  const isShowingStarterRows = !hasLoadedWorkspaces;

  const filteredWorkspaces = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((workspace) => {
      const tag = isLaneId(workspace.lane) ? laneMeta[workspace.lane].tag : "untagged";
      return !needle || workspace.id.toLowerCase().includes(needle) || tag.toLowerCase().includes(needle);
    });
  }, [query, rows]);

  async function createWorkspace() {
    const workspaceId = newWorkspaceId.trim();
    if (!workspaceId) return;
    setBusyWorkspace(workspaceId);
    setMessage("");
    try {
      await apiFetch<WorkspaceRecord>("/workspaces", {
        method: "POST",
        body: JSON.stringify({ workspace_id: workspaceId, lane: selectedLane })
      });
      window.location.assign(`${laneMeta[selectedLane].href}?workspace=${encodeURIComponent(workspaceId)}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create workspace");
      setBusyWorkspace("");
    }
  }

  async function deleteWorkspace(workspaceId: string) {
    setBusyWorkspace(workspaceId);
    setMessage("");
    try {
      await apiFetch<{ status: string }>(`/workspaces/${encodeURIComponent(workspaceId)}`, { method: "DELETE" });
      setWorkspaceToDelete(null);
      await refresh();
      setMessage(`Deleted ${workspaceId}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete workspace");
    } finally {
      setBusyWorkspace("");
    }
  }

  return (
    <>
      <section className="topbar workspace-topbar">
        <div>
          <div className="eyebrow">Workspaces</div>
          <h1>Select a workspace first</h1>
          <p className="muted">Open the workspace, then continue in Newsroom, Video Clipping, or Shorts Generator.</p>
        </div>
        <div className="actions">
          <button className="icon-button" onClick={() => setShowCreate((current) => !current)} aria-label="Create workspace" title="Create workspace">
            <Plus size={18} />
          </button>
          <button className="icon-button" onClick={refresh} aria-label="Refresh workspaces" title="Refresh workspaces">
            <RefreshCw size={18} />
          </button>
        </div>
      </section>

      {showCreate ? (
        <section className="workspace-create">
          <div className="lane-picker" role="tablist" aria-label="Workspace function">
            {(Object.keys(laneMeta) as LaneId[]).map((laneId) => (
              <button
                type="button"
                role="tab"
                aria-selected={selectedLane === laneId}
                className={selectedLane === laneId ? "lane-pill active" : "lane-pill"}
                key={laneId}
                onClick={() => setSelectedLane(laneId)}
              >
                {laneMeta[laneId].icon}
                <span>{laneMeta[laneId].tag}</span>
              </button>
            ))}
          </div>
          <div className="quick-open workspace-create-field">
            <input
              value={newWorkspaceId}
              onChange={(event) => setNewWorkspaceId(event.target.value)}
              placeholder={laneMeta[selectedLane].placeholder}
              onKeyDown={(event) => {
                if (event.key === "Enter") createWorkspace();
              }}
            />
            <button className="button quick-open-button" type="button" onClick={createWorkspace} disabled={!newWorkspaceId.trim() || !!busyWorkspace}>
              <Plus size={16} /> Create
            </button>
          </div>
        </section>
      ) : null}

      <section className="workspace-search">
        <div className="search-field">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search workspaces" />
        </div>
      </section>

      {message ? <p className="muted code">{message}</p> : null}

      <section className="workspace-list">
        {filteredWorkspaces.length ? (
          filteredWorkspaces.map((workspace) => (
            <WorkspaceRow
              workspace={workspace}
              onDelete={setWorkspaceToDelete}
              isBusy={busyWorkspace === workspace.id}
              isPlaceholder={isShowingStarterRows}
              key={workspace.id}
            />
          ))
        ) : (
          <div className="empty-state">No workspace matches this search.</div>
        )}
      </section>

      {workspaceToDelete ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setWorkspaceToDelete(null)}>
          <section
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-workspace-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div>
              <div className="eyebrow">Delete Workspace</div>
              <h2 id="delete-workspace-title">Delete {workspaceToDelete.id}?</h2>
            </div>
            <p className="muted">
              This removes the local workspace record, jobs, queued tasks, and assets tracked by the API.
            </p>
            <div className="modal-actions">
              <button className="button secondary" type="button" onClick={() => setWorkspaceToDelete(null)} disabled={!!busyWorkspace}>
                Cancel
              </button>
              <button
                className="button danger"
                type="button"
                onClick={() => deleteWorkspace(workspaceToDelete.id)}
                disabled={!!busyWorkspace}
              >
                <Trash2 size={16} /> Delete
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function WorkspaceRow({
  workspace,
  onDelete,
  isBusy,
  isPlaceholder
}: {
  workspace: WorkspaceRecord;
  onDelete: (workspace: WorkspaceRecord) => void;
  isBusy: boolean;
  isPlaceholder: boolean;
}) {
  const lane = isLaneId(workspace.lane) ? workspace.lane : null;
  const meta = lane ? laneMeta[lane] : null;
  const href = meta ? `${meta.href}?workspace=${encodeURIComponent(workspace.id)}` : "/workspaces";

  return (
    <article className="workspace-row tagged-workspace-row">
      <Link className="workspace-main workspace-open-area" href={href}>
        <div className="icon-box">
          {meta?.icon || <FolderSearch size={18} />}
        </div>
        <div>
          <div className="workspace-title-line">
            <h2>{workspace.id}</h2>
            <span className={meta ? "workspace-tag" : "workspace-tag untagged"}>{meta?.tag || "Untagged"}</span>
          </div>
          <p className="muted">{isPlaceholder ? "Starter workspace" : `Created ${formatCreatedAt(workspace.created_at)}`}</p>
        </div>
      </Link>
      <div className="workspace-row-right">
        {meta ? (
          <Link className="button secondary" href={href}>
            Open <ArrowRight size={16} />
          </Link>
        ) : (
          <span className="muted">Create a new tagged workspace instead.</span>
        )}
        {!isPlaceholder ? (
          <button
            className="icon-button danger workspace-delete"
            type="button"
            onClick={() => onDelete(workspace)}
            disabled={isBusy}
            aria-label={`Delete ${workspace.id}`}
            title={`Delete ${workspace.id}`}
          >
            <Trash2 size={18} />
          </button>
        ) : null}
      </div>
    </article>
  );
}
