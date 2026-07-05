"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Film,
  FolderSearch,
  Newspaper,
  Plus,
  RefreshCw,
  Search,
  TimerReset,
  Trash2,
  WandSparkles
} from "lucide-react";
import { apiFetch, type JobRecord, type WorkspaceRecord } from "@/lib/api";
import { StatusPill } from "@/components/StatusPill";

type LaneId = "newsroom" | "video_clipping" | "shorts";

const laneMeta: Record<
  LaneId,
  {
    title: string;
    tag: string;
    href: string;
    placeholder: string;
    empty: string;
    description: string;
    action: string;
    icon: React.ReactNode;
  }
> = {
  newsroom: {
    title: "Newsroom",
    tag: "Newsroom",
    href: "/newsroom",
    placeholder: "daily-newsroom",
    empty: "No newsroom packages yet.",
    description: "Generate editorial angles, scripts, scene plans, and handoffs for short-form production.",
    action: "Open newsroom",
    icon: <Newspaper size={18} />
  },
  video_clipping: {
    title: "Video Clipping",
    tag: "Video Clipping",
    href: "/video-clipping",
    placeholder: "campaign-clips",
    empty: "No clipping jobs yet.",
    description: "Sync source footage, split segments, generate metadata, produce clips, and join finals.",
    action: "Open clipping",
    icon: <Film size={18} />
  },
  shorts: {
    title: "Shorts Generator",
    tag: "Shorts",
    href: "/shorts",
    placeholder: "social-shorts",
    empty: "No shorts yet.",
    description: "Turn briefs or approved packages into voiced, subtitled, rendered social videos.",
    action: "Open shorts",
    icon: <WandSparkles size={18} />
  }
};

const starterWorkspaces: WorkspaceRecord[] = [
  { id: "media-prima-newsroom", name: "media-prima-newsroom", lane: "newsroom", created_at: new Date().toISOString() },
  { id: "media-prima-video-clipping", name: "media-prima-video-clipping", lane: "video_clipping", created_at: new Date().toISOString() },
  { id: "media-prima-shorts", name: "media-prima-shorts", lane: "shorts", created_at: new Date().toISOString() }
];

