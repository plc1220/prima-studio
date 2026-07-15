# Cloud Run Light Deployment

This path deploys the light demo version first: API and web on Cloud Run, with the workflow functions running inline inside the API service.

The API runs with `LIGHT_INLINE_WORKFLOWS=true`, so Video Clipping, Newsroom, Shorts, Gemini metadata, and render handling complete in-process instead of requiring separate orchestrator/agent services, Pub/Sub, Cloud SQL, or GKE. This is a deploy-light shortcut; production should split those workers back out.

Real video clipping requires a cloud bucket in both local and Cloud Run deployments. Gemini/Vertex analyzes the source video through a GCS URI, so uploaded source videos must land in `gs://<GCS_BUCKET_NAME>/...`. If the app writes `gs://local-bucket/...`, Gemini cannot read the source and the workflow will fail or show an older fallback output.

## Deploy

```bash
PROJECT_ID=mp-ai-video REGION=asia-southeast1 GCS_BUCKET_NAME=mp-ai-video-clipping-bucket-v2 scripts/deploy-cloudrun-light.sh
```

Latest light deployment:

- API: https://mp-ai-video-clipping-api-vgtxmgtl6a-as.a.run.app
- Web: https://mp-ai-video-clipping-web-vgtxmgtl6a-as.a.run.app
- Bucket: `mp-ai-video-clipping-bucket-v2`

The script:

1. Switches `gcloud` to the project.
2. Enables Cloud Run, Cloud Build, Artifact Registry, Vertex AI, Transcoder, and IAM Credentials APIs.
3. Creates an Artifact Registry Docker repo if missing.
4. Creates the GCS bucket if missing.
5. Grants the Cloud Run runtime service account bucket object access and Transcoder admin access.
6. Grants the Google Transcoder service account bucket object access.
7. Builds and deploys `mp-ai-video-clipping-api` with:
   - `GCP_PROJECT_ID`
   - `GOOGLE_CLOUD_PROJECT`
   - `GCP_REGION`
   - `GCS_BUCKET_NAME`
   - `VIDEO_CLIPPING_BUCKET_NAME`
   - `LIGHT_INLINE_WORKFLOWS=true`
   - `TRANSCODER_ENABLED=true`
8. Reads the API URL.
9. Builds and deploys `mp-ai-video-clipping-web` with `NEXT_PUBLIC_API_BASE_URL` set to the API URL and `NEXT_PUBLIC_GCS_BUCKET_NAME` set to the bucket.

## Local Development Parity

Local development should use the same bucket values as Cloud Run when testing real video clipping:

```bash
cp .env.example .env
gcloud auth application-default login
gcloud config set project mp-ai-video
```

Required `.env` values:

```bash
GCP_PROJECT_ID=mp-ai-video
GOOGLE_CLOUD_PROJECT=mp-ai-video
GCP_REGION=asia-southeast1
GCS_BUCKET_NAME=mp-ai-video-clipping-local-test
VIDEO_CLIPPING_BUCKET_NAME=mp-ai-video-clipping-local-test
NEXT_PUBLIC_GCS_BUCKET_NAME=mp-ai-video-clipping-local-test
GEMINI_MODEL_NAME=gemini-2.5-flash
```

For Docker Compose, `docker-compose.yml` passes those bucket values into the API, orchestrator, metadata, render, newsroom, and shortgen containers.

For manual local development, run all workflow processes:

```bash
uvicorn services.api.app.main:app --reload --port 8080
python -m services.orchestrator.app.main
python -m services.agents.metadata.app.main
python -m services.agents.render.app.main
python -m services.agents.newsroom.app.main
python -m services.agents.shortgen.app.main
```

If only the API and frontend are running, jobs will stay queued. If the bucket env vars are blank, uploads will use local `gs://` emulation and Gemini video clipping will not be a real end-to-end test.

## IAM Needed

The active account needs enough access to:

- enable services,
- create Artifact Registry repos,
- run Cloud Build,
- deploy Cloud Run services,
- use Vertex AI from the Cloud Run runtime identity,
- read and write the configured GCS bucket,
- create and poll Transcoder jobs when `TRANSCODER_ENABLED=true`.

At minimum for a demo project, grant suitable project-level roles such as Cloud Run Admin, Cloud Build Editor, Artifact Registry Admin, Service Usage Admin, Vertex AI User, Transcoder Admin, and Storage Object Admin on the configured bucket, plus service-account permission to deploy Cloud Run revisions.
