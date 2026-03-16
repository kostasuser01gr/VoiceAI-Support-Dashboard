# Pull Request

## Summary

<!-- 1-3 bullet points describing what this PR does -->

## Type

- [ ] Security fix (P0/P1/P2 finding)
- [ ] Feature
- [ ] Bug fix
- [ ] Refactor
- [ ] Test improvement
- [ ] Docs / config

## Security Impact

<!-- Does this PR affect security-critical files? List them. -->
<!-- If no security impact, write "None" -->

## Gate Checklist

All gates must pass before merge:

- [ ] **G1** `npm run build` — PASS
- [ ] **G2** `npx eslint . --max-warnings 0` — PASS (0 violations)
- [ ] **G3** `npx tsc --noEmit` — PASS (0 errors)
- [ ] **G4** `npm test` — PASS (all tests passing)
- [ ] **G6** Coverage thresholds met (≥75% line, ≥60% branch, ≥70% function)

For P0/P1 changes also check:
- [ ] **G9** `semgrep --config=p/security-audit .` — 0 findings
- [ ] **G10** Secrets scan — 0 hardcoded credentials

## Findings Register

<!-- If this PR fixes a security finding: -->
- Finding ID(s): F___
- Status after merge: VERIFIED
- `.black-vault/FindingsRegister.json` updated: [ ]

## Test Coverage

<!-- What tests were added/modified to cover this change? -->

## Deployment Notes

<!-- Any environment variables, migrations, or operator actions required? -->

## Reviewer Notes

<!-- Anything the reviewer should pay special attention to? -->

---
*Protocol: PROJECT_OPS_V13_BLACK_VAULT_ENTERPRISE*
