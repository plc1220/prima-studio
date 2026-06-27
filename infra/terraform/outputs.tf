output "artifact_registry_repo" {
  value = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.repo.repository_id}"
}

output "cluster_name" {
  value = google_container_cluster.autopilot.name
}

output "cluster_location" {
  value = google_container_cluster.autopilot.location
}

output "media_bucket" {
  value = google_storage_bucket.media.name
}

output "workload_service_account" {
  value = google_service_account.workload.email
}

output "cloud_sql_connection_name" {
  value = google_sql_database_instance.postgres.connection_name
}

