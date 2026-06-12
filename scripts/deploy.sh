#!/bin/bash

# ... existing deploy script ...

# Set environment variables for Cloud Run
gcloud run services update voice-to-action-agent \
  --set-env-vars SHARE_TOKEN_SECRET=$SHARE_TOKEN_SECRET,SESSION_SIGNING_SECRET=$SESSION_SIGNING_SECRET \
  --platform managed --region us-central1