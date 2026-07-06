# Cloud Run Light Deployment

This path deploys the light demo version first: API and web only, both on Cloud Run.

The API runs with `LIGHT_INLINE_WORKFLOWS=true`, so demo workflows complete in-process instead of requiring separate orchestrator/agent services, Pub/Sub, Cloud SQL, or GKE. The short-generation agent uses Google ADC/Workload Identity through Vertex AI when `GCP_PROJECT_ID` is set.

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
2. Enables Cloud Run, Cloud Build, Artifact Registry, and Vertex AI APIs.
3. Creates an Artifact Registry Docker repo if missing.
4. Builds and deploys `mp-ai-video-clipping-api`.
5. Reads the API URL.
6. Builds and deploys `mp-ai-video-clipping-web` with `NEXT_PUBLIC_API_BASE_URL` set to the API URL and `NEXT_PUBLIC_GCS_BUCKET_NAME` set to the new bucket.

## IAM Needed

The active account needs enough access to:

- enable services,
- create Artifact Registry repos,
- run Cloud Build,
- deploy Cloud Run services,
- use Vertex AI from the Cloud Run runtime identity.

At minimum for a demo project, grant suitable project-level roles such as Cloud Run Admin, Cloud Build Editor, Artifact Registry Admin, Service Usage Admin, and Vertex AI User, plus service-account permission to deploy Cloud Run revisions.
