#!/usr/bin/env bash
# update-project-board.sh — Move issues to correct columns on GitHub Projects board
# Usage: bash scripts/github-cli/update-project-board.sh
# Reads FindingsRegister.json and moves issues based on status

set -euo pipefail

REPO="${GITHUB_REPO:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"
REGISTER=".black-vault/FindingsRegister.json"

echo "Updating GitHub Projects board for $REPO"

# Get project ID for "BLACK_VAULT Hardening Sprint"
OWNER=$(echo "$REPO" | cut -d/ -f1)
PROJECT_NUMBER=$(gh project list --owner "$OWNER" --json number,title --jq \
  '.[] | select(.title | test("BLACK_VAULT")) | .number' 2>/dev/null | head -1 || echo "")

if [[ -z "$PROJECT_NUMBER" ]]; then
  echo "  No BLACK_VAULT project board found. Run gh-config.sh first."
  exit 0
fi

echo "  Project: $PROJECT_NUMBER"

# Read findings with github issues
node - << SCRIPT
const { execSync } = require('child_process');
const register = require('./.black-vault/FindingsRegister.json');

for (const finding of register.findings) {
  if (!finding.github_issue) continue;

  const status = finding.status;
  const issue = finding.github_issue;

  console.log(\`  Finding \${finding.id} (issue #\${issue}): \${status}\`);

  try {
    // Add issue to project board if not already there
    execSync(\`gh project item-add ${PROJECT_NUMBER} --owner "${OWNER}" --url "https://github.com/${REPO}/issues/\${issue}"\`, { stdio: 'pipe' });
  } catch (e) {
    // Already in project or error — continue
  }
}
console.log('Board update complete');
SCRIPT
