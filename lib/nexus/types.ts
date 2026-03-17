import "server-only";

// ─── Core Finding Types ───────────────────────────────────────────────────────

export type Severity = "P0" | "P1" | "P2";
export type FindingStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "VERIFIED"
  | "ACCEPTED_RISK"
  | "WONT_FIX";

export interface Finding {
  id: string;
  severity: Severity;
  category: string;
  title: string;
  description: string;
  location: string;
  file?: string;
  line?: number;
  status: FindingStatus;
  createdAt: string; // ISO 8601
  updatedAt: string;
  fixedAt?: string;
  verifiedAt?: string;
  commitFixed?: string;
  githubIssue?: number;
  assignedTeam?: string;
  assignee?: string;
  effortHours?: number;
  complexity?: "LOW" | "MEDIUM" | "HIGH";
  impactScore?: number;
  roiScore?: number;
  mlConfidence?: number;
  org?: string;
  repo?: string;
  tags?: string[];
}

// ─── Repository Types ─────────────────────────────────────────────────────────

export type RepoStatus = "ZERO_ISSUES" | "IN_PROGRESS" | "AT_RISK" | "FAILING";

export interface Repository {
  id: string;
  name: string;
  fullName: string;
  org: string;
  url: string;
  status: RepoStatus;
  coveragePct: number;
  mutationScore: number;
  openFindings: number;
  lastScanAt: string;
  healthScore: number;
}

// ─── Gate Types ───────────────────────────────────────────────────────────────

export type GateStatus = "PASS" | "FAIL" | "SKIP" | "PARTIAL" | "MITIGATED";

export interface GateResult {
  gate: string;
  name: string;
  status: GateStatus;
  durationMs: number;
  exitCode?: number;
  failures?: string[];
  output?: string;
  timestamp: string;
}

export interface GateRun {
  id: string;
  repo: string;
  org: string;
  commit: string;
  branch: string;
  triggeredBy: "pr" | "nightly" | "release" | "manual";
  startedAt: string;
  completedAt: string;
  gates: GateResult[];
  summary: {
    totalGates: number;
    passed: number;
    failed: number;
    skipped: number;
    avgDurationMs: number;
  };
}

// ─── Metrics Types ────────────────────────────────────────────────────────────

export interface MetricsSnapshot {
  timestamp: string;
  repo: string;
  org: string;
  team?: string;
  coverage: number;
  mutationScore: number;
  openFindings: number;
  openP0: number;
  openP1: number;
  openP2: number;
  slaBreaches: number;
  gatePassRate: number;
  testCount: number;
}

// ─── Compliance Types ─────────────────────────────────────────────────────────

export type ComplianceFramework =
  | "SOC2"
  | "ISO27001"
  | "GDPR"
  | "HIPAA"
  | "PCI-DSS";
export type ComplianceStatus = "COMPLIANT" | "NON_COMPLIANT" | "IN_PROGRESS" | "NOT_APPLICABLE";

export interface ComplianceRule {
  id: string;
  framework: ComplianceFramework;
  name: string;
  description: string;
  severity: Severity;
  evidencePath?: string;
  remediationSteps?: string[];
  passed: boolean;
  evidence?: string;
}

export interface ComplianceAttestation {
  id: string;
  framework: ComplianceFramework;
  status: ComplianceStatus;
  score: number; // 0–100
  violations: ComplianceRule[];
  passedRules: ComplianceRule[];
  totalRules: number;
  signedBy: string;
  createdAt: string;
  signature?: string;
  repo?: string;
  org?: string;
}

// ─── SLA Types ────────────────────────────────────────────────────────────────

export interface SLAPolicy {
  severity: Severity;
  durationHours: number; // P0=24, P1=168, P2=720
  escalateToRole: string;
}

export interface SLABreach {
  findingId: string;
  severity: Severity;
  createdAt: string;
  deadlineAt: string;
  overdueHours: number;
  escalatedTo?: string;
  githubIssue?: number;
}

export interface Escalation {
  findingId: string;
  overdueHours: number;
  action: "auto-escalate" | "notify" | "page";
  assignee: string;
  reason: string;
  createdAt: string;
}

// ─── Cost & Effort Types ──────────────────────────────────────────────────────

export type CostRecommendation =
  | "FIX_IMMEDIATELY"
  | "SCHEDULE"
  | "ACCEPT_RISK"
  | "FIX_OPPORTUNISTICALLY";

