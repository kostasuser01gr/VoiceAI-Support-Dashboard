# Autonomous Ops Ledger

## Assumptions

- The production target is the tracked GitHub repository `kostasuser01gr/Hackathon-Voice-AI-Support-Dashboard-UI`.
- `main` is the active delivery branch because the repository has no branch protection or rulesets blocking direct pushes.
- The Next.js app is the canonical deployable service in this repository.
- Untracked local directories `lib/nexus/` and `reports/` are user or generated work outside the stabilization scope and were left untouched.

## Blockers encountered

1. `npm ci` failed in GitHub Actions due to a malformed `package-lock.json` generated under an incompatible local Node/npm toolchain.
2. `npm audit` reported a stale high vulnerability because the lockfile still referenced obsolete package metadata.
3. `gitleaks` found a GCP API key in a tracked raw Cloud Run log artifact and in repository history.
4. `gh repo sync` was blocked in the working tree by unrelated untracked files.
5. GitHub CodeQL still reported two open high-severity alerts and one medium alert on the latest cleaned revision.

## Fixes attempted and applied

1. Pinned the expected runtime in `package.json` to Node 20.x and npm 10.x.
2. Rebuilt `package-lock.json` under the CI-aligned toolchain and verified `npm ci` plus `npm audit --audit-level=high`.
3. Removed the raw Cloud Run log artifact, ignored it in `.gitignore`, and purged it from Git history.
4. Opened GitHub issue `#24` to track out-of-band rotation of the previously exposed GCP key.
5. Added `workflow_dispatch` to the main CI and CodeQL workflows for explicit GitHub CLI triggering.
6. Added useful governance files: `.editorconfig`, `CONTRIBUTING.md`, and `SECURITY.md`.
7. Replaced share-password hashing with `scryptSync`, replaced weak client-side session ID fallback randomness, and returned a generic streaming error response to address open CodeQL alerts.

## Cycle ledger

1. Repo census, workflow inventory, and GitHub auth verification.
2. Baseline local install and environment-health checks.
3. Lint, typecheck, and test baseline.
4. Eval harness and build baseline.
5. Audit, Trivy, Bandit, Safety, and Gitleaks baseline.
6. Diagnose CI `EBADPLATFORM` failure down to malformed lockfile entries.
7. Rebuild dependencies under Node 20/npm 10 and confirm clean audit results.
8. Remove the leaked raw Cloud Run log artifact from the tree.
9. Commit the dependency and artifact fixes.
10. Rewrite Git history to purge the leaked artifact.
11. Reattach the GitHub remote and verify clean secret-scanning history.
12. Push the cleaned history and watch GitHub CI and CodeQL succeed.
13. Re-baseline repository policy, workflows, docs, and security posture.
14. Add governance documents and manual workflow dispatch support.
15. Re-run the full local validation matrix and required Ollama or Claude checks.
16. Push the documentation and workflow updates, then trigger and watch manual GitHub workflow runs.
17. Investigate open CodeQL alerts on `lib/share.ts`, `components/voice-action-dashboard.tsx`, and `app/api/stream/route.ts`.
18. Apply targeted fixes for the CodeQL alerts and rerun the affected validation categories.
19. Re-run the full local validation matrix and push the security remediations for fresh GitHub scanning.

## Remaining risks

- GitHub issue `#24` remains open until the previously exposed GCP key is confirmed rotated or revoked outside the repository.
- Several existing `[SCAN]` tracking issues remain open in GitHub; they are workflow or review tasks, not currently reproduced high or critical vulnerabilities in the latest validated revision.
- Release tagging was deferred because credential-rotation follow-up is still outstanding.
