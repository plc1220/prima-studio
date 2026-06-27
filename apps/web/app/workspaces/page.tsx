"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Film,
  FolderSearch,
  Newspaper,
  RefreshCw,
  Search,
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
    empty: string;
    icon: React.ReactNode;
  }
> = {
  newsroom: {
    title: "Newsroom",
    tag: "Newsroom",
    href: "/newsroom",
    empty: "No newsroom packages yet.",
    icon: <Newspaper size={18} />
  },
  video_clipping: {
    title: "Video Clipping",
    tag: "Video Clipping",
    href: "/video-clipping",
    empty: "No clipping jobs yet.",
    icon: <Film size={18} />
  },
  shorts: {
    title: "Shorts Generator",
    tag: "Shorts",
    href: "/shorts",
    empty: "No shorts yet.",
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

  const rows = workspaces.length ? workspaces : starterWorkspaces;

  const filteredWorkspaces = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((workspace) => {
      const tag = workspace.lane ? laneMeta[workspace.lane]?.tag || workspace.lane : "untagged";
      return !needle || workspace.id.toLowerCase().includes(needle) || tag.toLowerCase().includes(needle);
    });
  }, [query, rows]);

  return (
    <>
      <section className="topbar workspace-topbar">
        <div>
          <div className="eyebrow">Workspaces</div>
          <h1>Search workspaces</h1>
          <p className="muted">Each workspace has one production tag and opens in the matching lane.</p>
        </div>
        <button className="icon-button" onClick={refresh} aria-label="Refresh workspaces" title="Refresh workspaces">
          <RefreshCw size={18} />
        </button>
      </section>

      <section className="workspace-search">
        <div className="search-field">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search workspaces or tags" />
        </div>
      </section>

      {message ? <p className="muted code">{message}</p> : null}

      <section className="workspace-list">
        {filteredWorkspaces.length ? (
          filteredWorkspaces.map((workspace) => (
            <WorkspaceRow workspace={workspace} jobs={jobsByWorkspace[workspace.id] || []} onTag={tagWorkspace} key={workspace.id} />
          ))
        ) : (
          <div className="empty-state">No workspace matches this search.</div>
        )}
      </section>
    </>
  );
}

function WorkspaceRow({
  workspace,
  jobs,
  onTag
}: {
  workspace: WorkspaceRecord;
  jobs: JobRecord[];
  onTag: (workspaceId: string, lane: LaneId) => void;
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
            <span>{new Date(job.created_at).toLocaleDateString()}</span>
            <StatusPill status={job.status} />
          </Link>
        ))}
        {!jobs.length ? <span className="muted">{meta?.empty || "No tagged jobs yet."}</span> : null}
      </div>
      <div className="actions">
        {meta ? (
          <Link className="button secondary" href={`${meta.href}?workspace=${encodeURIComponent(workspace.id)}`}>
            Open <ArrowRight size={16} />
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
      </div>
    </article>
  );
}
