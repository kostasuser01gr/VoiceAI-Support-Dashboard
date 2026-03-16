# Input variables — set via terraform.tfvars or CLI

variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP Region for all resources"
  type        = string
  default     = "us-central1"
}

variable "gemini_api_key" {
  description = "Gemini API Key (sensitive)"
  type        = string
  sensitive   = true
}
