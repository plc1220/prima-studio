locals {
  services = [
    "artifactregistry.googleapis.com",
    "container.googleapis.com",
    "compute.googleapis.com",
    "iam.googleapis.com",
    "secretmanager.googleapis.com",
    "sqladmin.googleapis.com",
    "storage.googleapis.com",
    "pubsub.googleapis.com",
    "aiplatform.googleapis.com"
  ]
}

resource "google_project_service" "services" {
  for_each = toset(local.services)
  service  = each.value
}

resource "google_artifact_registry_repository" "repo" {
  location      = var.region
  repository_id = var.artifact_registry_repo
  description   = "Container images for Media Prima AI Video Studio"
  format        = "DOCKER"

  depends_on = [google_project_service.services]
}

resource "google_storage_bucket" "media" {
  name                        = var.bucket_name
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = false

  lifecycle_rule {
    condition {
      age = 30
    }
    action {
      type = "AbortIncompleteMultipartUpload"
    }
  }
}

resource "google_service_account" "workload" {
  account_id   = "mp-video-studio"
  display_name = "Media Prima AI Video Studio workload identity"
}

resource "google_project_iam_member" "vertex_user" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.workload.email}"
}

resource "google_project_iam_member" "secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.workload.email}"
}

resource "google_storage_bucket_iam_member" "media_object_admin" {
  bucket = google_storage_bucket.media.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.workload.email}"
}

resource "google_pubsub_topic" "workflow_tasks" {
  name = "mp-workflow-tasks"
}

resource "google_pubsub_topic" "job_events" {
  name = "mp-job-events"
}

resource "google_pubsub_subscription" "orchestrator" {
  name  = "mp-orchestrator"
  topic = google_pubsub_topic.workflow_tasks.name
}

resource "google_sql_database_instance" "postgres" {
  name             = "mp-video-studio"
  database_version = "POSTGRES_15"
  region           = var.region

  settings {
    tier              = "db-custom-2-7680"
    availability_type = "ZONAL"
    disk_size         = 50
    disk_type         = "PD_SSD"
    backup_configuration {
      enabled = true
    }
  }

  deletion_protection = true
}

resource "google_sql_database" "app" {
  name     = "mpstudio"
  instance = google_sql_database_instance.postgres.name
}

resource "google_sql_user" "app" {
  name     = "mpstudio"
  instance = google_sql_database_instance.postgres.name
  password = var.database_password
}

resource "google_container_cluster" "autopilot" {
  name     = var.cluster_name
  location = var.region

  enable_autopilot = true

  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
  }

  release_channel {
    channel = "REGULAR"
  }

  depends_on = [google_project_service.services]
}

resource "google_service_account_iam_member" "workload_identity" {
  service_account_id = google_service_account.workload.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[mpstudio/mpstudio]"
}

resource "google_secret_manager_secret" "app_runtime" {
  secret_id = "mpstudio-runtime"
  replication {
    auto {}
  }
}

