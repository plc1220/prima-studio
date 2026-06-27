"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Film, FolderSearch, Newspaper, RefreshCw, Search, WandSparkles } from "lucide-react";
import { apiFetch, type JobRecord, type WorkspaceRecord } from "@/lib/api";
import { StatusPill } from "@/components/StatusPill";

type LaneId = "newsroom" | "video_clipping" | "shorts";

const lanes: Array<{
  id: LaneId;
  title: string;
  eyebrow: string;
  description: string;
  href: string;
  defaultWorkspace: string;
  empty: string;
  icon: React.ReactNode;
}> = [
  {
    id: "newsroom",
    title: "Newsroom",
    eyebrow: "Editorial lane",
    description: "Research slates, approved angles, scripts, captions, and handoff packages.",
    href: "/newsroom",
    defaultWorkspace: "media-prima-newsroom",
    empty: "No newsroom packages yet.",
    icon: <Newspaper size={20} />
  },
  {
    id: "video_clipping",
    title: "Video Clipping",
    eyebrow: "Owned-footage lane",
    description: "Uploads, metadata analysis, generated clips, and final MP4 outputs.",
    href: "/video-clipping",
    defaultWorkspace: "media-prima-video-clipping",
    empty: "No clipping jobs yet.",
    icon: <Film size={20} />
  },
  {
    id: "shorts",
    title: "Shorts",
    eyebrow: "Social render lane",
    description: "Prompt-to-short jobs, scripts, stock plans, and rendered social videos.",
    href: "/shorts",
    defaultWorkspace: "media-prima-shorts",
    empty: "No shorts yet.",
    icon: <WandSparkles size={20} />
  }
];

type LaneState = Record<LaneId, WorkspaceRecord[]>;
type LaneJobs = Record<string, JobRecord[]>;

const emptyLaneState: LaneState = { newsroom: [], video_clipping: [], shorts: [] };

export default function WorkspacesPage() {
  const [workspacesByLane, setWorkspacesByLane] = useState<LaneState>(emptyLaneState);
  const [jobsByWorkspace, setJobsByWorkspace] = useState<LaneJobs>({});
  const [query, setQuery] = useState("");
  const [quickOpen, setQuickOpen] = useState<Record<LaneId, string>>({
    newsroom: "media-prima-newsroom",
    video_clipping: "media-prima-video-clipping",
    shorts: "media-prima-shorts"
  });
  const [message, setMessage] = useState("");

  async function refresh() {
    setMessage("");
    try {
      const lanePairs = await Promise.all(
        lanes.map(async (lane) => {
          const rows = await apiFetch<WorkspaceRecord[]>(`/workspaces?lane=${lane.id}`);
          return [lane.id, rows] as const;
        })
      );
      const nextWorkspaces = Object.fromEntries(lanePairs) as LaneState;
      setWorkspacesByLane(nextWorkspaces);

      const jobPairs = await Promise.all(
        lanes.flatMap((lane) =>
          nextWorkspaces[lane.id].slice(0, 8).map(async (workspace) => {
            const jobs = await apiFetch<JobRecord[]>(`/workspaces/${encodeURIComponent(workspace.id)}/jobs?kind=${lane.id}`);
            return [`${lane.id}:${workspace.id}`, jobs.slice(0, 3)] as const;
          })
        )
      );
      setJobsByWorkspace(Object.fromEntries(jobPairs));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load workspaces");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const filteredByLane = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return lanes.reduce<Record<LaneId, WorkspaceRecord[]>>(
      (groups, lane) => {
        const rows = workspacesByLane[lane.id];
        groups[lane.id] = needle ? rows.filter((workspace) => workspace.id.toLowerCase().includes(needle)) : rows;
        return groups;
      },
      { newsroom: [], video_clipping: [], shorts: [] }
    );
  }, [query, workspacesByLane]);

  function updateQuickOpen(lane: LaneId, value: string) {
    setQuickOpen((current) => ({ ...current, [lane]: value }));
  }

  return (
    <>
      <section className="topbar">
        <div>
          <div className="eyebrow">Production Lanes</div>
          <h1>One workspace belongs to one lane</h1>
          <p className="muted">Open the lane first, then pick a workspace inside it. Newsroom, clipping, and shorts no longer share one merged list.</p>
        </div>
        <button className="icon-button" onClick={refresh} aria-label="Refresh workspaces" title="Refresh workspaces">
          <RefreshCw size={18} />
        </button>
      </section>

      <section className="toolbar lane-toolbar">
        <div className="search-field">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search within lane workspaces" />
        </div>
        {lanes.map((lane) => (
          <div className="quick-open" key={lane.id}>
            <input value={quickOpen[lane.id]} onChange={(event) => updateQuickOpen(lane.id, event.target.value)} placeholder={`${lane.title} workspace`} />
            <Link className="button" href={`${lane.href}?workspace=${encodeURIComponent(quickOpen[lane.id])}`}>
              {lane.title} <ArrowRight size={16} />
            </Link>
          </div>
        ))}
      </section>

      {message ? <p className="muted code">{message}</p> : null}

      <section className="lane-grid">
        {lanes.map((lane) => {
          const rows = filteredByLane[lane.id];
          return (
            <div className="list-panel lane-panel" key={lane.id}>
              <div className="section-heading lane-panel-heading">
                <span className="icon-box">{lane.icon}</span>
                <div>
                  <div className="eyebrow">{lane.eyebrow}</div>
                  <h2>{lane.title}</h2>
                  <p className="muted">{lane.description}</p>
                </div>
              </div>
              {rows.length ? rows.map((workspace) => <WorkspaceRow lane={lane} workspace={workspace} jobs={jobsByWorkspace[`${lane.id}:${workspace.id}`] || []} key={workspace.id} />) : null}
              {!rows.length ? (
                <article className="workspace-row empty-lane-row">
                  <div className="workspace-main">
                    <div className="icon-box">
                      <FolderSearch size={20} />
                    </div>
                    <div>
                      <h2>{lane.defaultWorkspace}</h2>
                      <p className="muted">No saved {lane.title.toLowerCase()} workspaces yet. Open the lane to create one.</p>
                    </div>
                  </div>
                  <div className="actions">
                    <Link className="button secondary" href={`${lane.href}?workspace=${encodeURIComponent(lane.defaultWorkspace)}`}>
                      Open {lane.title} <ArrowRight size={16} />
                    </Link>
                  </div>
                </article>
              ) : null}
            </div>
          );
        })}
      </section>
    </>
  );
}

function WorkspaceRow({
  lane,
  workspace,
  jobs
}: {
  lane: (typeof lanes)[number];
  workspace: WorkspaceRecord;
  jobs: JobRecord[];
}) {
  return (
    <article className="workspace-row">
      <div className="workspace-main">
        <div className="icon-box">
          <FolderSearch size={20} />
        </div>
        <div>
          <h2>{workspace.id}</h2>
          <p className="muted">Created {new Date(workspace.created_at).toLocaleString()}</p>
        </div>
      </div>
      <div className="mini-jobs">
        {jobs.map((job) => (
          <Link className="mini-job" href={`/jobs/${job.id}`} key={job.id}>
            <span>{lane.title}</span>
            <StatusPill status={job.status} />
          </Link>
        ))}
        {!jobs.length ? <span className="muted">{lane.empty}</span> : null}
      </div>
      <div className="actions">
        <Link className="button secondary" href={`${lane.href}?workspace=${encodeURIComponent(workspace.id)}`}>
          Open <ArrowRight size={16} />
        </Link>
      </div>
    </article>
  );
}
