---
name: Security Finding
about: Report a security finding from the BLACK_VAULT scan
title: "[FINDING] <short description>"
labels: "type:finding, status:OPEN"
assignees: ""
---

## Finding Metadata

| Field | Value |
|-------|-------|
| **ID** | F___ |
| **Severity** | <!-- P0 / P1 / P2 --> |
| **Category** | <!-- Injection / Auth / SSRF / Secrets / Crypto / etc. --> |
| **Location** | `file:line` |
| **Discovered** | <!-- date --> |
| **Protocol** | PROJECT_OPS_V13_BLACK_VAULT_ENTERPRISE |

## Description

<!-- Clear description of the security finding -->

## Reproduction Steps

1.
2.
3.

## Impact

<!-- What can an attacker achieve? What data/systems are at risk? -->

## Proposed Fix

<!-- How should this be remediated? -->

## Verification Criteria

- [ ] Fix implemented
- [ ] Unit test added covering the fix
- [ ] G1 Build PASS
- [ ] G2 Lint PASS
- [ ] G3 TypeCheck PASS
- [ ] G4 Tests PASS
- [ ] Finding marked VERIFIED in `.black-vault/FindingsRegister.json`

## References

<!-- CVEs, OWASP references, blog posts, etc. -->
