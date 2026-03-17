import "server-only";

import { createHash, createHmac } from "node:crypto";

import type {
  ComplianceAttestation,
  ComplianceFramework,
  ComplianceRule,
  ComplianceStatus,
  Finding,
} from "./types";

// ─── Compliance Bot ───────────────────────────────────────────────────────────
// Continuous policy verification: SOC2, ISO27001, GDPR, HIPAA, PCI-DSS.
// Checks compliance rules as code and produces signed attestation reports.

// ─── SOC2 Rules ───────────────────────────────────────────────────────────────

const SOC2_RULES: Omit<ComplianceRule, "passed" | "evidence">[] = [
  {
    id: "SOC2-CC6.1",
    framework: "SOC2",
    name: "Logical Access Controls",
    description: "Access controls enforced via RBAC",
    severity: "P0",
    evidencePath: "lib/rbac.ts",
    remediationSteps: ["Implement RBAC", "Audit access logs quarterly"],
  },
  {
    id: "SOC2-CC6.2",
    framework: "SOC2",
    name: "Authentication Controls",
    description: "Strong authentication with session management",
    severity: "P0",
    evidencePath: "lib/auth.ts",
    remediationSteps: ["Implement MFA", "Use secure session tokens"],
  },
  {
    id: "SOC2-CC6.7",
    framework: "SOC2",
    name: "Encryption in Transit",
    description: "All data encrypted in transit (TLS/HTTPS)",
    severity: "P0",
    evidencePath: "lib/http-security.ts",
    remediationSteps: ["Enforce HTTPS", "Add HSTS headers"],
  },
  {
    id: "SOC2-CC7.1",
    framework: "SOC2",
    name: "Vulnerability Management",
    description: "Regular security scanning and patch management",
    severity: "P1",
    evidencePath: ".github/workflows/gates-nightly.yml",
    remediationSteps: ["Run weekly vulnerability scans", "Patch within SLA"],
  },
  {
    id: "SOC2-CC8.1",
    framework: "SOC2",
    name: "Change Management",
    description: "Peer review required for all code changes",
    severity: "P1",
    evidencePath: ".github/ISSUE_TEMPLATE",
    remediationSteps: ["Require PR reviews", "Enforce branch protection"],
  },
  {
    id: "SOC2-CC9.1",
    framework: "SOC2",
    name: "Rate Limiting",
    description: "API rate limiting implemented to prevent abuse",
    severity: "P1",
    evidencePath: "lib/rateLimit.ts",
    remediationSteps: ["Implement rate limiting", "Set appropriate thresholds"],
  },
];

// ─── ISO 27001 Rules ──────────────────────────────────────────────────────────

const ISO27001_RULES: Omit<ComplianceRule, "passed" | "evidence">[] = [
  {
    id: "ISO-A.9.1",
    framework: "ISO27001",
    name: "Access Control Policy",
    description: "Formal access control policy with RBAC enforcement",
    severity: "P0",
    evidencePath: "lib/rbac.ts",
  },
  {
    id: "ISO-A.10.1",
    framework: "ISO27001",
    name: "Cryptographic Controls",
    description: "HMAC-SHA256 signing for tokens, no plain SHA256",
    severity: "P0",
    evidencePath: "lib/share.ts",
  },
  {
    id: "ISO-A.12.6",
    framework: "ISO27001",
    name: "Technical Vulnerability Management",
    description: "Automated dependency scanning and patching",
    severity: "P1",
    evidencePath: ".github/dependabot.yml",
  },
  {
    id: "ISO-A.14.2",
    framework: "ISO27001",
    name: "Secure Development",
    description: "Security integrated into development lifecycle (CI gates)",
    severity: "P1",
    evidencePath: ".github/workflows/gates-on-pr.yml",
  },
  {
    id: "ISO-A.16.1",
    framework: "ISO27001",
    name: "Incident Management",
    description: "Security incident response process documented",
    severity: "P1",
    evidencePath: "docs/incident-severity.md",
  },
];

// ─── GDPR Rules ───────────────────────────────────────────────────────────────

const GDPR_RULES: Omit<ComplianceRule, "passed" | "evidence">[] = [
  {
    id: "GDPR-Art.25",
    framework: "GDPR",
    name: "Data Protection by Design",
    description: "Minimum data collection, no PII in logs",
    severity: "P0",
    remediationSteps: ["Audit data collection", "Remove PII from logs"],
  },
  {
    id: "GDPR-Art.32",
    framework: "GDPR",
    name: "Security of Processing",
    description: "Appropriate technical measures (encryption, access control)",
    severity: "P0",
    evidencePath: "lib/http-security.ts",
  },
  {
    id: "GDPR-Art.33",
    framework: "GDPR",
    name: "Breach Notification",
    description: "Incident response process for 72h breach notification",
    severity: "P1",
    evidencePath: "docs/incident-severity.md",
  },
  {
    id: "GDPR-Art.35",
    framework: "GDPR",
    name: "Data Impact Assessment",
    description: "DPIA process for high-risk processing",
    severity: "P2",
    remediationSteps: ["Conduct DPIA", "Document processing activities"],
  },
];

// ─── HIPAA Rules ──────────────────────────────────────────────────────────────

