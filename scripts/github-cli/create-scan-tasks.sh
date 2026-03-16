#!/usr/bin/env bash
# create-scan-tasks.sh — Create GitHub Issues for pending scan tasks from Inventory.tsv
# Usage: bash scripts/github-cli/create-scan-tasks.sh [--dry-run]
# Creates one [SCAN] issue per file in Inventory.tsv that has no existing scan issue

set -euo pipefail

REPO="${GITHUB_REPO:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"
INVENTORY=".black-vault/Inventory.tsv"
DRY_RUN="${1:-}"

echo "Creating scan task issues for $REPO"
[[ "$DRY_RUN" == "--dry-run" ]] && echo "(dry-run mode — no issues will be created)"

# Get existing scan task issue titles to avoid duplicates
EXISTING=$(gh issue list \
  --repo "$REPO" \
  --label "type:scan-task" \
  --state all \
  --json title \
  --limit 200 \
  --jq '.[].title')

created=0
skipped=0

# Read inventory (skip header line)
tail -n +2 "$INVENTORY" | while IFS=$'\t' read -r file lines class risk last_scan scan_status; do
  TITLE="[SCAN] $file"

  # Check if issue already exists
  if echo "$EXISTING" | grep -qF "$file"; then
    skipped=$((skipped + 1))
    echo "  skip (exists): $file"
    continue
  fi

  # Determine priority label
  case "$risk" in
    P0)        LABEL="type:scan-task,security:P0,status:OPEN" ;;
    P1*)       LABEL="type:scan-task,security:P1,status:OPEN" ;;
    P2*)       LABEL="type:scan-task,security:P2,status:OPEN" ;;
    *)         LABEL="type:scan-task,status:OPEN" ;;
  esac

  BODY="## Scan Task: \`$file\`

| Field | Value |
|-------|-------|
| **Risk Class** | $risk |
| **Lines** | $lines |
| **Last Scan** | $last_scan |
| **Status** | $scan_status |
| **Protocol** | PROJECT_OPS_V13_BLACK_VAULT_ENTERPRISE |

## Scan Scope

Apply all 7 lenses:
- [ ] L1: Input validation & injection
- [ ] L2: Authentication & session management
- [ ] L3: Authorization & access control
- [ ] L4: Secrets & credential handling
- [ ] L5: Cryptography & hashing
- [ ] L6: Network & SSRF
- [ ] L7: Error handling & information leakage

## Actions
- [ ] Scan complete
- [ ] New findings opened as [FINDING] issues
- [ ] \`.black-vault/ScanLedger.json\` updated
- [ ] Issue closed"

  if [[ "$DRY_RUN" != "--dry-run" ]]; then
    gh issue create \
      --repo "$REPO" \
      --title "$TITLE" \
      --body "$BODY" \
      --label "$LABEL" 2>&1 | tail -1
    echo "  created: $TITLE"
    created=$((created + 1))
  else
    echo "  [dry-run] would create: $TITLE (labels: $LABEL)"
    created=$((created + 1))
  fi
done

echo "Done. Created: $created  Skipped: $skipped"
