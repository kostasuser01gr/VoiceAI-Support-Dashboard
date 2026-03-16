#!/usr/bin/env bash
# auto-triage-findings.sh — Auto-label and assign severity on new finding issues
# Usage: bash scripts/github-cli/auto-triage-findings.sh [issue-number]
# Without argument: triages all open findings without a severity label

set -euo pipefail

REPO="${GITHUB_REPO:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"

triage_issue() {
  local NUMBER="$1"
  local TITLE
  TITLE=$(gh issue view "$NUMBER" --repo "$REPO" --json title --jq '.title')

  echo "  Triaging #$NUMBER: $TITLE"

  # Detect severity from title
  local SEVERITY_LABEL=""
  if echo "$TITLE" | grep -qi "P0\|critical\|hardcoded.*secret\|auth bypass\|rce\|sqli"; then
    SEVERITY_LABEL="security:P0"
  elif echo "$TITLE" | grep -qi "P1\|high\|ssrf\|injection\|csrf\|session"; then
    SEVERITY_LABEL="security:P1"
  elif echo "$TITLE" | grep -qi "P2\|medium\|csp\|xss\|open redirect\|info disclosure"; then
    SEVERITY_LABEL="security:P2"
  fi

  if [[ -n "$SEVERITY_LABEL" ]]; then
    gh issue edit "$NUMBER" --repo "$REPO" --add-label "$SEVERITY_LABEL" --silent 2>/dev/null || true
    echo "    → labeled: $SEVERITY_LABEL"
  fi

  # Ensure status:OPEN is set
  gh issue edit "$NUMBER" --repo "$REPO" --add-label "status:OPEN" --silent 2>/dev/null || true

  # Add milestone if not set — default to Phase 1
  CURRENT_MILESTONE=$(gh issue view "$NUMBER" --repo "$REPO" --json milestone --jq '.milestone.title // ""')
  if [[ -z "$CURRENT_MILESTONE" ]]; then
    MILESTONE_NUM=$(gh api repos/"$REPO"/milestones \
      --jq '.[] | select(.title | test("Phase 1")) | .number' 2>/dev/null | head -1 || echo "")
    if [[ -n "$MILESTONE_NUM" ]]; then
      gh issue edit "$NUMBER" --repo "$REPO" --milestone "$MILESTONE_NUM" --silent 2>/dev/null || true
      echo "    → milestone: Phase 1"
    fi
  fi
}

if [[ -n "${1:-}" ]]; then
  # Triage specific issue
  triage_issue "$1"
else
  # Triage all open findings without severity label
  echo "Triaging all open findings in $REPO..."
  ISSUES=$(gh issue list \
    --repo "$REPO" \
    --label "type:finding" \
    --state open \
    --json number \
    --jq '.[].number')

  COUNT=0
  while IFS= read -r NUM; do
    [[ -z "$NUM" ]] && continue
    triage_issue "$NUM"
    COUNT=$((COUNT + 1))
  done <<< "$ISSUES"

  echo "Triage complete. Processed: $COUNT issues"
fi
