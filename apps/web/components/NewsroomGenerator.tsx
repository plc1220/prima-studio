"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Gauge,
  Globe2,
  Newspaper,
  Radio,
  RefreshCw,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  X
} from "lucide-react";
import {
  apiFetch,
  type JobDetail,
  type JobRecord,
  type NewsroomNarrativePackage,
  type NewsroomPackage,
  type NewsroomTopicCard,
  type WorkspaceRecord,
  type WorkflowResponse
} from "@/lib/api";
import { StatusPill } from "@/components/StatusPill";

const defaultWorkspaceId = "media-prima-newsroom";
const lane = "newsroom";
const shortsLane = "shorts";

const liveSignals = [
  { label: "Trend velocity", value: "+38%", detail: "Living costs and household budgets accelerated over the last hour." },
  { label: "Global signal alert", value: "SEA", detail: "Creator economy and family finance angles are rising across regional feeds." },
  { label: "Archive media match", value: "3 assets", detail: "sample-broadcast.mp4 and two clinic explainers match the topic cluster." }
];

const automatedRecommendations = [
  {
    title: "Young families explain the new cost-of-living playbook",
    reasoning: "Assembled because 'Living Costs' matches library asset sample-broadcast.mp4 and today's urban-family audience filter.",
    format: "9:16 short package",
    confidence: "High confidence",
    signal: "Trend velocity +38%"
  },
  {
    title: "Creator economy side income, without the hype",
    reasoning: "Assembled because creator-job chatter overlaps with verified newsroom angles and available explainer footage.",
    format: "Carousel-to-short handoff",
    confidence: "Medium confidence",
    signal: "Regional signal SEA"
  }
];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function NewsroomGenerator() {
  const params = useSearchParams();
  const [workspaceId, setWorkspaceId] = useState(params.get("workspace") || defaultWorkspaceId);
  const [brief, setBrief] = useState("Malaysia digital audiences are discussing rising living costs, creator economy jobs, and how young families are adapting.");
  const [audience, setAudience] = useState("Urban Malaysian Gen Z and young families");
  const [platform, setPlatform] = useState("TikTok, Reels, Shorts");
  const [urgency, setUrgency] = useState("today");
  const [tone, setTone] = useState("clear, social-first, credible");
  const [brandFit, setBrandFit] = useState("Media Prima newsroom standards");
  const [slateMode, setSlateMode] = useState("daily");
  const [slateSize, setSlateSize] = useState(5);
  const [language, setLanguage] = useState("ms-MY");
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [duration, setDuration] = useState(45);
  const [jobs, setJobs] = useState<JobDetail[]>([]);
  const [packagesByJob, setPackagesByJob] = useState<Record<string, NewsroomPackage>>({});
  const [activeJobId, setActiveJobId] = useState("");
  const [selectedTopicId, setSelectedTopicId] = useState("");
  const [selectedAngleId, setSelectedAngleId] = useState("");
  const [curationVelocity, setCurationVelocity] = useState(62);
  const [exclusions, setExclusions] = useState("politics, unverified health claims");
  const [guardrailsOpen, setGuardrailsOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function refreshHistory(nextWorkspace = workspaceId) {
    setMessage("");
    try {
      const rows = await apiFetch<JobRecord[]>(`/workspaces/${encodeURIComponent(nextWorkspace)}/jobs?kind=newsroom`);
      const details = await Promise.all(rows.slice(0, 8).map((job) => apiFetch<JobDetail>(`/jobs/${job.id}`)));
      setJobs(details);
      const pairs = await Promise.all(
        details.map(async (job) => {
          try {
            const newsroomPackage = await apiFetch<NewsroomPackage>(`/jobs/${job.id}/newsroom-package`);
            return [job.id, newsroomPackage] as const;
          } catch {
            return null;
          }
        })
      );
      const nextPackages = Object.fromEntries(pairs.filter(Boolean) as Array<readonly [string, NewsroomPackage]>);
      setPackagesByJob(nextPackages);
      const firstPackage = details.map((job) => nextPackages[job.id]).find(Boolean);
      if (!activeJobId && firstPackage) {
        activatePackage(firstPackage);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load newsroom packages");
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

  const packageRows = useMemo(
    () => Object.values(packagesByJob).sort((a, b) => Date.parse(b.generated_at) - Date.parse(a.generated_at)),
    [packagesByJob]
  );

  const activePackage = activeJobId ? packagesByJob[activeJobId] : packageRows[0];
  const selectedCard = activePackage?.topic_cards.find((card) => card.id === selectedTopicId) || activePackage?.topic_cards[0];
  const selectedAngle =
    selectedCard?.angles.find((angle) => angle.id === selectedAngleId) ||
    selectedCard?.angles.find((angle) => angle.id === selectedCard.recommended_angle_id) ||
    selectedCard?.angles[0];
  const selectedNarrative = activePackage
    ? narrativeFor(activePackage, selectedCard?.id || "", selectedAngle?.id || "")
    : undefined;

  function activatePackage(newsroomPackage: NewsroomPackage) {
    setActiveJobId(newsroomPackage.id);
    setSelectedTopicId(newsroomPackage.selected_topic_id || newsroomPackage.topic_cards[0]?.id || "");
    setSelectedAngleId(
      newsroomPackage.selected_angle_id ||
        newsroomPackage.topic_cards[0]?.recommended_angle_id ||
        newsroomPackage.topic_cards[0]?.angles[0]?.id ||
        ""
    );
  }

  function selectTopic(card: NewsroomTopicCard) {
    setSelectedTopicId(card.id);
    setSelectedAngleId(card.recommended_angle_id || card.angles[0]?.id || "");
  }

  async function startWorkflow() {
    setBusy(true);
    setMessage("");
    try {
      const selectedWorkspace = await ensureSelectedWorkspace();
      const response = await apiFetch<WorkflowResponse>("/workflows/newsroom", {
        method: "POST",
        body: JSON.stringify({
          workspace_id: selectedWorkspace,
          brief,
          audience,
          platform,
          urgency,
          tone,
          brand_fit: brandFit,
          slate_mode: slateMode,
          slate_size: slateSize,
          language,
          aspect_ratio: aspectRatio,
          duration_seconds: duration,
          output_prefix: "outputs/newsroom"
        })
      });
      setActiveJobId(response.job_id);
      setMessage("Newsroom package queued");
      const newsroomPackage = await waitForPackage(response.job_id);
      setPackagesByJob((current) => ({ ...current, [response.job_id]: newsroomPackage }));
      activatePackage(newsroomPackage);
      await refreshHistory(selectedWorkspace);
      setMessage("Newsroom package ready");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to generate newsroom package");
    } finally {
      setBusy(false);
    }
  }

  async function waitForPackage(jobId: string) {
    for (let attempt = 0; attempt < 16; attempt += 1) {
      try {
        return await apiFetch<NewsroomPackage>(`/jobs/${jobId}/newsroom-package`);
      } catch {
        const detail = await apiFetch<JobDetail>(`/jobs/${jobId}`);
        if (detail.status === "failed") {
          throw new Error(detail.error || "Newsroom workflow failed");
        }
        await sleep(1200);
      }
    }
    throw new Error("Newsroom job is still running. Refresh this page in a moment.");
  }

  async function sendToShortsGenerator(narrative: NewsroomNarrativePackage) {
    setBusy(true);
    setMessage("");
    try {
      const selectedWorkspace = shortsWorkspaceFor(workspaceId);
      await apiFetch<WorkspaceRecord>("/workspaces", {
        method: "POST",
        body: JSON.stringify({ workspace_id: selectedWorkspace, lane: shortsLane })
      });
      const response = await apiFetch<WorkflowResponse>("/workflows/shorts", {
        method: "POST",
        body: JSON.stringify({
          workspace_id: selectedWorkspace,
          prompt: narrative.handoff.prompt,
          script: narrative.handoff.script,
          search_terms: narrative.handoff.search_terms,
          language,
          aspect_ratio: aspectRatio,
          voice_name: language === "ms-MY" ? "ms-MY-Standard-A" : "en-US-Neural2-F",
          output_prefix: "outputs/shorts",
          duration_seconds: duration,
          source_newsroom_job_id: narrative.handoff.source_newsroom_job_id,
          source_topic_id: narrative.handoff.source_topic_id,
          source_angle_id: narrative.handoff.source_angle_id,
          source_package_uri: narrative.handoff.source_package_uri
        })
      });
      setMessage(`Shorts job queued in ${selectedWorkspace}: ${response.job_id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to hand off package");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="topbar">
        <div>
          <div className="eyebrow">Editorial Intelligence</div>
          <h1>Newsroom Generator</h1>
          <p className="muted">Research brief to ranked angles, approved scripts, scene plans, captions, and Shorts Generator handoff.</p>
        </div>
        <button className="icon-button" onClick={() => refreshHistory()} aria-label="Refresh newsroom packages" title="Refresh newsroom packages">
          <RefreshCw size={18} />
        </button>
      </section>

      <section className="split-layout">
        <div className="form-panel wide-panel">
          <div className="section-heading">
            <h2>Brief</h2>
            <p className="muted">Start broad, then let the slate narrow the strongest playable angles.</p>
          </div>
          <WorkspaceContext workspaceId={workspaceId} />
          <div className="field">
            <label htmlFor="brief">Newsroom brief / trend</label>
            <textarea id="brief" value={brief} onChange={(event) => setBrief(event.target.value)} />
          </div>

          <div className="newsroom-form-sections">
            <section className="form-section">
              <div className="section-heading compact-heading">
                <h3>Context and trend</h3>
              </div>
              <div className="field-grid newsroom-context-grid">
                <div className="field field-wide">
                  <label htmlFor="audience">Audience</label>
                  <input id="audience" value={audience} onChange={(event) => setAudience(event.target.value)} />
                </div>
                <div className="field field-medium">
                  <label htmlFor="platform">Platform</label>
                  <select id="platform" value={platform} onChange={(event) => setPlatform(event.target.value)}>
                    <option value="TikTok, Reels, Shorts">TikTok / Reels / Shorts</option>
                    <option value="TikTok">TikTok</option>
                    <option value="Instagram Reels">Instagram Reels</option>
                    <option value="YouTube Shorts">YouTube Shorts</option>
                    <option value="Facebook video">Facebook video</option>
                  </select>
                </div>
                <div className="field field-medium">
                  <label htmlFor="urgency">Urgency</label>
                  <select id="urgency" value={urgency} onChange={(event) => setUrgency(event.target.value)}>
                    <option value="today">Today</option>
                    <option value="breaking / now">Breaking / now</option>
                    <option value="this week">This week</option>
                    <option value="campaign evergreen">Campaign evergreen</option>
                  </select>
                </div>
                <div className="field field-wide">
                  <label htmlFor="tone">Tone</label>
                  <input id="tone" value={tone} onChange={(event) => setTone(event.target.value)} />
                </div>
                <div className="field field-span-2 field-wide">
                  <label htmlFor="brand-fit">Brand / editorial fit</label>
                  <input id="brand-fit" value={brandFit} onChange={(event) => setBrandFit(event.target.value)} />
                </div>
              </div>
            </section>

            <section className="form-section">
              <div className="section-heading compact-heading">
                <h3>Output configuration</h3>
              </div>
              <div className="field-grid newsroom-output-grid">
                <div className="field field-medium">
                  <label htmlFor="slate-mode">Slate</label>
                  <select id="slate-mode" value={slateMode} onChange={(event) => setSlateMode(event.target.value)}>
                    <option value="daily">Daily</option>
                    <option value="campaign">Campaign</option>
                    <option value="breaking desk">Breaking desk</option>
                  </select>
                </div>
                <div className="field field-numeric">
                  <label htmlFor="slate-size">Topic cards</label>
                  <input id="slate-size" type="number" min={2} max={8} value={slateSize} onChange={(event) => setSlateSize(Number(event.target.value))} />
                </div>
                <div className="field field-medium">
                  <label htmlFor="language">Language</label>
                  <select id="language" value={language} onChange={(event) => setLanguage(event.target.value)}>
                    <option value="ms-MY">Malay</option>
                    <option value="en-MY">English</option>
                  </select>
                </div>
                <div className="field field-medium">
                  <label htmlFor="aspect">Aspect ratio</label>
                  <select id="aspect" value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value)}>
                    <option value="9:16">9:16 portrait</option>
                    <option value="16:9">16:9 landscape</option>
                    <option value="1:1">1:1 square</option>
                  </select>
                </div>
                <div className="field field-numeric">
                  <label htmlFor="duration">Duration seconds</label>
                  <input id="duration" type="number" min={10} max={180} value={duration} onChange={(event) => setDuration(Number(event.target.value))} />
                </div>
              </div>
            </section>
          </div>

          <div className="actions">
            <button className="button" onClick={startWorkflow} disabled={busy || !brief.trim()}>
              <Sparkles size={16} /> Generate slate
            </button>
            {activePackage ? (
              <Link className="button secondary" href={`/jobs/${activePackage.id}`}>
                Open package job
              </Link>
            ) : null}
          </div>
          {message ? <p className="muted code">{message}</p> : null}
        </div>

        <aside className="side-panel">
          <div className="side-heading">
            <SlidersHorizontal size={18} />
            <h2>Desk filters</h2>
          </div>
          <div className="metric-list accordion-list">
            <button type="button"><Target size={16} /> <span>{audience}</span><ChevronRight size={15} /></button>
            <button type="button"><Clock size={16} /> <span>{urgency}</span><ChevronRight size={15} /></button>
            <button type="button"><Newspaper size={16} /> <span>{slateMode}</span><ChevronRight size={15} /></button>
          </div>
          <div className="pipeline-list accordion-list">
            <button type="button"><span>Research signals</span><ChevronDown size={15} /></button>
            <button type="button"><span>Topic cards</span><ChevronRight size={15} /></button>
            <button type="button"><span>Angle approval</span><ChevronRight size={15} /></button>
            <button type="button"><span>Script package</span><ChevronRight size={15} /></button>
            <button type="button"><span>Shorts handoff</span><ChevronRight size={15} /></button>
          </div>
          <div className="mini-jobs">
            {jobs.slice(0, 5).map((job) => (
              <button className="mini-job mini-job-button" key={job.id} onClick={() => packagesByJob[job.id] && activatePackage(packagesByJob[job.id])}>
                <span>{new Date(job.created_at).toLocaleString()}</span>
                <StatusPill status={job.status} />
              </button>
            ))}
            {!jobs.length ? <span className="muted">No newsroom packages yet.</span> : null}
          </div>
        </aside>
      </section>

      <section className="curation-workspace" aria-label="Automated AI curation workspace">
        <aside className="curation-feed">
          <div className="section-heading">
            <div>
              <div className="eyebrow">Live inputs</div>
              <h2>Signal stream</h2>
            </div>
          </div>
          <div className="signal-feed">
            {liveSignals.map((signal) => (
              <article className="signal-card" key={signal.label}>
                <span className="signal-icon"><Radio size={16} /></span>
                <div>
                  <strong>{signal.label}</strong>
                  <span>{signal.value}</span>
                  <p>{signal.detail}</p>
                </div>
              </article>
            ))}
          </div>
        </aside>

        <div className="curation-packages">
          <div className="section-heading">
            <div>
              <div className="eyebrow">Automated AI curation</div>
              <h2>Ready-to-use content packages</h2>
            </div>
            <span className="status succeeded">Auto-ranked</span>
          </div>
          <div className="recommendation-list">
            {automatedRecommendations.map((recommendation) => (
              <article className="recommendation-card" key={recommendation.title}>
                <div className="reasoning-block">{recommendation.reasoning}</div>
                <div className="recommendation-body">
                  <div>
                    <h3>{recommendation.title}</h3>
                    <p className="muted">{recommendation.format}</p>
                  </div>
                  <div className="card-meta">
                    <span>{recommendation.confidence}</span>
                    <span>{recommendation.signal}</span>
                  </div>
                </div>
                <div className="recommendation-actions">
                  <button className="button" type="button" onClick={() => setMessage(`Approved to slate: ${recommendation.title}`)}>
                    <Check size={16} /> Approve to Slate
                  </button>
                  <button className="button secondary" type="button" onClick={() => setMessage(`Dismissed: ${recommendation.title}`)}>
                    <X size={16} /> Dismiss
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>

        <aside className="guardrails-sidebar">
          <button className="guardrails-toggle" type="button" onClick={() => setGuardrailsOpen((open) => !open)} aria-expanded={guardrailsOpen}>
            <span><ShieldCheck size={17} /> Automated guardrails</span>
            {guardrailsOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          {guardrailsOpen ? (
            <div className="guardrails-body">
              <div className="field slider-field">
                <label htmlFor="curation-velocity"><Gauge size={15} /> Curation velocity</label>
                <input
                  id="curation-velocity"
                  type="range"
                  min={0}
                  max={100}
                  value={curationVelocity}
                  onChange={(event) => setCurationVelocity(Number(event.target.value))}
                />
                <span className="range-value">{curationVelocity}% balanced</span>
              </div>
              <div className="field">
                <label htmlFor="topic-exclusions">Topic / keyword exclusions</label>
                <input id="topic-exclusions" value={exclusions} onChange={(event) => setExclusions(event.target.value)} />
              </div>
              <label className="check-row">
                <input type="checkbox" defaultChecked />
                <span>Owned archive only</span>
              </label>
              <label className="check-row">
                <input type="checkbox" defaultChecked />
                <span>Verified newsroom sources</span>
              </label>
              <label className="check-row">
                <input type="checkbox" />
                <span><Globe2 size={15} /> Allow global public signals</span>
              </label>
            </div>
          ) : null}
        </aside>
      </section>

      {activePackage && selectedNarrative ? (
        <section className="newsroom-board">
          <div className="topic-column">
            <div className="section-heading">
              <h2>Ranked topic cards</h2>
              <p className="muted">Generated {new Date(activePackage.generated_at).toLocaleString()}</p>
            </div>
            <div className="topic-grid">
              {activePackage.topic_cards.map((card) => (
                <article className={`topic-card ${card.id === selectedCard?.id ? "selected" : ""}`} key={card.id}>
                  <button type="button" className="topic-select" onClick={() => selectTopic(card)}>
                    <span className="score-badge">{card.rank_score}</span>
                    <span>
                      <strong>{card.title}</strong>
                      <small>{card.summary}</small>
                    </span>
                  </button>
                  <div className="evidence-list">
                    {card.evidence.slice(0, 3).map((item) => (
                      <div key={`${card.id}-${item.source}-${item.signal}`}>
                        <strong>{item.source}</strong>
                        <span>{item.signal}</span>
                      </div>
                    ))}
                  </div>
                  <div className="angle-list">
                    {card.angles.map((angle) => (
                      <button
                        type="button"
                        className={angle.id === selectedAngle?.id ? "selected" : ""}
                        key={angle.id}
                        onClick={() => {
                          setSelectedTopicId(card.id);
                          setSelectedAngleId(angle.id);
                        }}
                      >
                        {angle.title}
                      </button>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="narrative-panel">
            <div className="section-heading">
              <div>
                <h2>{selectedNarrative.title}</h2>
                <p className="muted">{selectedNarrative.prompt}</p>
              </div>
              <button className="button" onClick={() => sendToShortsGenerator(selectedNarrative)} disabled={busy}>
                <Send size={16} /> Send to Shorts Generator
              </button>
            </div>

            <div className="script-box">{selectedNarrative.script}</div>

            <div className="narrative-grid">
              <div>
                <h3>Scene plan</h3>
                <div className="scene-list">
                  {selectedNarrative.scene_plan.map((scene) => (
                    <div key={`${scene.beat}-${scene.duration_seconds}`}>
                      <strong>{scene.beat}</strong>
                      <span>{scene.visual}</span>
                      <p>{scene.narration}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3>Captions and search</h3>
                <div className="chip-list">
                  {selectedNarrative.caption_options.map((caption) => (
                    <span key={caption}>{caption}</span>
                  ))}
                </div>
                <div className="chip-list compact-chips">
                  {selectedNarrative.search_terms.map((term) => (
                    <span key={term}>{term}</span>
                  ))}
                </div>
                <div className="check-list">
                  {selectedNarrative.editorial_checks.map((check) => (
                    <span key={check}>
                      <CheckCircle2 size={15} /> {check}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="empty-state">No newsroom package selected.</section>
      )}
    </>
  );
}

function narrativeFor(newsroomPackage: NewsroomPackage, topicId: string, angleId: string) {
  return (
    newsroomPackage.narrative_packages.find((item) => item.topic_id === topicId && item.angle_id === angleId) ||
    newsroomPackage.narrative_package
  );
}

function shortsWorkspaceFor(newsroomWorkspace: string) {
  if (newsroomWorkspace.includes("newsroom")) return newsroomWorkspace.replace(/newsroom/g, "shorts");
  return `${newsroomWorkspace}-shorts`;
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
