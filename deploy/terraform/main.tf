# BLACK_VAULT NEXUS LIVE — Terraform Infrastructure
# Deploys the full stack to Google Cloud

terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# ── Variables ──────────────────────────────────────────────

variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP Region"
  type        = string
  default     = "us-central1"
}

variable "gemini_api_key" {
  description = "Gemini API Key"
  type        = string
  sensitive   = true
}

variable "service_name" {
  description = "Cloud Run service name"
  type        = string
  default     = "black-vault-nexus-live"
}

# ── APIs ───────────────────────────────────────────────────

resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "cloudbuild.googleapis.com",
    "artifactregistry.googleapis.com",
    "aiplatform.googleapis.com",
    "firestore.googleapis.com",
  ])

  service            = each.value
  disable_on_destroy = false
}

# ── Artifact Registry ─────────────────────────────────────

resource "google_artifact_registry_repository" "nexus" {
  location      = var.region
  repository_id = "nexus-live"
  format        = "DOCKER"
  description   = "BLACK_VAULT NEXUS LIVE container images"

  depends_on = [google_project_service.apis]
}

# ── Cloud Run Service ─────────────────────────────────────

resource "google_cloud_run_v2_service" "nexus" {
  name     = var.service_name
  location = var.region

  template {
    scaling {
      min_instance_count = 0
      max_instance_count = 10
    }

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/nexus-live/${var.service_name}:latest"

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "2"
          memory = "1Gi"
        }
      }

      env {
        name  = "APP_ENV"
        value = "production"
      }
      env {
        name  = "GEMINI_API_KEY"
        value = var.gemini_api_key
      }
      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "GCP_REGION"
        value = var.region
      }
      env {
        name  = "LOG_LEVEL"
        value = "INFO"
      }

      startup_probe {
        http_get {
          path = "/health"
        }
        initial_delay_seconds = 5
        period_seconds        = 10
        failure_threshold     = 3
      }

      liveness_probe {
        http_get {
          path = "/health"
        }
        period_seconds = 30
      }
    }

    timeout = "300s"
  }

  depends_on = [
    google_project_service.apis,
    google_artifact_registry_repository.nexus,
  ]
}

# ── IAM: Allow unauthenticated access ────────────────────

resource "google_cloud_run_v2_service_iam_member" "public" {
  name     = google_cloud_run_v2_service.nexus.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ── Firestore Database ────────────────────────────────────

resource "google_firestore_database" "nexus_db" {
  name        = "(default)"
  location_id = var.region
  type        = "FIRESTORE_NATIVE"

  depends_on = [google_project_service.apis]
}

# ── Outputs ───────────────────────────────────────────────

output "service_url" {
  description = "Cloud Run service URL"
  value       = google_cloud_run_v2_service.nexus.uri
}

output "health_check_url" {
  description = "Health check endpoint"
  value       = "${google_cloud_run_v2_service.nexus.uri}/health"
}

output "frontend_url" {
  description = "Frontend application URL"
  value       = google_cloud_run_v2_service.nexus.uri
}
