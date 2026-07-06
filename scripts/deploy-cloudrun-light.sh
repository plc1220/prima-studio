#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-mp-ai-video}"
REGION="${REGION:-asia-southeast1}"
REPO_NAME="${REPO_NAME:-mp-ai-video}"
API_SERVICE="${API_SERVICE:-mp-ai-video-clipping-api}"
WEB_SERVICE="${WEB_SERVICE:-mp-ai-video-clipping-web}"
GCS_BUCKET_NAME="${GCS_BUCKET_NAME:-mp-ai-video-clipping-bucket-v2}"

if [[ -z "$(gcloud auth list --format='value(account)' 2>/dev/null | head -n 1)" ]]; then
  ADC_TOKEN_FILE="$(mktemp)"
  gcloud auth application-default print-access-token >"${ADC_TOKEN_FILE}"
  export CLOUDSDK_AUTH_ACCESS_TOKEN_FILE="${ADC_TOKEN_FILE}"
  trap 'rm -f "${ADC_TOKEN_FILE}"' EXIT
fi

gcloud config set project "${PROJECT_ID}"

gcloud services enable \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  aiplatform.googleapis.com \
  transcoder.googleapis.com \
  iamcredentials.googleapis.com

PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
RUN_SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
TRANSCODER_SERVICE_ACCOUNT="service-${PROJECT_NUMBER}@gcp-sa-transcoder.iam.gserviceaccount.com"

gcloud beta services identity create \
  --service=transcoder.googleapis.com \
  --project="${PROJECT_ID}" >/dev/null 2>&1 || true

if ! gcloud storage buckets describe "gs://${GCS_BUCKET_NAME}" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://${GCS_BUCKET_NAME}" \
    --project="${PROJECT_ID}" \
    --location="${REGION}" \
    --uniform-bucket-level-access
fi

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${RUN_SERVICE_ACCOUNT}" \
  --role="roles/transcoder.admin" \
  --condition=None >/dev/null

gcloud storage buckets add-iam-policy-binding "gs://${GCS_BUCKET_NAME}" \
  --member="serviceAccount:${RUN_SERVICE_ACCOUNT}" \
  --role="roles/storage.objectAdmin" >/dev/null || true

gcloud storage buckets add-iam-policy-binding "gs://${GCS_BUCKET_NAME}" \
  --member="serviceAccount:${TRANSCODER_SERVICE_ACCOUNT}" \
  --role="roles/storage.objectAdmin" >/dev/null || true

if ! gcloud artifacts repositories describe "${REPO_NAME}" --location="${REGION}" >/dev/null 2>&1; then
  gcloud artifacts repositories create "${REPO_NAME}" \
    --repository-format=docker \
    --location="${REGION}" \
    --description="Media Prima video AI Cloud Run images"
fi

gcloud builds submit . \
  --config services/api/cloudbuild.yaml \
  --substitutions "_REGION=${REGION},_SERVICE_NAME=${API_SERVICE},_REPO_NAME=${REPO_NAME},_IMAGE_TAG=latest,_GCS_BUCKET_NAME=${GCS_BUCKET_NAME}"

API_URL="$(gcloud run services describe "${API_SERVICE}" --region="${REGION}" --format='value(status.url)')"

gcloud builds submit . \
  --config apps/web/cloudbuild.yaml \
  --substitutions "_REGION=${REGION},_SERVICE_NAME=${WEB_SERVICE},_REPO_NAME=${REPO_NAME},_API_BASE_URL=${API_URL},_IMAGE_TAG=latest,_GCS_BUCKET_NAME=${GCS_BUCKET_NAME}"

WEB_URL="$(gcloud run services describe "${WEB_SERVICE}" --region="${REGION}" --format='value(status.url)')"

printf 'API: %s\nWEB: %s\n' "${API_URL}" "${WEB_URL}"
