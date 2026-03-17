import "server-only";

import type { GateResult, GateRun } from "./types";

// ─── Auto-Rollback ────────────────────────────────────────────────────────────
// Monitors gate runs and triggers rollback procedures on critical failure.
// In CI/CD context, this flags the commit and posts status back to GitHub.

export interface RollbackDecision {
  shouldRollback: boolean;
  reason?: string;
  failedGates: string[];
  lastGoodCommit?: string;
  action: "ROLLBACK" | "ALERT_ONLY" | "NONE";
}

export interface GateMonitorResult {
  commit: string;
  allPass: boolean;
  criticalFail: boolean;
  failedGates: string[];
  recommendation: RollbackDecision;
}

// Gates that warrant auto-rollback if they fail
const CRITICAL_GATES = new Set(["G1", "G3", "G4", "G10"]);

// Gates that trigger alert-only (not auto-rollback)
const ALERT_GATES = new Set(["G6", "G7", "G8", "G9"]);

export function analyzeGateRun(run: GateRun): GateMonitorResult {
  const failedGates = run.gates
    .filter((g) => g.status === "FAIL")
    .map((g) => g.gate);

  const criticalFailed = failedGates.filter((g) => CRITICAL_GATES.has(g));
  const alertFailed = failedGates.filter((g) => ALERT_GATES.has(g));

  const allPass = failedGates.length === 0;
  const criticalFail = criticalFailed.length > 0;

  let action: RollbackDecision["action"] = "NONE";
  let reason: string | undefined;

  if (criticalFail) {
    action = "ROLLBACK";
    reason = `Critical gate(s) failed: ${criticalFailed.join(", ")}`;
  } else if (alertFailed.length > 0) {
    action = "ALERT_ONLY";
    reason = `Non-critical gate(s) failed: ${alertFailed.join(", ")}`;
  }

  return {
    commit: run.commit,
    allPass,
    criticalFail,
    failedGates,
    recommendation: {
      shouldRollback: action === "ROLLBACK",
      reason,
      failedGates,
      action,
    },
  };
}

export function shouldTriggerRollback(gates: GateResult[]): boolean {
  return gates.some(
    (g) => g.status === "FAIL" && CRITICAL_GATES.has(g.gate),
  );
}

export function generateRollbackReport(
  run: GateRun,
  decision: RollbackDecision,
): string {
  const lines = [
    `## 🚨 Gate Run Failure Report`,
    ``,
    `**Commit**: \`${run.commit}\``,
    `**Branch**: \`${run.branch}\``,
    `**Triggered By**: ${run.triggeredBy}`,
    `**Completed At**: ${run.completedAt}`,
    ``,
    `### Failed Gates`,
    ...decision.failedGates.map((g) => `- ❌ ${g}`),
    ``,
    `### Recommended Action`,
    decision.action === "ROLLBACK"
      ? `**AUTO-ROLLBACK**: Revert to last known good commit.`
      : `**ALERT ONLY**: Non-critical failures detected. Investigate and fix.`,
    ``,
    decision.reason ? `**Reason**: ${decision.reason}` : "",
    ``,
    `### Gate Summary`,
    `- Total Gates: ${run.summary.totalGates}`,
    `- Passed: ${run.summary.passed}`,
    `- Failed: ${run.summary.failed}`,
    `- Skipped: ${run.summary.skipped}`,
  ];

  return lines.filter((l) => l !== "").join("\n");
}

export function buildGitHubStatusPayload(
  commit: string,
  decision: RollbackDecision,
  repoUrl: string,
): {
  state: "success" | "failure" | "error" | "pending";
  description: string;
  context: string;
  target_url: string;
} {
  const state = decision.action === "ROLLBACK" ? "failure" : "success";
  const description =
    decision.action === "ROLLBACK"
      ? `Critical gates failed: ${decision.failedGates.slice(0, 3).join(", ")}`
      : `All critical gates passed (${decision.failedGates.length} warnings)`;

  return {
    state,
    description: description.slice(0, 140),
    context: "nexus/gate-suite",
    target_url: `${repoUrl}/commit/${commit}`,
  };
}

// ─── Recovery Monitor ─────────────────────────────────────────────────────────

export interface RecoveryAction {
  type: "RESTART_SERVICE" | "CLEAR_CACHE" | "REVERT_COMMIT" | "NOTIFY_ONCALL";
  details: string;
  automated: boolean;
}

export function getRecoveryActions(decision: RollbackDecision): RecoveryAction[] {
  const actions: RecoveryAction[] = [];

  if (decision.failedGates.includes("G1")) {
    actions.push({
      type: "NOTIFY_ONCALL",
      details: "Build failure — engineering team must fix compilation errors",
      automated: false,
    });
  }

  if (decision.failedGates.includes("G4")) {
    actions.push({
      type: "REVERT_COMMIT",
      details: "Test suite failure — consider reverting to last green commit",
      automated: false,
    });
  }

  if (decision.failedGates.includes("G10")) {
    actions.push({
      type: "NOTIFY_ONCALL",
      details: "Secrets detected in code — IMMEDIATE review required",
      automated: false,
    });
    actions.push({
      type: "REVERT_COMMIT",
      details: "Revert commit containing secrets immediately",
      automated: true,
    });
  }

  if (decision.failedGates.includes("G9")) {
    actions.push({
      type: "NOTIFY_ONCALL",
      details: "SAST findings detected — review security scan results",
      automated: false,
    });
  }

  return actions;
}
