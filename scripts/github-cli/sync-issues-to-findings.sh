#!/usr/bin/env bash
# sync-issues-to-findings.sh — Sync GitHub Issues to FindingsRegister.json
# Reads open issues labeled type:finding and updates .black-vault/FindingsRegister.json
# Usage: bash scripts/github-cli/sync-issues-to-findings.sh

set -euo pipefail

REPO="${GITHUB_REPO:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"
REGISTER=".black-vault/FindingsRegister.json"

echo "Syncing GitHub Issues → FindingsRegister for $REPO"

# Fetch all issues with label type:finding
ISSUES=$(gh issue list \
  --repo "$REPO" \
  --label "type:finding" \
  --state all \
  --json number,title,state,labels,url,createdAt \
  --limit 100)

ISSUE_COUNT=$(echo "$ISSUES" | node -e "
  let d=''; process.stdin.on('data',c=>d+=c);
  process.stdin.on('end',()=>{ console.log(JSON.parse(d).length); });
")

echo "  Found $ISSUE_COUNT issues with label type:finding"

# Update register with GitHub issue links
node - << SCRIPT
const fs = require('fs');
const issues = $ISSUES;
const register = JSON.parse(fs.readFileSync('$REGISTER', 'utf8'));

let synced = 0;
for (const issue of issues) {
  // Match issue title pattern: [FINDING] F001 ... or title containing F\d+
  const match = issue.title.match(/F(\d{3})/);
  if (match) {
    const fid = 'F' + match[1];
    const finding = register.findings.find(f => f.id === fid);
    if (finding) {
      finding.github_issue = issue.number;
      finding.github_url = issue.url;
      finding.issue_state = issue.state;
      synced++;
    }
  }
}

register.last_synced = new Date().toISOString();
fs.writeFileSync('$REGISTER', JSON.stringify(register, null, 2));
console.log('  Synced ' + synced + ' findings to GitHub issues');
SCRIPT

echo "Sync complete. Register updated: $REGISTER"
