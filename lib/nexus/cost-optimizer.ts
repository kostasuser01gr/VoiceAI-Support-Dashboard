import "server-only";

import type {
  CostRecommendation,
  CostReport,
  EffortMatrixEntry,
  Finding,
  Severity,
} from "./types";

// ─── Cost Optimizer ───────────────────────────────────────────────────────────
// Analyzes effort vs impact, recommends prioritization by ROI.
// High impact + low effort → FIX_IMMEDIATELY
// High impact + high effort → SCHEDULE
// Low impact + high effort → ACCEPT_RISK
// Low impact + low effort → FIX_OPPORTUNISTICALLY

const BASE_EFFORT_HOURS: Record<Severity, number> = {
  P0: 3,
  P1: 8,
  P2: 2,
};

const COMPLEXITY_MULTIPLIER: Record<string, number> = {
  LOW: 0.5,
  MEDIUM: 1.0,
  HIGH: 2.5,
};

const IMPACT_SCORES: Record<Severity, number> = {
  P0: 100,
  P1: 60,
  P2: 20,
};

// Average fully-loaded engineer cost per hour (USD)
const HOURLY_RATE_USD = 150;

// Estimated cost of a P0 breach not fixed in time (USD)
const BREACH_COST_USD: Record<Severity, number> = {
  P0: 500_000,
  P1: 50_000,
  P2: 5_000,
};

function estimateEffortHours(finding: Finding): number {
  const base = BASE_EFFORT_HOURS[finding.severity];
  const complexityKey = finding.complexity ?? "MEDIUM";
  const multiplier = COMPLEXITY_MULTIPLIER[complexityKey] ?? 1.0;

  // Bonus effort for old/large files
  const locationPenalty =
    finding.file && finding.file.includes("db.ts") ? 1.5 : 1.0;

  return Math.max(0.5, Math.round(base * multiplier * locationPenalty * 10) / 10);
}

function computeImpactScore(finding: Finding): number {
  const base = IMPACT_SCORES[finding.severity];
  // Boost impact if linked to critical infrastructure
  const criticalFiles = ["auth.ts", "share.ts", "rbac.ts", "rateLimit.ts"];
  const isCritical = criticalFiles.some((f) => finding.location?.includes(f));
  return isCritical ? Math.min(100, base * 1.2) : base;
}

function computeRoi(impactScore: number, effortHours: number): number {
  if (effortHours === 0) return 999;
  return Math.round((impactScore / effortHours) * 10) / 10;
}

function recommendAction(
  roi: number,
  impactScore: number,
): CostRecommendation {
  if (impactScore >= 80 && roi >= 10) return "FIX_IMMEDIATELY";
  if (impactScore >= 60) return "SCHEDULE";
  if (roi < 2) return "ACCEPT_RISK";
  return "FIX_OPPORTUNISTICALLY";
}

function estimateSavingsUsd(finding: Finding, effortHours: number): number {
  const laborCost = effortHours * HOURLY_RATE_USD;
  const riskPrevented = BREACH_COST_USD[finding.severity];
  return Math.round(riskPrevented - laborCost);
}

export function analyzeEffortMatrix(findings: Finding[]): EffortMatrixEntry[] {
  return findings
    .map((finding) => {
      const effortHours = finding.effortHours ?? estimateEffortHours(finding);
      const impactScore = finding.impactScore ?? computeImpactScore(finding);
      const roiScore = computeRoi(impactScore, effortHours);
      const recommendation = recommendAction(roiScore, impactScore);
      const estimatedSavings = estimateSavingsUsd(finding, effortHours);

      return {
        findingId: finding.id,
        severity: finding.severity,
        effortHours,
        impactScore,
        roiScore,
        recommendation,
        estimatedSavings,
      };
    })
    .sort((a, b) => b.roiScore - a.roiScore);
}

export function generateCostReport(findings: Finding[]): CostReport {
  const matrix = analyzeEffortMatrix(findings);

  const totalEffortHours = matrix.reduce((sum, e) => sum + e.effortHours, 0);
  const effortPerFinding =
    matrix.length > 0 ? Math.round((totalEffortHours / matrix.length) * 10) / 10 : 0;

  const totalSavings = matrix.reduce((sum, e) => sum + (e.estimatedSavings ?? 0), 0);
  const totalLaborCost = totalEffortHours * HOURLY_RATE_USD;
  const estimatedRoi = totalLaborCost > 0 ? Math.round(totalSavings / totalLaborCost) : 0;

  return {
    totalEffortHours,
    effortPerFinding,
    estimatedRoi,
    estimatedSavingsUsd: totalSavings,
    matrix,
    generatedAt: new Date().toISOString(),
  };
}

export function getTopROIFindings(
  findings: Finding[],
  limit = 5,
): EffortMatrixEntry[] {
  return analyzeEffortMatrix(findings).slice(0, limit);
}

export function getCostSummary(findings: Finding[]): {
  totalBudgetHours: number;
  immediateActionHours: number;
  scheduledHours: number;
  immediateCount: number;
  scheduledCount: number;
  acceptRiskCount: number;
  totalSavingsUsd: number;
  roi: number;
} {
  const matrix = analyzeEffortMatrix(findings);

  const immediate = matrix.filter((e) => e.recommendation === "FIX_IMMEDIATELY");
  const scheduled = matrix.filter((e) => e.recommendation === "SCHEDULE");
  const accepted = matrix.filter((e) => e.recommendation === "ACCEPT_RISK");

  const totalBudgetHours = matrix.reduce((s, e) => s + e.effortHours, 0);
  const totalSavingsUsd = matrix.reduce((s, e) => s + (e.estimatedSavings ?? 0), 0);
  const laborCost = totalBudgetHours * HOURLY_RATE_USD;

  return {
    totalBudgetHours,
    immediateActionHours: immediate.reduce((s, e) => s + e.effortHours, 0),
    scheduledHours: scheduled.reduce((s, e) => s + e.effortHours, 0),
    immediateCount: immediate.length,
    scheduledCount: scheduled.length,
    acceptRiskCount: accepted.length,
    totalSavingsUsd,
    roi: laborCost > 0 ? Math.round(totalSavingsUsd / laborCost) : 0,
  };
}
