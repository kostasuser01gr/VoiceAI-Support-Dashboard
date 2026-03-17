import "server-only";

import { GoogleGenAI } from "@google/genai";

import type { Finding, Severity } from "./types";

// ─── ML-Powered Finding Classifier ───────────────────────────────────────────
// Uses Gemini AI to auto-classify findings as P0/P1/P2 with confidence scores.
// Replaces Python ML model with Gemini-powered classification.

const HIGH_RISK_PATTERNS = [
  /sql\s*injection/i,
  /auth(entication|orization)?\s*(bypass|flaw|vuln)/i,
  /hardcoded\s*(secret|password|key|token)/i,
  /crypto(graphy)?\s*(weakness|flaw|error)/i,
  /unencrypted\s*(data|storage|transmission)/i,
  /rce|remote\s*code\s*execution/i,
  /path\s*traversal/i,
  /xxe|xml\s*external\s*entity/i,
  /ssrf/i,
  /deserialization/i,
];

const MEDIUM_RISK_PATTERNS = [
  /xss|cross.site\s*scripting/i,
  /csrf|cross.site\s*request\s*forgery/i,
  /open\s*redirect/i,
  /missing\s*(rate\s*limit|auth\s*check)/i,
  /insecure\s*(direct\s*object|reference)/i,
  /cookie\s*(flags?|samesite|httponly|secure)/i,
  /session\s*(fixation|hijacking)/i,
  /broken\s*access\s*control/i,
];

const P0_FILES = [
  /lib\/auth\.ts/,
  /lib\/share\.ts/,
  /lib\/rbac\.ts/,
  /lib\/rateLimit\.ts/,
  /lib\/ssrf\.ts/,
  /lib\/http-security\.ts/,
];

const EFFORT_THRESHOLDS = {
  P0: { maxHours: 4, label: "≤4h" },
  P1: { maxHours: 16, label: "≤16h" },
  P2: { maxHours: 40, label: "≤40h" },
};

function ruleBasedClassify(finding: Partial<Finding>): {
  severity: Severity;
  confidence: number;
} {
  const text = `${finding.category ?? ""} ${finding.title ?? ""} ${finding.description ?? ""}`;
  const loc = finding.location ?? finding.file ?? "";

  // Check P0 patterns
  for (const pattern of HIGH_RISK_PATTERNS) {
    if (pattern.test(text)) {
      return { severity: "P0", confidence: 0.88 };
    }
  }

  // P0 if in security-critical file
  for (const filePattern of P0_FILES) {
    if (filePattern.test(loc)) {
      return { severity: "P0", confidence: 0.82 };
    }
  }

  // Check P1 patterns
  for (const pattern of MEDIUM_RISK_PATTERNS) {
    if (pattern.test(text)) {
      return { severity: "P1", confidence: 0.79 };
    }
  }

  return { severity: "P2", confidence: 0.72 };
}

async function geminiClassify(
  finding: Partial<Finding>,
): Promise<{ severity: Severity; confidence: number; reasoning: string } | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `You are a security expert. Classify the following security finding as P0 (critical), P1 (high), or P2 (medium/low).

Finding:
- Category: ${finding.category ?? "unknown"}
- Title: ${finding.title ?? "unknown"}
- Description: ${finding.description ?? "none"}
- Location: ${finding.location ?? "unknown"}

Rules:
- P0: Auth bypass, RCE, hardcoded secrets, SQL injection, SSRF, crypto failure, data exfiltration risk
- P1: XSS, CSRF, session issues, missing rate-limits, broken access control, info disclosure
- P2: Type errors, missing headers, code quality, low-severity config issues

Respond ONLY with valid JSON: {"severity":"P0"|"P1"|"P2","confidence":0.0-1.0,"reasoning":"one sentence"}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    });

    if (!response.text) return null;

    const parsed = JSON.parse(response.text) as {
      severity: Severity;
      confidence: number;
      reasoning: string;
    };

    if (!["P0", "P1", "P2"].includes(parsed.severity)) return null;

    return parsed;
  } catch {
    return null;
  }
}

export async function classifyFinding(finding: Partial<Finding>): Promise<{
  severity: Severity;
  confidence: number;
  reasoning: string;
  method: "gemini" | "rule-based";
}> {
  // Try Gemini first for highest accuracy
  const geminiResult = await geminiClassify(finding);
  if (geminiResult && geminiResult.confidence >= 0.75) {
    return { ...geminiResult, method: "gemini" };
  }

  // Fallback to rule-based classifier
  const ruleResult = ruleBasedClassify(finding);
  return {
    ...ruleResult,
    reasoning: `Rule-based classification: matched ${ruleResult.severity} severity patterns`,
    method: "rule-based",
  };
}

export function getEffortEstimate(severity: Severity): string {
  return EFFORT_THRESHOLDS[severity].label;
}

export function getEffortHours(severity: Severity, complexity: "LOW" | "MEDIUM" | "HIGH"): number {
  const multiplier = complexity === "LOW" ? 0.5 : complexity === "HIGH" ? 2.0 : 1.0;
  return Math.round(EFFORT_THRESHOLDS[severity].maxHours * multiplier);
}

export function buildIssueTitle(
  finding: Partial<Finding>,
  severity: Severity,
  confidence: number,
): string {
  const confidencePct = Math.round(confidence * 100);
  return `[${severity} (ML confidence: ${confidencePct}%)] ${finding.title ?? finding.category ?? "Security Finding"}`;
}
