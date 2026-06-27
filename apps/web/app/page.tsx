import Link from "next/link";
import { ArrowRight, CheckCircle2, Film, Newspaper, ShieldCheck, WandSparkles } from "lucide-react";

export default function DashboardPage() {
  return (
    <>
      <section className="topbar">
        <div>
          <div className="eyebrow">Prima Studio</div>
          <h1>GenAI production lanes for newsroom intelligence, owned footage, and social shorts</h1>
          <p className="muted">
            A reviewable workspace for sensing audience temperature, packaging editorial ideas, repurposing long-form video, and rendering
            social-ready outputs with provenance intact.
          </p>
        </div>
      </section>

      <section className="studio-strip">
        <Principle icon={<CheckCircle2 size={18} />} label="Human approval before publication" />
        <Principle icon={<ShieldCheck size={18} />} label="Source-to-output provenance" />
        <Principle icon={<Film size={18} />} label="Visible assets at every stage" />
      </section>

      <section className="grid lane-cards">
        <WorkflowCard
          kicker="Lane 1"
          title="Newsroom"
          description="Sense rising topics, rank a slate, review evidence, choose angles, and package scripts, captions, hashtags, and scene plans."
          outputs={["Topic slate", "Narrative package", "Shorts handoff"]}
          href="/newsroom"
          icon={<Newspaper size={22} />}
        />
        <WorkflowCard
          kicker="Lane 2"
          title="Video Clipping"
          description="Turn owned long-form footage into segments, metadata, manual clips, AI-assisted plans, and final joined videos."
          outputs={["Source videos", "Metadata JSON", "Final videos"]}
          href="/video-clipping"
          icon={<Film size={22} />}
        />
        <WorkflowCard
          kicker="Lane 3"
          title="Shorts Generator"
          description="Create a rendered Malay or English short from a direct prompt or an approved newsroom package with script, media plan, voice, subtitles, and BGM."
          outputs={["Script", "Media plan", "Rendered short"]}
          href="/shorts"
          icon={<WandSparkles size={22} />}
        />
      </section>
    </>
  );
}

function WorkflowCard({
  kicker,
  title,
  description,
  outputs,
  href,
  icon
}: {
  kicker: string;
  title: string;
  description: string;
  outputs: string[];
  href: string;
  icon: React.ReactNode;
}) {
  return (
    <article className="card lane-card">
      <span className="card-kicker">{kicker}</span>
      <div className="card-heading">
        <span className="icon-box">{icon}</span>
        <h2>{title}</h2>
      </div>
      <p className="muted">{description}</p>
      <div className="card-meta">
        {outputs.map((output) => (
          <span key={output}>{output}</span>
        ))}
      </div>
      <div className="actions">
        <Link className="button" href={href}>
          Open lane <ArrowRight size={16} />
        </Link>
      </div>
    </article>
  );
}

function Principle({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="principle">
      {icon}
      <strong>{label}</strong>
    </div>
  );
}