export interface EffortMatrixEntry {
  findingId: string;
  severity: Severity;
  effortHours: number;
  impactScore: number;
  roiScore: number;
  recommendation: CostRecommendation;
  estimatedSavings?: number;
}

export interface CostReport {
  totalEffortHours: number;
  effortPerFinding: number;
  estimatedRoi: number;
  estimatedSavingsUsd: number;
  matrix: EffortMatrixEntry[];
  generatedAt: string;
}

// ─── Risk Types ───────────────────────────────────────────────────────────────

export interface RiskScore {
  filepath: string;
  score: number; // 0.0–1.0
  factors: {
    complexity: number;
    churn: number;
    coverage: number;
    age: number;
    contributors: number;
  };
  recommendation: "SCAN_IMMEDIATELY" | "SCAN_SOON" | "ROUTINE";
}

// ─── Supply Chain Types ───────────────────────────────────────────────────────

export interface SBOMComponent {
  name: string;
  version: string;
  purl?: string;
  sbomVerified: boolean;
  signature?: string;
}

export interface SignedSBOM {
  packageName: string;
  version: string;
  components: SBOMComponent[];
  signature: string;
  cert?: string;
  signedBy: string;
  timestamp: string;
  valid: boolean;
}

export interface SLSAProvenance {
  builderId: string;
  buildInvocationId: string;
  buildConfigUri: string;
  buildConfigDigest: string;
  sourceUri: string;
  sourceDigest: string;
  entrypoint: string;
  sourceMaterials: Array<{ uri: string; digest: string }>;
  timestamp: string;
  signature?: string;
}

// ─── Policy Engine Types ──────────────────────────────────────────────────────

export interface PolicyViolation {
  policyId: string;
  message: string;
  severity: Severity;
  context?: Record<string, unknown>;
}

export interface PolicyInput {
  pr?: {
    hasOpenP0Findings: boolean;
    linkedIssues: boolean;
    coveragePct?: number;
    moduleCategory?: string;
  };
  findings?: Finding[];
  dependencies?: SBOMComponent[];
  coverage?: number;
  moduleCategory?: string;
}

export interface PolicyResult {
  allowed: boolean;
  violations: PolicyViolation[];
  appliedPolicies: string[];
  evaluatedAt: string;
}

// ─── Circuit Breaker Types ────────────────────────────────────────────────────

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeoutMs: number;
  successThreshold: number;
  name: string;
}

export interface CircuitBreakerState {
  state: CircuitState;
  failures: number;
  lastFailureAt?: string;
  openedAt?: string;
  nextAttemptAt?: string;
}

// ─── Executive Dashboard Types ────────────────────────────────────────────────

export interface OrganizationHealth {
  score: number; // 0–100
  trend: string;
  target: number;
  status: "ON_TRACK" | "AT_RISK" | "BEHIND";
}

export interface ExecutiveSummary {
  organizationHealth: OrganizationHealth;
  hardeningProgress: {
    reposHardened: number;
    totalRepos: number;
    pct: number;
    etaFullHardening?: string;
  };
  securityPosture: {
    openP0: number;
    openP1: number;
    openP2: number;
    avgSlaCompliancePct: number;
    slaBreachesThisMonth: number;
  };
  qualityMetrics: {
    avgCoverage: number;
    mutationScore: number;
    gatePassRate: number;
  };
  complianceStatus: Partial<Record<ComplianceFramework, ComplianceStatus>>;
  costMetrics: {
    totalEffortHours: number;
    effortPerFinding: number;
    roi: number;
    costSavingsUsd: number;
  };
  riskAssessment: {
    criticalRisks: number;
    highRisks: number;
    riskTrend: "IMPROVING" | "STABLE" | "DEGRADING";
    mitigatedRisks: number;
    totalRisks: number;
  };
  recommendations: string[];
  generatedAt: string;
}

// ─── Integration Types ────────────────────────────────────────────────────────

export interface IntegrationConfig {
  enabled: boolean;
  endpoint?: string;
  apiKey?: string;
  serviceId?: string;
}

export interface WebhookPayload {
  event: string;
  repo?: string;
  org?: string;
  finding?: Finding;
  gateRun?: GateRun;
  slaBreaches?: SLABreach[];
  metrics?: MetricsSnapshot;
  timestamp: string;
}
