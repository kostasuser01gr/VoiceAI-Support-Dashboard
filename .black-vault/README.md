# .black-vault — Hardening Registers

Machine-readable registers for PROJECT_OPS V13 BLACK_VAULT_ENTERPRISE.
These files are the single source of truth for all security hardening artefacts.

| File | Purpose |
|------|---------|
| Inventory.tsv | Risk-classified source file inventory |
| ScanLedger.json | Per-file 7-lens scan results |
| FindingsRegister.json | All security findings (P0/P1/P2) |
| ArtifactsLedger.json | Generated artefacts (SBOM, reports, etc.) |
| MetricsLedger.json | Gate metrics over time |
| ComplianceLedger.json | Compliance audit results |
| CostLedger.json | Tooling cost tracking |
| RiskRegister.json | Open / mitigated risks |
| DecisionLog.json | Architecture and security decisions |

Updated automatically by `scripts/github-cli/` and CI workflows.
Protocol: PROJECT_OPS_V13_BLACK_VAULT_ENTERPRISE
