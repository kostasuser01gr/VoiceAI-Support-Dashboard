import "server-only";

import type {
  Escalation,
  Finding,
  SLABreach,
  SLAPolicy,
  Severity,
} from "./types";

// ─── SLA Manager ─────────────────────────────────────────────────────────────
// Enforces SLA deadlines on finding resolution.
// P0: 24h | P1: 7 days (168h) | P2: 30 days (720h)

export const SLA_POLICIES: Record<Severity, SLAPolicy> = {
  P0: { severity: "P0", durationHours: 24, escalateToRole: "on-call-engineer" },
  P1: { severity: "P1", durationHours: 168, escalateToRole: "engineering-lead" },
  P2: { severity: "P2", durationHours: 720, escalateToRole: "engineering-manager" },
};

export function computeDeadline(createdAt: string, severity: Severity): Date {
  const policy = SLA_POLICIES[severity];
  const created = new Date(createdAt);
  return new Date(created.getTime() + policy.durationHours * 60 * 60 * 1000);
}

export function isSlaBreach(finding: Finding, now = new Date()): boolean {
  if (finding.status === "VERIFIED" || finding.status === "ACCEPTED_RISK") {
    return false;
  }
  const deadline = computeDeadline(finding.createdAt, finding.severity);
  return now > deadline;
}

export function getOverdueHours(finding: Finding, now = new Date()): number {
  if (!isSlaBreach(finding, now)) return 0;
  const deadline = computeDeadline(finding.createdAt, finding.severity);
  return Math.round((now.getTime() - deadline.getTime()) / (1000 * 60 * 60));
}

export function checkSLAs(
  findings: Finding[],
  now = new Date(),
): { breaches: SLABreach[]; escalations: Escalation[] } {
  const breaches: SLABreach[] = [];
  const escalations: Escalation[] = [];

  for (const finding of findings) {
    if (finding.status === "VERIFIED" || finding.status === "ACCEPTED_RISK") {
      continue;
    }

    const deadline = computeDeadline(finding.createdAt, finding.severity);
    const overdueHours = getOverdueHours(finding, now);

    if (overdueHours > 0) {
      const breach: SLABreach = {
        findingId: finding.id,
        severity: finding.severity,
        createdAt: finding.createdAt,
        deadlineAt: deadline.toISOString(),
        overdueHours,
        escalatedTo: SLA_POLICIES[finding.severity].escalateToRole,
        githubIssue: finding.githubIssue,
      };

      breaches.push(breach);

      escalations.push({
        findingId: finding.id,
        overdueHours,
        action: finding.severity === "P0" ? "page" : "auto-escalate",
        assignee: SLA_POLICIES[finding.severity].escalateToRole,
        reason: `Exceeded ${SLA_POLICIES[finding.severity].durationHours}h SLA by ${overdueHours}h`,
        createdAt: now.toISOString(),
      });
    }
  }

  return { breaches, escalations };
}

export function getSlaCompliancePct(findings: Finding[], now = new Date()): number {
  const nonResolved = findings.filter(
    (f) => f.status !== "VERIFIED" && f.status !== "ACCEPTED_RISK",
  );
  if (nonResolved.length === 0) return 100;

  const withinSla = nonResolved.filter((f) => !isSlaBreach(f, now));
  return Math.round((withinSla.length / nonResolved.length) * 100);
}

export function getTimeToDeadline(
  finding: Finding,
  now = new Date(),
): { hoursRemaining: number; isBreached: boolean; urgency: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" } {
  const deadline = computeDeadline(finding.createdAt, finding.severity);
  const msRemaining = deadline.getTime() - now.getTime();
  const hoursRemaining = Math.round(msRemaining / (1000 * 60 * 60));
  const isBreached = hoursRemaining < 0;

  let urgency: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  if (isBreached) urgency = "CRITICAL";
  else if (hoursRemaining < 4) urgency = "HIGH";
  else if (hoursRemaining < 24) urgency = "MEDIUM";
  else urgency = "LOW";

  return { hoursRemaining, isBreached, urgency };
}

export function formatSLABreachIssueTitle(
  finding: Finding,
  overdueHours: number,
): string {
  return `🚨 SLA BREACH: ${finding.id} (${finding.severity} — overdue ${overdueHours}h)`;
}

export function getSLASummary(findings: Finding[]): {
  total: number;
  withinSla: number;
  breached: number;
  compliancePct: number;
  byP0: { withinSla: number; breached: number };
  byP1: { withinSla: number; breached: number };
  byP2: { withinSla: number; breached: number };
} {
  const now = new Date();
  const active = findings.filter(
    (f) => f.status !== "VERIFIED" && f.status !== "ACCEPTED_RISK",
  );

  const bySeverity = (sev: Severity) => {
    const filtered = active.filter((f) => f.severity === sev);
    const breached = filtered.filter((f) => isSlaBreach(f, now));
    return { withinSla: filtered.length - breached.length, breached: breached.length };
  };

  const breachedCount = active.filter((f) => isSlaBreach(f, now)).length;

  return {
    total: active.length,
    withinSla: active.length - breachedCount,
    breached: breachedCount,
    compliancePct: getSlaCompliancePct(findings, now),
    byP0: bySeverity("P0"),
    byP1: bySeverity("P1"),
    byP2: bySeverity("P2"),
  };
}
