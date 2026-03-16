#!/usr/bin/env bash
# escalate-stuck-findings.sh — Escalate findings open for > N days without activity
# Usage: bash scripts/github-cli/escalate-stuck-findings.sh [--days 14]
# Adds comment and escalation label to stale findings

set -euo pipefail

REPO="${GITHUB_REPO:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"
DAYS="${2:-14}"

echo "Escalating findings open > $DAYS days in $REPO"

CUTOFF=$(node -e "
  const d = new Date();
  d.setDate(d.getDate() - ${DAYS});
  console.log(d.toISOString());
")

# Get open findings older than cutoff
STALE=$(gh issue list \
  --repo "$REPO" \
  --label "type:finding,status:OPEN" \
  --state open \
  --json number,title,createdAt,updatedAt,labels \
  --limit 100 \
  --jq --arg cutoff "$CUTOFF" \
  '[.[] | select(.updatedAt < $cutoff)]')

COUNT=$(echo "$STALE" | node -e "
  let d=''; process.stdin.on('data',c=>d+=c);
  process.stdin.on('end',()=>{ console.log(JSON.parse(d).length); });
")

echo "  Found $COUNT stale findings (no activity > $DAYS days)"

if [[ "$COUNT" == "0" ]]; then
  echo "No escalations needed."
  exit 0
fi

echo "$STALE" | node - << SCRIPT
const { execSync } = require('child_process');
const issues = $STALE;

for (const issue of issues) {
  const num = issue.number;
  const hasSeverity = issue.labels.some(l => l.name.startsWith('security:'));
  const severity = hasSeverity
    ? issue.labels.find(l => l.name.startsWith('security:')).name
    : 'unknown';

  console.log(\`  Escalating #\${num}: \${issue.title}\`);

  const comment = \`## Escalation Notice

This finding has had no activity for more than ${DAYS} days.

**Severity**: \${severity}
**Opened**: \${issue.createdAt.slice(0,10)}
**Last updated**: \${issue.updatedAt.slice(0,10)}

Please triage, assign, and either:
1. Fix and verify the finding
2. Update with a remediation plan and target date
3. Accept the risk with documented justification

*Auto-escalated by scripts/github-cli/escalate-stuck-findings.sh*
*Protocol: PROJECT_OPS_V13_BLACK_VAULT_ENTERPRISE*\`;

  try {
    execSync(\`gh issue comment \${num} --repo "${REPO}" --body \${JSON.stringify(comment)}\`, { stdio: 'pipe' });
    console.log(\`    → comment added to #\${num}\`);
  } catch(e) {
    console.error(\`    → error commenting on #\${num}: \${e.message}\`);
  }
}
SCRIPT

echo "Escalation complete. Processed: $COUNT findings"