export default function WorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [jobsByWorkspace, setJobsByWorkspace] = useState<Record<string, JobRecord[]>>({});
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
      const rows = await apiFetch<WorkspaceRecord[]>("/workspaces");
      setWorkspaces(rows);
      const taggedRows = rows.filter((workspace) => workspace.lane && laneMeta[workspace.lane]);
      const jobPairs = await Promise.all(
        taggedRows.slice(0, 18).map(async (workspace) => {
          const jobs = await apiFetch<JobRecord[]>(`/workspaces/${encodeURIComponent(workspace.id)}/jobs?kind=${workspace.lane}`);
          return [workspace.id, jobs.slice(0, 3)] as const;
        })
      );
      setJobsByWorkspace(Object.fromEntries(jobPairs));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load workspaces");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function tagWorkspace(workspaceId: string, lane: LaneId) {
    setMessage("");
    try {
      await apiFetch<WorkspaceRecord>("/workspaces", {
        method: "POST",
        body: JSON.stringify({ workspace_id: workspaceId, lane })
      });
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to tag workspace");
    }
  }

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

  const rows = workspaces.length ? workspaces : starterWorkspaces;

  const filteredWorkspaces = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((workspace) => {
      const tag = workspace.lane ? laneMeta[workspace.lane]?.tag || workspace.lane : "untagged";
      return !needle || workspace.id.toLowerCase().includes(needle) || tag.toLowerCase().includes(needle);
    });
  }, [query, rows]);

  const laneSummaries = useMemo(
    () =>
      (Object.keys(laneMeta) as LaneId[]).map((laneId) => {
        const laneWorkspaces = rows.filter((workspace) => workspace.lane === laneId);
        const laneJobs = laneWorkspaces.reduce((count, workspace) => count + (jobsByWorkspace[workspace.id]?.length || 0), 0);
        return {
          id: laneId,
          ...laneMeta[laneId],
          workspaceCount: laneWorkspaces.length,
          jobCount: laneJobs,
          primaryWorkspace: laneWorkspaces[0]?.id || starterWorkspaces.find((workspace) => workspace.lane === laneId)?.id
        };
      }),
    [jobsByWorkspace, rows]
  );

  const taggedCount = rows.filter((workspace) => workspace.lane && laneMeta[workspace.lane]).length;
  const recentJobs = Object.values(jobsByWorkspace).flat().length;

  return (
    <>
      <section className="workspace-hero">
        <div>
          <div className="eyebrow">Workspaces</div>
          <h1>Production command center</h1>
          <p className="muted">Find a workspace, check lane activity, and jump directly into the matching production tool.</p>
        </div>
        <div className="hero-actions">
          <div className="hero-stat">
            <strong>{rows.length}</strong>
            <span>Workspaces</span>
          </div>
          <div className="hero-stat">
            <strong>{taggedCount}</strong>
            <span>Tagged</span>
          </div>
          <div className="hero-stat">
            <strong>{recentJobs}</strong>
            <span>Recent jobs</span>
          </div>
          <button className="icon-button" onClick={() => setShowCreate((current) => !current)} aria-label="Create workspace" title="Create workspace">
            <Plus size={18} />
          </button>
          <button className="icon-button hero-refresh" onClick={refresh} aria-label="Refresh workspaces" title="Refresh workspaces">
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

      <section className="lane-summary-grid" aria-label="Production lanes">
        {laneSummaries.map((lane) => (
          <article className="lane-summary-card" key={lane.id}>
            <div className="lane-summary-heading">
              <span className="icon-box">{lane.icon}</span>
              <div>
                <h2>{lane.title}</h2>
                <p className="muted">{lane.description}</p>
              </div>
            </div>
            <div className="lane-summary-metrics">
              <span>
                <FolderSearch size={15} />
                {lane.workspaceCount} workspaces
              </span>
              <span>
                <TimerReset size={15} />
                {lane.jobCount} recent jobs
              </span>
            </div>
            <Link className="button secondary lane-summary-action" href={`${lane.href}?workspace=${encodeURIComponent(lane.primaryWorkspace || "")}`}>
              {lane.action} <ArrowRight size={16} />
            </Link>
          </article>
        ))}
      </section>

      <section className="workspace-toolbar">
        <div className="search-field">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search workspaces or tags" />
        </div>
        <span className="muted">
          Showing {filteredWorkspaces.length} of {rows.length}
        </span>
      </section>

      {message ? <p className="muted code">{message}</p> : null}

      <section className="workspace-list">
        {filteredWorkspaces.length ? (
          filteredWorkspaces.map((workspace) => (
            <WorkspaceRow
              workspace={workspace}
              jobs={jobsByWorkspace[workspace.id] || []}
              onTag={tagWorkspace}
              onDelete={setWorkspaceToDelete}
              isBusy={busyWorkspace === workspace.id}
              isPlaceholder={!workspaces.length}
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
  jobs,
  onTag,
  onDelete,
  isBusy,
  isPlaceholder
}: {
  workspace: WorkspaceRecord;
  jobs: JobRecord[];
  onTag: (workspaceId: string, lane: LaneId) => void;
  onDelete: (workspace: WorkspaceRecord) => void;
  isBusy: boolean;
  isPlaceholder: boolean;
}) {
  const lane = workspace.lane && laneMeta[workspace.lane] ? workspace.lane : null;
  const meta = lane ? laneMeta[lane] : null;

  return (
    <article className="workspace-row tagged-workspace-row">
      <div className="workspace-main">
        <div className="icon-box">
          {meta?.icon || <FolderSearch size={18} />}
        </div>
        <div>
          <div className="workspace-title-line">
            <h2>{workspace.id}</h2>
            <span className={meta ? "workspace-tag" : "workspace-tag untagged"}>{meta?.tag || "Untagged"}</span>
          </div>
          <p className="muted">Created {new Date(workspace.created_at).toLocaleString()}</p>
        </div>
      </div>
      <div className="mini-jobs">
        {jobs.map((job) => (
          <Link className="mini-job" href={`/jobs/${job.id}`} key={job.id}>
            <span className="mini-job-date">
              <CheckCircle2 size={14} />
              {new Date(job.created_at).toLocaleDateString()}
            </span>
            <StatusPill status={job.status} />
          </Link>
        ))}
        {!jobs.length ? <span className="muted">{meta?.empty || "No tagged jobs yet."}</span> : null}
      </div>
      <div className="actions">
        {meta ? (
          <Link className="button secondary" href={`${meta.href}?workspace=${encodeURIComponent(workspace.id)}`}>
            {meta.action} <ArrowRight size={16} />
          </Link>
        ) : (
          <div className="tag-actions" aria-label={`Tag ${workspace.id}`}>
            {(Object.keys(laneMeta) as LaneId[]).map((laneId) => (
              <button type="button" key={laneId} onClick={() => onTag(workspace.id, laneId)}>
                {laneMeta[laneId].tag}
              </button>
            ))}
          </div>
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
