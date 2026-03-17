import "server-only";

import type { RiskScore } from "./types";

// ─── Risk Predictor (Anomaly Detection) ──────────────────────────────────────
// Predicts which files are most likely to have vulnerabilities based on
// code metrics: complexity, churn, coverage, age, contributor count.

// High-risk file patterns based on security sensitivity
const SECURITY_SENSITIVE_PATTERNS = [
  { pattern: /lib\/(auth|share|rbac|rateLimit|ssrf|http-security)\.ts$/, weight: 0.9 },
  { pattern: /lib\/(session|request-session|idempotency)\.ts$/, weight: 0.75 },
  { pattern: /app\/api\/(auth|process|stream)/, weight: 0.7 },
  { pattern: /lib\/(db|gemini|safety|verifier)\.ts$/, weight: 0.65 },
  { pattern: /middleware\.ts$/, weight: 0.7 },
  { pattern: /Dockerfile|\.github\/workflows/, weight: 0.6 },
];

// Low-risk patterns
const LOW_RISK_PATTERNS = [
  /\.(svg|png|jpg|ico)$/,
  /public\//,
  /docs\//,
  /tests?\//,
  /\.test\.ts$/,
  /\.spec\.ts$/,
];

interface FileMetrics {
  filepath: string;
  lineCount?: number;
  lastModifiedDays?: number;
  contributorCount?: number;
  coveragePct?: number;
  cyclomaticComplexity?: number;
}

function computeComplexityScore(metrics: FileMetrics): number {
  const complexity = metrics.cyclomaticComplexity ?? 5;
  // Normalize: >20 = high risk, <5 = low risk
  return Math.min(1.0, complexity / 20);
}

function computeChurnScore(metrics: FileMetrics): number {
  const days = metrics.lastModifiedDays ?? 30;
  // Files modified recently have higher churn risk
  if (days < 7) return 0.9;
  if (days < 30) return 0.6;
  if (days < 90) return 0.3;
  return 0.1;
}

function computeCoverageScore(metrics: FileMetrics): number {
  const coverage = metrics.coveragePct ?? 75;
  // Lower coverage = higher risk
  if (coverage < 50) return 0.9;
  if (coverage < 70) return 0.6;
  if (coverage < 85) return 0.3;
  return 0.1;
}

function computeAgeScore(metrics: FileMetrics): number {
  const days = metrics.lastModifiedDays ?? 180;
  // Very old files without recent review = risk
  if (days > 365) return 0.7;
  if (days > 180) return 0.4;
  return 0.2;
}

function computeContributorScore(metrics: FileMetrics): number {
  const count = metrics.contributorCount ?? 2;
  // Single contributor = bus factor risk; too many = inconsistency
  if (count === 1) return 0.7;
  if (count > 10) return 0.5;
  return 0.2;
}

function getSecuritySensitivityWeight(filepath: string): number {
  for (const { pattern, weight } of SECURITY_SENSITIVE_PATTERNS) {
    if (pattern.test(filepath)) {
      return weight;
    }
  }
  return 0.3; // default
}

function isLowRisk(filepath: string): boolean {
  return LOW_RISK_PATTERNS.some((p) => p.test(filepath));
}

export function predictRiskScore(metrics: FileMetrics): RiskScore {
  if (isLowRisk(metrics.filepath)) {
    return {
      filepath: metrics.filepath,
      score: 0.05,
      factors: { complexity: 0, churn: 0, coverage: 0, age: 0, contributors: 0 },
      recommendation: "ROUTINE",
    };
  }

  const factors = {
    complexity: computeComplexityScore(metrics),
    churn: computeChurnScore(metrics),
    coverage: computeCoverageScore(metrics),
    age: computeAgeScore(metrics),
    contributors: computeContributorScore(metrics),
  };

  const securityWeight = getSecuritySensitivityWeight(metrics.filepath);

  // Weighted average with security sensitivity overlay
  const baseScore =
    factors.complexity * 0.25 +
    factors.churn * 0.2 +
    factors.coverage * 0.25 +
    factors.age * 0.15 +
    factors.contributors * 0.15;

  const score = Math.min(1.0, baseScore * (1 + securityWeight * 0.5));

  const recommendation =
    score > 0.8 ? "SCAN_IMMEDIATELY" : score > 0.5 ? "SCAN_SOON" : "ROUTINE";

  return { filepath: metrics.filepath, score, factors, recommendation };
}

export function rankFilesByRisk(files: FileMetrics[]): RiskScore[] {
  return files
    .map(predictRiskScore)
    .sort((a, b) => b.score - a.score);
}

export function getHighRiskFiles(
  files: FileMetrics[],
  threshold = 0.8,
): RiskScore[] {
  return rankFilesByRisk(files).filter((r) => r.score >= threshold);
}

// Default inventory of known security-critical files for this project
export const PROJECT_SECURITY_INVENTORY: FileMetrics[] = [
  { filepath: "lib/auth.ts", lineCount: 192, contributorCount: 1, coveragePct: 82 },
  { filepath: "lib/share.ts", lineCount: 183, contributorCount: 1, coveragePct: 87 },
  { filepath: "lib/rbac.ts", lineCount: 45, contributorCount: 1, coveragePct: 95 },
  { filepath: "lib/rateLimit.ts", lineCount: 42, contributorCount: 1, coveragePct: 88 },
  { filepath: "lib/http-security.ts", lineCount: 95, contributorCount: 1, coveragePct: 79 },
  { filepath: "lib/ssrf.ts", lineCount: 169, contributorCount: 1, coveragePct: 85 },
  { filepath: "lib/safety.ts", lineCount: 127, contributorCount: 1, coveragePct: 76 },
  { filepath: "lib/verifier.ts", lineCount: 160, contributorCount: 1, coveragePct: 74 },
  { filepath: "lib/db.ts", lineCount: 783, contributorCount: 1, coveragePct: 65 },
  { filepath: "lib/gemini.ts", lineCount: 307, contributorCount: 1, coveragePct: 71 },
  { filepath: "app/api/process/route.ts", lineCount: 700, contributorCount: 1, coveragePct: 68 },
];
