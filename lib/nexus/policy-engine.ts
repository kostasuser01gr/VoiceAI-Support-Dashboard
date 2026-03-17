import "server-only";

import type { Finding, PolicyInput, PolicyResult, PolicyViolation, Severity } from "./types";

// ─── Policy Engine (OPA-style TypeScript) ────────────────────────────────────
// Organization-wide policies enforced as TypeScript rules.
// Mirrors OPA/Rego semantics but implemented natively.

export interface PolicyRule {
  id: string;
  name: string;
  description: string;
  severity: Severity;
  evaluate: (input: PolicyInput) => PolicyViolation | null;
}

// ─── Policy Definitions ───────────────────────────────────────────────────────

const POLICIES: PolicyRule[] = [
  // P1: No P0 findings can be merged
  {
    id: "NEXUS-P001",
    name: "No Open P0 Findings on Merge",
    description: "PR cannot be merged when there are open P0 security findings",
    severity: "P0",
    evaluate(input) {
      if (input.pr?.hasOpenP0Findings) {
        return {
          policyId: "NEXUS-P001",
          message: "PR cannot be merged: Open P0 findings detected. Resolve all P0 findings first.",
          severity: "P0",
          context: { hasOpenP0Findings: true },
        };
      }
      return null;
    },
  },

  // P2: Core module coverage ≥80%
  {
    id: "NEXUS-P002",
    name: "Core Module Coverage Threshold",
    description: "Core modules must maintain ≥80% test coverage",
    severity: "P1",
    evaluate(input) {
      const cov = input.pr?.coveragePct ?? input.coverage;
      if (cov !== undefined && cov < 80 && input.pr?.moduleCategory === "core") {
        return {
          policyId: "NEXUS-P002",
          message: `Core module coverage below 80%: ${cov.toFixed(1)}%. Add tests before merging.`,
          severity: "P1",
          context: { coverage: cov, threshold: 80 },
        };
      }
      return null;
    },
  },

  // P3: All PRs must link to an issue
  {
    id: "NEXUS-P003",
    name: "PR Must Link to Issue",
    description: "All PRs must reference at least one GitHub issue",
    severity: "P2",
    evaluate(input) {
      if (input.pr && input.pr.linkedIssues === false) {
        return {
          policyId: "NEXUS-P003",
          message:
            "PR must link to at least one GitHub issue (finding or scan-task). Add 'Closes #NNN' or 'Refs #NNN'.",
          severity: "P2",
          context: { linkedIssues: false },
        };
      }
      return null;
    },
  },

  // P4: SLA must be met (P0: 24h, P1: 7d, P2: 30d)
  {
    id: "NEXUS-P004",
    name: "SLA Compliance",
    description: "Findings must be resolved within their SLA deadline",
    severity: "P0",
    evaluate(input) {
      if (!input.findings) return null;

      const SLA_HOURS: Record<Severity, number> = { P0: 24, P1: 168, P2: 720 };
      const now = Date.now();

      const breached = input.findings.filter((f) => {
        if (f.status === "VERIFIED" || f.status === "ACCEPTED_RISK") return false;
        const deadline = new Date(f.createdAt).getTime() + SLA_HOURS[f.severity] * 3600000;
        return now > deadline;
      });

      if (breached.length > 0) {
        return {
          policyId: "NEXUS-P004",
          message: `SLA exceeded for ${breached.length} finding(s): ${breached.map((f) => f.id).join(", ")}`,
          severity: "P0",
          context: { breachedIds: breached.map((f) => f.id) },
        };
      }
      return null;
    },
  },

  // P5: All dependencies must have verified SBOM
  {
    id: "NEXUS-P005",
    name: "Supply Chain Verification",
    description: "All dependencies must have verified SBOM signatures",
    severity: "P1",
    evaluate(input) {
      if (!input.dependencies) return null;

      const unverified = input.dependencies.filter((d) => !d.sbomVerified);
      if (unverified.length > 0) {
        return {
          policyId: "NEXUS-P005",
          message: `Unverified SBOM for ${unverified.length} dependency(ies): ${unverified
            .slice(0, 3)
            .map((d) => d.name)
            .join(", ")}${unverified.length > 3 ? " ..." : ""}`,
          severity: "P1",
          context: { unverifiedDeps: unverified.map((d) => d.name) },
        };
      }
      return null;
    },
  },

  // P6: No open P1 findings older than 7 days in P0 files
  {
    id: "NEXUS-P006",
    name: "Critical File P1 Age Limit",
    description: "P1 findings in critical security files must be resolved within 7 days",
    severity: "P1",
    evaluate(input) {
      if (!input.findings) return null;

      const criticalPaths = ["auth.ts", "share.ts", "rbac.ts", "ssrf.ts", "rateLimit.ts"];
      const now = Date.now();
      const sevenDaysMs = 7 * 24 * 3600000;

      const stale = input.findings.filter((f) => {
        if (f.severity !== "P1" || f.status === "VERIFIED" || f.status === "ACCEPTED_RISK") {
          return false;
        }
        const isCriticalFile = criticalPaths.some((p) => f.location?.includes(p));
        const isOld = now - new Date(f.createdAt).getTime() > sevenDaysMs;
        return isCriticalFile && isOld;
      });

      if (stale.length > 0) {
        return {
          policyId: "NEXUS-P006",
          message: `${stale.length} stale P1 finding(s) in critical security files: ${stale.map((f) => f.id).join(", ")}`,
          severity: "P1",
          context: { staleIds: stale.map((f) => f.id) },
        };
      }
      return null;
    },
  },
];

// ─── Policy Evaluator ─────────────────────────────────────────────────────────

export function evaluatePolicies(input: PolicyInput): PolicyResult {
  const violations: PolicyViolation[] = [];
  const appliedPolicies: string[] = [];

  for (const policy of POLICIES) {
    const violation = policy.evaluate(input);
    appliedPolicies.push(policy.id);
    if (violation) {
      violations.push(violation);
    }
  }

  return {
    allowed: violations.length === 0,
    violations,
    appliedPolicies,
    evaluatedAt: new Date().toISOString(),
  };
}

export function evaluatePolicy(policyId: string, input: PolicyInput): PolicyResult {
  const policy = POLICIES.find((p) => p.id === policyId);
  if (!policy) {
    return {
      allowed: true,
      violations: [],
      appliedPolicies: [],
      evaluatedAt: new Date().toISOString(),
    };
  }

  const violation = policy.evaluate(input);
  return {
    allowed: !violation,
    violations: violation ? [violation] : [],
    appliedPolicies: [policy.id],
    evaluatedAt: new Date().toISOString(),
  };
}

export function getPolicySummary(): Array<{
  id: string;
  name: string;
  description: string;
  severity: Severity;
}> {
  return POLICIES.map(({ id, name, description, severity }) => ({
    id,
    name,
    description,
    severity,
  }));
}

export function evaluateForPR(
  hasOpenP0Findings: boolean,
  linkedIssues: boolean,
  coveragePct: number,
  openFindings: Finding[],
): PolicyResult {
  const input: PolicyInput = {
    pr: {
      hasOpenP0Findings,
      linkedIssues,
      coveragePct,
      moduleCategory: "core",
    },
    findings: openFindings,
  };

  return evaluatePolicies(input);
}
