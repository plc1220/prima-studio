# Architecture Notes

## Service Boundaries

- `apps/web` is the product frontend. It is not a Streamlit wrapper.
- `services/api` owns public HTTP contracts, job creation, signed URLs, and job reads.
- `services/orchestrator` converts workflow jobs into agent tasks.
- `services/agents/newsroom` handles upstream editorial intelligence: topic discovery, ranked cards, angle generation, narrative packages, and Shorts Generator handoff metadata.
- `services/agents/metadata` handles Rev-Med-style Gemini analysis of owned media.
- `services/agents/render` handles FFmpeg-heavy clipping/joining and runs as a StatefulSet.
- `services/agents/shortgen` handles prompt-to-video generation and runs as a StatefulSet.

## Local Runtime

Local development uses SQLite and filesystem-backed `gs://` emulation under `local-data/storage`. The `agent_tasks` table acts as the durable local queue so the workflow can be tested without Pub/Sub.

## GKE Runtime

GKE should run the same service images with managed GCP state:

- Cloud SQL Postgres for jobs, assets, events, and durable workflow state.
- GCS for uploaded video, segments, metadata, clips, generated shorts, and final outputs.
- Pub/Sub for task and event topics once the local queue adapter is replaced.
- Secret Manager plus Workload Identity for API keys and app secrets.
- StatefulSet PVCs for render and shortgen scratch/cache directories.

## Source Project Mapping

- Rev-Med video split, metadata generation, clip generation, and join concepts map to the `video-clipping` workflow.
- Editorial discovery, convergence, scripting, captions, search terms, and daily/campaign slates map to the `newsroom` workflow.
- Prompt/script/terms/TTS/subtitle/render concepts map to the `shorts` workflow.
- Face refinement is intentionally deferred to a v2 agent.
