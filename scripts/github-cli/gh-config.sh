#!/usr/bin/env bash
# gh-config.sh — Bootstrap GitHub ecosystem for BLACK_VAULT V13
# Creates: labels, milestones, branch protection, project board
# Usage: bash scripts/github-cli/gh-config.sh
# Requires: gh CLI authenticated, GITHUB_REPO env var (owner/repo) or auto-detected

set -euo pipefail

REPO="${GITHUB_REPO:-$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || echo "")}"
if [[ -z "$REPO" ]]; then
  echo "ERROR: Could not detect repo. Set GITHUB_REPO=owner/repo"
  exit 1
fi
echo "Configuring GitHub for: $REPO"

# ── Labels ──────────────────────────────────────────────────────────────────

create_label() {
  local name="$1" color="$2" desc="$3"
  gh label create "$name" --color "$color" --description "$desc" --repo "$REPO" --force 2>/dev/null || true
  echo "  label: $name"
}

echo "Creating labels..."
create_label "security:P0"    "d73a4a" "Critical security finding — P0"
create_label "security:P1"    "e4e669" "High security finding — P1"
create_label "security:P2"    "0075ca" "Medium security finding — P2"
create_label "type:finding"   "ee0701" "BLACK_VAULT security finding"
create_label "type:scan-task" "1d76db" "BLACK_VAULT scan task"
create_label "status:OPEN"    "e11d48" "Finding/risk is open"
create_label "status:VERIFIED" "16a34a" "Finding fixed and verified"
create_label "status:MITIGATED" "7c3aed" "Risk mitigated"
create_label "status:ACCEPTED" "6b7280" "Risk accepted"
create_label "gate:G1"        "f59e0b" "Build gate"
create_label "gate:G2"        "f59e0b" "Lint gate"
create_label "gate:G4"        "f59e0b" "Test gate"
create_label "gate:G7"        "f59e0b" "Mutation gate"
create_label "gate:G9"        "f59e0b" "SAST gate"
echo "Labels done."

# ── Milestones ───────────────────────────────────────────────────────────────

create_milestone() {
  local title="$1" desc="$2" due="$3"
  gh api repos/"$REPO"/milestones \
    --method POST \
    --field title="$title" \
    --field description="$desc" \
    --field due_on="${due}T00:00:00Z" \
    --field state="open" \
    --silent 2>/dev/null || true
  echo "  milestone: $title"
}

echo "Creating milestones..."
create_milestone "Phase 0 — Bootstrap"    "GitHub ecosystem setup, registers, CI automation"          "2026-03-31"
create_milestone "Phase 1 — G7 Hardening" "Mutation kill suite for auth/ssrf/verifier/rateLimit"     "2026-04-15"
create_milestone "Phase 2 — Integration"  "Integration test harness, G5 coverage, live-infra tests"  "2026-05-01"
create_milestone "Phase 3 — Production"   "R004/R005 operator secrets, full production hardening"     "2026-05-31"
echo "Milestones done."

# ── Branch Protection ────────────────────────────────────────────────────────

echo "Enforcing branch protection on main..."
gh api repos/"$REPO"/branches/main/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["Run Gates G1\u20136 / gates"]}' \
  --field enforce_admins=false \
  --field required_pull_request_reviews='{"required_approving_review_count":1,"dismiss_stale_reviews":true}' \
  --field restrictions=null \
  --field required_linear_history=false \
  --field allow_force_pushes=false \
  --field allow_deletions=false \
  --silent 2>/dev/null || echo "  Branch protection: may need admin token (GITHUB_TOKEN with admin scope)"
echo "Branch protection done (or skipped — admin scope required)."

# ── GitHub Project Board ─────────────────────────────────────────────────────

echo "Creating GitHub Projects board..."
PROJECT_ID=$(gh api graphql -f query='
  mutation {
    createProjectV2(input: {
      ownerId: "'$(gh api repos/"$REPO" --jq .owner.node_id)'"
      title: "BLACK_VAULT Hardening Sprint"
    }) { projectV2 { id number } }
  }
' --jq '.data.createProjectV2.projectV2.id' 2>/dev/null || echo "")

if [[ -n "$PROJECT_ID" ]]; then
  echo "  Created project: $PROJECT_ID"
else
  echo "  Project creation: requires org/user owner access (skipped)"
fi

echo ""
echo "gh-config.sh complete."
echo "Repo: $REPO"
echo ""
echo "Next steps:"
echo "  1. Create scan-task issues: bash scripts/github-cli/create-scan-tasks.sh"
echo "  2. Sync findings:           bash scripts/github-cli/sync-issues-to-findings.sh"
echo "  3. Update project board:    bash scripts/github-cli/update-project-board.sh"
