import Link from "next/link";
import { Download, RefreshCw } from "lucide-react";
import { StatusPill } from "@/components/StatusPill";
import { apiFetch, type DownloadUrlResponse, type JobDetail } from "@/lib/api";

export default async function JobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = await apiFetch<JobDetail>(`/jobs/${jobId}`);
  const videoAssets = job.outputs.filter((asset) => asset.kind === "generated_short" || asset.kind === "final_video");
  const laneName = laneLabel(job.kind);
  const nextAction = recommendedAction(job.kind, job.status);
  const videoUrls = Object.fromEntries(
    await Promise.all(
      videoAssets.map(async (asset) => {
        const response = await apiFetch<DownloadUrlResponse>(`/assets/${asset.id}/download-url`);
        return [asset.id, response.download_url] as const;
      })
    )
  );

  return (
    <>
      <section className="topbar">
        <div>
          <div className="eyebrow">Job Detail</div>
          <h1>{laneName} workflow</h1>
          <p className="muted code">{job.id}</p>
        </div>
        <StatusPill status={job.status} />
      </section>

      <section className="table-panel">
        <div className="rows">
          <InfoRow label="Workspace" value={job.workspace_id} />
          <InfoRow label="Language" value={job.language} />
          <InfoRow label="Aspect ratio" value={job.aspect_ratio} />
          <InfoRow label="Output prefix" value={job.output_prefix} />
          <InfoRow label="Input assets" value={job.input_asset_ids.length ? job.input_asset_ids.join(", ") : "No input assets recorded"} />
          {job.error ? <InfoRow label="Error" value={job.error} /> : null}
        </div>
      </section>

      <section className="grid">
        <article className="card">
          <h2>Recommended next action</h2>
          <p className="muted">{nextAction}</p>
          <div className="actions">
            {job.kind === "video_clipping" ? (
              <Link className="button secondary" href={`/video-clipping?workspace=${encodeURIComponent(job.workspace_id)}`}>
                Back to clipping lane
              </Link>
            ) : null}
            {job.kind === "shorts" ? (
              <Link className="button secondary" href={`/shorts?workspace=${encodeURIComponent(job.workspace_id)}`}>
                Back to Shorts Generator
              </Link>
            ) : null}
            {job.kind === "newsroom" ? (
              <Link className="button secondary" href={`/newsroom?workspace=${encodeURIComponent(job.workspace_id)}`}>
                Back to Newsroom
              </Link>
            ) : null}
          </div>
        </article>

        <article className="card">
          <h2>Events</h2>
          {job.events.length ? (
            <div className="rows">
              {job.events.map((event) => (
                <div className="row" key={event.id}>
                  <strong>{event.step}</strong>
                  <span>
                    {event.message}
                    {event.payload?.metadata?.render_backend ? (
                      <small className="event-note">Backend: {String(event.payload.metadata.render_backend)}</small>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No events recorded yet.</p>
          )}
        </article>

        <article className="card">
          <h2>Outputs</h2>
          {job.outputs.length ? (
            <div className="rows">
              {job.outputs.map((asset) => (
                <div className="row" key={asset.id}>
                  <strong>{asset.kind}</strong>
                  <span>
                    <span className="code">{asset.gcs_uri}</span>
                    {videoUrls[asset.id] ? (
                      <Link className="button secondary inline-action" href={videoUrls[asset.id]} target="_blank">
                        <Download size={16} /> Download
                      </Link>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">Outputs will appear as agents complete their work.</p>
          )}
        </article>
      </section>

      {videoAssets.length ? (
        <section className="list-panel">
          <div className="section-heading">
            <h2>Rendered video</h2>
            <p className="muted">Playable MP4 output from this job.</p>
          </div>
          <div className="video-grid">
            {videoAssets.map((asset) => (
              <article className="video-card" key={asset.id}>
                <video className="video-preview" src={videoUrls[asset.id]} controls preload="metadata" />
                <div>
                  <h3>{asset.filename}</h3>
                  <p className="code">{asset.gcs_uri}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <div className="actions">
        <Link className="button secondary" href={`/jobs/${job.id}`}>
          <RefreshCw size={16} /> Refresh
        </Link>
      </div>
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="row">
      <strong>{label}</strong>
      <span className="code">{value}</span>
    </div>
  );
}

function laneLabel(kind: string) {
  if (kind === "video_clipping") return "Video Clipping";
  if (kind === "shorts") return "Shorts Generator";
  if (kind === "newsroom") return "Newsroom";
  return kind;
}

function recommendedAction(kind: string, status: string) {
  if (status === "failed") return "Review the error and rerun the lane after fixing the source asset or configuration.";
  if (status === "queued" || status === "running") return "Refresh this job until events and output assets show the current production stage.";
  if (kind === "video_clipping") return "Review metadata, provenance, and final video output before using the cut in a publishing workflow.";
  if (kind === "shorts") return "Preview the rendered short, check script and media fit, then download or iterate in the Shorts Generator lane.";
  if (kind === "newsroom") return "Review the topic slate and selected narrative package before handing it to Shorts Generator.";
  return "Review events and outputs before taking the next production step.";
}