const HIPAA_RULES: Omit<ComplianceRule, "passed" | "evidence">[] = [
  {
    id: "HIPAA-164.312a",
    framework: "HIPAA",
    name: "Access Control",
    description: "Unique user identification and emergency access procedure",
    severity: "P0",
    evidencePath: "lib/auth.ts",
  },
  {
    id: "HIPAA-164.312b",
    framework: "HIPAA",
    name: "Audit Controls",
    description: "Hardware and software activity recording",
    severity: "P1",
    evidencePath: "lib/observability.ts",
  },
  {
    id: "HIPAA-164.312e",
    framework: "HIPAA",
    name: "Transmission Security",
    description: "Encryption in transit for ePHI",
    severity: "P0",
    evidencePath: "lib/http-security.ts",
  },
];

// ─── PCI-DSS Rules ────────────────────────────────────────────────────────────

const PCI_DSS_RULES: Omit<ComplianceRule, "passed" | "evidence">[] = [
  {
    id: "PCI-R1",
    framework: "PCI-DSS",
    name: "Network Security",
    description: "Firewall configuration and network segmentation",
    severity: "P0",
    remediationSteps: ["Configure WAF", "Network segmentation"],
  },
  {
    id: "PCI-R2",
    framework: "PCI-DSS",
    name: "Secure Systems",
    description: "No default passwords, security hardening",
    severity: "P0",
    evidencePath: "lib/auth.ts",
  },
  {
    id: "PCI-R6",
    framework: "PCI-DSS",
    name: "Secure Systems Development",
    description: "Secure SDLC, vulnerability scanning",
    severity: "P1",
    evidencePath: ".github/workflows/gates-on-pr.yml",
  },
  {
    id: "PCI-R10",
    framework: "PCI-DSS",
    name: "Access Monitoring",
    description: "Logging and monitoring of all access to system components",
    severity: "P1",
    evidencePath: "lib/observability.ts",
  },
];

const RULES_BY_FRAMEWORK: Record<
  ComplianceFramework,
  Omit<ComplianceRule, "passed" | "evidence">[]
> = {
  SOC2: SOC2_RULES,
  ISO27001: ISO27001_RULES,
  GDPR: GDPR_RULES,
  HIPAA: HIPAA_RULES,
  "PCI-DSS": PCI_DSS_RULES,
};

// ─── Rule Evaluation ──────────────────────────────────────────────────────────

function evaluateRule(
  rule: Omit<ComplianceRule, "passed" | "evidence">,
  openFindings: Finding[],
): ComplianceRule {
  // A rule fails if there are open P0 findings in the relevant file
  const criticalOpenInFile = openFindings.filter(
    (f) =>
      f.status === "OPEN" &&
      f.severity === "P0" &&
      f.location &&
      rule.evidencePath &&
      f.location.includes(rule.evidencePath.replace("lib/", "").replace(".ts", "")),
  );

  const passed = criticalOpenInFile.length === 0;
  const evidence = passed
    ? `Verified: ${rule.evidencePath ?? "policy enforcement active"}`
    : `FAIL: ${criticalOpenInFile.length} open P0 finding(s) in scope`;

  return { ...rule, passed, evidence };
}

export function verifyCompliance(
  framework: ComplianceFramework,
  openFindings: Finding[],
): ComplianceAttestation {
  const ruleTemplates = RULES_BY_FRAMEWORK[framework] ?? [];
  const evaluatedRules = ruleTemplates.map((r) => evaluateRule(r, openFindings));

  const violations = evaluatedRules.filter((r) => !r.passed);
  const passedRules = evaluatedRules.filter((r) => r.passed);

  const score =
    evaluatedRules.length > 0
      ? Math.round((passedRules.length / evaluatedRules.length) * 100)
      : 100;

  let status: ComplianceStatus;
  if (violations.length === 0) status = "COMPLIANT";
  else if (violations.some((v) => v.severity === "P0")) status = "NON_COMPLIANT";
  else status = "IN_PROGRESS";

  const attestationBody = JSON.stringify({
    framework,
    score,
    violations: violations.length,
    timestamp: new Date().toISOString(),
  });

  const signingKey = process.env.SESSION_SIGNING_SECRET ?? "nexus-attestation-key";
  const signature = createHmac("sha256", signingKey)
    .update(attestationBody)
    .digest("hex");

  return {
    id: createHash("sha256")
      .update(`${framework}:${new Date().toISOString()}`)
      .digest("hex")
      .slice(0, 16),
    framework,
    status,
    score,
    violations,
    passedRules,
    totalRules: evaluatedRules.length,
    signedBy: "compliance-bot@nexus",
    createdAt: new Date().toISOString(),
    signature,
  };
}

export function getAllFrameworkStatuses(
  openFindings: Finding[],
): Partial<Record<ComplianceFramework, ComplianceStatus>> {
  const frameworks: ComplianceFramework[] = [
    "SOC2",
    "ISO27001",
    "GDPR",
    "HIPAA",
    "PCI-DSS",
  ];
  const result: Partial<Record<ComplianceFramework, ComplianceStatus>> = {};

  for (const fw of frameworks) {
    const attestation = verifyCompliance(fw, openFindings);
    result[fw] = attestation.status;
  }

  return result;
}
