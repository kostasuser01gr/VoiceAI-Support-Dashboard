#!/usr/bin/env bash
# BLACK_VAULT NEXUS LIVE — Cloud Run Deployment Script
# Usage: ./deploy/cloudrun-deploy.sh [--project PROJECT_ID] [--region REGION]

set -euo pipefail

# Defaults
PROJECT_ID="${GCP_PROJECT_ID:-}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="black-vault-nexus-live"
GEMINI_KEY="${GEMINI_API_KEY:-}"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --project) PROJECT_ID="$2"; shift 2 ;;
    --region) REGION="$2"; shift 2 ;;
    --key) GEMINI_KEY="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Validate
if [[ -z "$PROJECT_ID" ]]; then
  echo "Error: GCP_PROJECT_ID not set. Use --project or export GCP_PROJECT_ID"
  exit 1
fi

if [[ -z "$GEMINI_KEY" ]]; then
  echo "Error: GEMINI_API_KEY not set. Use --key or export GEMINI_API_KEY"
  exit 1
fi

echo "============================================"
echo "  BLACK_VAULT NEXUS LIVE — Cloud Run Deploy"
echo "============================================"
echo "Project:  $PROJECT_ID"
echo "Region:   $REGION"
echo "Service:  $SERVICE_NAME"
echo ""

# 1. Enable required APIs
echo "[1/5] Enabling GCP APIs..."
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  aiplatform.googleapis.com \
  firestore.googleapis.com \
  --project="$PROJECT_ID" \
  --quiet

# 2. Build container image
echo "[2/5] Building container image..."
IMAGE="gcr.io/$PROJECT_ID/$SERVICE_NAME:latest"
gcloud builds submit \
  --tag="$IMAGE" \
  --project="$PROJECT_ID" \
  --quiet

# 3. Deploy to Cloud Run
echo "[3/5] Deploying to Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
  --image="$IMAGE" \
  --platform=managed \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --allow-unauthenticated \
  --memory=1Gi \
  --cpu=2 \
  --timeout=300 \
  --concurrency=80 \
  --min-instances=0 \
  --max-instances=10 \
  --set-env-vars="GEMINI_API_KEY=$GEMINI_KEY,APP_ENV=production,GCP_PROJECT_ID=$PROJECT_ID,GCP_REGION=$REGION,LOG_LEVEL=INFO" \
  --quiet

# 4. Get service URL
echo "[4/5] Fetching service URL..."
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --format='value(status.url)')

echo ""
echo "============================================"
echo "  DEPLOYMENT SUCCESSFUL"
echo "============================================"
echo "Service URL:  $SERVICE_URL"
echo "Health Check: $SERVICE_URL/health"
echo "API Docs:     $SERVICE_URL/docs"
echo "Frontend:     $SERVICE_URL/"
echo ""

# 5. Verify health
echo "[5/5] Verifying health endpoint..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$SERVICE_URL/health" || echo "000")

if [[ "$HTTP_CODE" == "200" ]]; then
  echo "Health check: PASSED (HTTP $HTTP_CODE)"
  echo ""
  echo "Your agent is live at: $SERVICE_URL"
else
  echo "Health check: PENDING (HTTP $HTTP_CODE)"
  echo "The service may still be starting up. Try: curl $SERVICE_URL/health"
fi

echo ""
echo "Done!"
