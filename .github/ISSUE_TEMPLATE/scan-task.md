---
name: Scan Task
about: Track a BLACK_VAULT scan task for a file or component
title: "[SCAN] <file or component>"
labels: "type:scan-task, status:OPEN"
assignees: ""
---

## Scan Task Metadata

| Field | Value |
|-------|-------|
| **File / Component** | `lib/filename.ts` |
| **Risk Class** | <!-- P0 / P1 / P2 --> |
| **Scan Type** | <!-- 7-lens / targeted / re-scan --> |
| **Protocol** | PROJECT_OPS_V13_BLACK_VAULT_ENTERPRISE |
| **Sprint** | <!-- V12 / V13 / etc. --> |

## Scan Scope

**Lenses to apply:**
- [ ] L1: Input validation & injection
- [ ] L2: Authentication & session management
- [ ] L3: Authorization & access control
- [ ] L4: Secrets & credential handling
- [ ] L5: Cryptography & hashing
- [ ] L6: Network & SSRF
- [ ] L7: Error handling & information leakage

## Pre-Scan Checklist

- [ ] File read and fully understood
- [ ] Previous findings for this file reviewed
- [ ] Context (callers, callees) mapped

## Scan Results

<!-- Document findings below, one per lens -->

### L1: Input Validation
<!-- findings or CLEAN -->

### L2: Auth & Session
<!-- findings or CLEAN -->

### L3: Authorization
<!-- findings or CLEAN -->

### L4: Secrets
<!-- findings or CLEAN -->

### L5: Cryptography
<!-- findings or CLEAN -->

### L6: Network / SSRF
<!-- findings or CLEAN -->

### L7: Error Handling
<!-- findings or CLEAN -->

## Post-Scan Actions

- [ ] New findings opened as separate `[FINDING]` issues
- [ ] `.black-vault/ScanLedger.json` updated
- [ ] `.black-vault/Inventory.tsv` `last_scan` updated
- [ ] Issue closed as CLEAN or linked to findings
