# Prima Studio

Product scaffold for a local-first AI video workflow demo that can still grow into GKE later. It replaces the old Streamlit demo shape with a proper frontend, API gateway, orchestrator, agent services, managed state, and render/cache-heavy workers.

## What It Includes

- `apps/web`: Next.js + TypeScript frontend with isolated Newsroom Generator, Video Clipping, and Shorts Generator lanes.
- `services/api`: FastAPI gateway exposing the planned public API.
- `services/orchestrator`: stateless workflow coordinator that advances jobs into agent tasks.
- `services/agents/newsroom`: editorial intelligence agent that turns broad briefs into ranked topic cards, angles, scripts, captions, scene plans, and shorts handoff packages.
- `services/agents/metadata`: Gemini/GCS metadata analysis agent with deterministic local fallback.
- `services/agents/render`: FFmpeg render agent designed as a GKE StatefulSet with PVC scratch.
- `services/agents/shortgen`: short generation agent designed as a GKE StatefulSet with persistent cache.
- `packages/python/mpstudio`: shared contracts, SQLAlchemy models, local queue/event adapters, and storage helpers.
- `infra/terraform`: GCP/GKE Autopilot infrastructure scaffold.
- `deploy/helm/mpstudio`: Helm chart for Deployments, StatefulSets, services, ingress, and secret mounts.

## Local Demo Deployment

For the Media Prima demo, local deployment is the fastest path. Docker Compose builds once, reuses local image layers on later runs, stores job state in SQLite, and writes artifacts under `./local-data`.

```bash
docker compose up --build
```

Open:

- Web app: http://localhost:3000
- API docs: http://localhost:8080/docs
- Newsroom Generator lane: http://localhost:3000/newsroom
- Video Clipping lane: http://localhost:3000/video-clipping
- Shorts lane: http://localhost:3000/shorts

Default local workspaces are intentionally isolated:

- `media-prima-video-clipping` for uploaded owned footage, clip metadata, clips, and final video-clipping outputs.
- `media-prima-shorts` for prompt-to-short jobs and generated shorts.
- `media-prima-newsroom` for research slates, approved angles, scripts, captions, scene plans, and Shorts Generator handoff packages.

Generated assets are visible in the UI:

- Newsroom packages: open the Newsroom Generator page and select a package, topic card, and angle.
- Video Clipping outputs: open a job from the Video Clipping page or `/jobs/{job_id}`.
- Generated shorts: open the Shorts page and check the `Generated shorts` section.
- Local files: `./local-data/storage/<workspace>/outputs/...`

Prima Studio shorts are not limited to generated-video models. The flow plans a script, asks Gemini for stock-video search terms, searches the configured stock provider, downloads selected clips, builds a timeline, and renders the MP4. Set `PEXELS_API_KEYS` or `PIXABAY_API_KEYS` plus `STOCK_VIDEO_SOURCE=pexels` or `pixabay` to enable real stock search; without keys, the local demo falls back to a generated placeholder MP4 so the render/review flow still works. The Shorts Generator also exposes MoneyPrinter-style controls for script overrides, keywords, source selection, dubbing, subtitle burn-in, and Veo generation. Dubbing uses Google Cloud Text-to-Speech through ADC or Workload Identity. Use `video_source=veo3` or `veo3_fast` with `GCP_PROJECT_ID`, `GCP_REGION`, and the `VEO_MODEL_NAME` / `VEO_FAST_MODEL_NAME` settings to attempt Vertex AI Veo output before render assembly. The defaults use Google's current Veo 3.1 model IDs because Veo 3.0 endpoints are scheduled for migration.

Newsroom Generator sits upstream of the Shorts Generator. It accepts a broad brief, ranks topic cards with evidence signals, generates possible angles and complete narrative packages, then hands the selected prompt, approved script, and search terms into the Shorts workflow. Set `NEWSROOM_LIVE_SIGNALS=true` to enable the bounded research adapter. It uses GDELT and optionally Exa/RSS for reported signals, plus Agent Reach's upstream `twitter`/`opencli` commands for X and Xiaohongshu social signals when those tools are installed and authenticated. Configure the source set with `NEWSROOM_RESEARCH_CHANNELS`; Bilibili, GitHub, and Reddit are intentionally not part of the newsroom integration. When live sources are disabled or unavailable, it produces a deterministic local research slate with explicit search/social/editorial validation cues.

Agent Reach is intentionally not installed or invoked as a library: it routes to upstream tools, so the adapter detects those tools at runtime and isolates failures. For local social listening, install/configure Agent Reach on the same runtime that executes the newsroom worker, then verify it with `agent-reach doctor --json`. X uses `twitter search` first and `opencli twitter search` as a fallback; Xiaohongshu uses `opencli xiaohongshu search`. Treat both as social signals that require corroboration before publication, not as authoritative facts.

For local secrets, copy `.env.example` to `.env` and put provider keys there. `.env` is git-ignored. For GCP, put the same values in Secret Manager and inject them into Cloud Run/GKE as secrets rather than plain image config.

Workers poll the local queue every 8 seconds by default through `TASK_POLL_INTERVAL_SECONDS` in `docker-compose.yml`. Increase that value if you want quieter logs and less background activity, or lower it if you want snappier local job pickup.

## Local Development

The local stack uses SQLite and local filesystem storage by default, so it can run without GCP credentials.

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e "packages/python[dev]"
pip install -r services/api/requirements.txt
pytest
```

Run API and workers in separate terminals:

```bash
uvicorn services.api.app.main:app --reload --port 8080
python -m services.orchestrator.app.main
python -m services.agents.newsroom.app.main
python -m services.agents.metadata.app.main
python -m services.agents.render.app.main
python -m services.agents.shortgen.app.main
```

Run the frontend:

```bash
cd apps/web
npm install
npm run dev
```

## API Surface

- `POST /workflows/video-clipping`
- `POST /workflows/newsroom`
- `POST /workflows/shorts`
- `GET /jobs/{job_id}`
- `GET /jobs/{job_id}/newsroom-package`
- `GET /jobs/{job_id}/events`
- `POST /assets/upload-url`
- `GET /assets/{asset_id}/download-url`

## GKE Direction

The production-oriented shape uses GKE Autopilot, Cloud SQL Postgres, GCS, Pub/Sub, Secret Manager, Artifact Registry, and Workload Identity. Render and short-generation agents are StatefulSets with `volumeClaimTemplates`; web/API/orchestrator/newsroom/metadata are Deployments.
