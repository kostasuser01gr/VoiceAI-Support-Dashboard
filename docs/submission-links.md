# Submission Links

## Required

- Public deployment URL (Firebase Hosting):
  - https://chatgpt-ops.web.app
- Public deployment URL (Cloud Run):
  - https://voice-to-action-agent-zbluqfbniq-ew.a.run.app
- Health URL:
  - https://chatgpt-ops.web.app/health.json
- Proof endpoints:
  - https://voice-to-action-agent-zbluqfbniq-ew.a.run.app/api/health
  - https://voice-to-action-agent-zbluqfbniq-ew.a.run.app/api/guardian
  - https://voice-to-action-agent-zbluqfbniq-ew.a.run.app/api/metrics
  - https://chatgpt-ops.web.app/api/guardian
  - https://chatgpt-ops.web.app/api/metrics
- Architecture diagram in repo:
  - `docs/architecture.png`
- Automation workflow:
  - `.github/workflows/deploy-gcp.yml`

## Contest Platform Upload Fields

- Architecture diagram upload location:
  - Image Gallery: `TODO - upload docs/architecture.png and paste public platform URL`
  - File Upload: `TODO - upload docs/architecture.png and paste public platform URL`

## Bonus Fields

- Published content URL (blog/video/podcast):
  - `TODO - add public URL`
- Public GDG profile URL:
  - `TODO - add GDG profile URL`

## Deploy Automation Code Pointers

- Terraform:
  - `infra/main.tf`
- Cloud Build:
  - `cloudbuild.yaml`
- GitHub Actions:
  - `.github/workflows/deploy-gcp.yml`
- One-command script:
  - `scripts/deploy.sh`
