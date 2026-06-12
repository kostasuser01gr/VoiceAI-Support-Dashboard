#!/bin/bash

# ... existing deploy script ...

# Set environment variables for Firebase
firebase functions config set SHARE_TOKEN_SECRET=$SHARE_TOKEN_SECRET
firebase functions config set SESSION_SIGNING_SECRET=$SESSION_SIGNING_SECRET