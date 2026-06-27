variable "project_id" {
  type        = string
  description = "GCP project ID."
}

variable "region" {
  type        = string
  description = "Primary GCP region."
  default     = "asia-southeast1"
}

variable "cluster_name" {
  type        = string
  description = "GKE Autopilot cluster name."
  default     = "media-prima-video-studio"
}

variable "artifact_registry_repo" {
  type        = string
  description = "Artifact Registry Docker repository name."
  default     = "media-prima-video-studio"
}

variable "bucket_name" {
  type        = string
  description = "GCS bucket for media assets."
}

variable "database_password" {
  type        = string
  description = "Cloud SQL application database password."
  sensitive   = true
}

