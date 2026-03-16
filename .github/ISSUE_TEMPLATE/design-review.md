---
name: Design Review / Escalation
about: Escalate a finding that requires architectural decision before fix
title: "[DESIGN-REVIEW] <short description>"
labels: "escalation,type:finding,status:OPEN"
assignees: ""
---

## Escalation Metadata

| Field | Value |
|-------|-------|
| **Finding ID** | F___ |
| **Severity** | <!-- P0 / P1 / P2 --> |
| **Escalated by** | @<!-- github-username --> |
| **Date** | <!-- date --> |
| **Protocol** | PROJECT_OPS_V13_BLACK_VAULT_ENTERPRISE |
| **Linked Issue** | #<!-- original finding issue number --> |

## Problem Statement

<!-- Why is this finding blocked / stuck? What architectural decision is needed? -->

## Options

### Option A: Fix (recommended)
**Approach**: <!-- describe fix -->
**Effort**: <!-- estimate -->
**Risk**: <!-- risk if we fix this way -->

### Option B: Mitigate
**Approach**: <!-- describe mitigation -->
**Effort**: <!-- estimate -->
**Residual risk**: <!-- what risk remains -->

### Option C: Accept Risk
**Rationale**: <!-- why acceptance is justified -->
**Controls**: <!-- what compensating controls exist -->
**Owner**: <!-- who accepts this risk -->

## Impact of No Action

<!-- What happens if this is not resolved? Attack scenarios, compliance implications -->

## Decision Required By

<!-- Date by which a decision must be made to keep on schedule -->

## Resolution Checklist

- [ ] Decision made (Option A / B / C)
- [ ] Decision documented in `.black-vault/DecisionLog.json`
- [ ] `.black-vault/RiskRegister.json` updated
- [ ] Original finding issue updated with decision
- [ ] This issue closed
