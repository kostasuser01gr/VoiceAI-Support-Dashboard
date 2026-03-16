#!/usr/bin/env bash
# enforce-branch-protection.sh — Enforce branch protection rules on main
# Usage: bash scripts/github-cli/enforce-branch-protection.sh
# Requires: GITHUB_TOKEN with admin:write scope or repo admin permissions

set -euo pipefail

REPO="${GITHUB_REPO:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"
BRANCH="main"

echo "Enforcing branch protection on $REPO/$BRANCH"

# Required status checks — must match exact context names in CI workflows
REQUIRED_CHECKS='["Run Gates G1\u20136 / gates"]'

gh api repos/"$REPO"/branches/"$BRANCH"/protection \
  --method PUT \
  --input - << EOF
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["Run Gates G1\u20136 / gates"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": true
}
EOF

echo "Branch protection enforced on $BRANCH:"
echo "  - Required PR review: 1 approver"
echo "  - Required status checks: gates CI"
echo "  - No force pushes"
echo "  - No deletions"
echo "  - Dismiss stale reviews"
echo "  - Required conversation resolution"

# Verify
echo ""
echo "Current protection rules:"
gh api repos/"$REPO"/branches/"$BRANCH"/protection \
  --jq '{
    required_reviews: .required_pull_request_reviews.required_approving_review_count,
    dismiss_stale: .required_pull_request_reviews.dismiss_stale_reviews,
    required_checks: [.required_status_checks.contexts[]],
    force_push_allowed: .allow_force_pushes.enabled,
    delete_allowed: .allow_deletions.enabled
  }' 2>/dev/null || echo "  (Unable to read — may need admin token)"
