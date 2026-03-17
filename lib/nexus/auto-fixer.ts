import "server-only";

import { GoogleGenAI } from "@google/genai";

import type { Finding, Severity } from "./types";

// ─── Auto-Fixer (Remediation Engine) ─────────────────────────────────────────
// Generates fix suggestions based on finding type and codebase patterns.
// Uses Gemini AI for high-confidence fix generation; falls back to templates.

export interface CodePatch {
  description: string;
  steps: string[];
  codeExample?: string;
  confidence: number; // 0.0–1.0
  automated: boolean; // Can be auto-applied
  testRequired: boolean;
  references?: string[];
}

// ─── Fix Templates by Category ────────────────────────────────────────────────

const FIX_TEMPLATES: Record<string, CodePatch> = {
  sql_injection: {
    description: "Replace dynamic SQL with parameterized queries",
    steps: [
      "Identify all dynamic SQL string concatenation",
      "Replace with parameterized query using $1, $2 placeholders",
      "Validate inputs with Zod schema before query execution",
    ],
    codeExample: `// BEFORE (vulnerable)
const result = await db.query(\`SELECT * FROM users WHERE id = '\${userId}'\`);

// AFTER (safe)
const result = await db.query("SELECT * FROM users WHERE id = $1", [userId]);`,
    confidence: 0.95,
    automated: false,
    testRequired: true,
    references: ["https://owasp.org/www-community/attacks/SQL_Injection"],
  },

  hardcoded_secret: {
    description: "Remove hardcoded secret and load from environment variable",
    steps: [
      "Remove hardcoded secret from source code",
      "Add secret to .env.local (gitignored)",
      "Add variable to .env.local.example with placeholder",
      "Load via process.env.SECRET_NAME",
      "Add runtime validation to throw if missing in production",
    ],
    codeExample: `// BEFORE (vulnerable) — never embed secrets in source
// const key = process.env.API_KEY ?? ""; // always use env vars

// AFTER (safe)
const apiKey = process.env.API_KEY;
if (!apiKey && process.env.NODE_ENV === "production") {
  throw new Error("Missing API_KEY environment variable");
}`,
    confidence: 0.98,
    automated: false,
    testRequired: false,
    references: ["https://12factor.net/config"],
  },

  missing_type_hint: {
    description: "Add explicit TypeScript type annotation",
    steps: [
      "Identify the inferred type",
      "Add explicit type annotation to parameter/variable",
      "Replace any with specific interface or union type",
    ],
    codeExample: `// BEFORE
function process(data: any) { ... }

// AFTER
function process(data: ProcessRequest) { ... }`,
    confidence: 0.92,
    automated: true,
    testRequired: false,
  },

  xss: {
    description: "Add output encoding / use safe React rendering",
    steps: [
      "Never use dangerouslySetInnerHTML with untrusted content",
      "Use React's default JSX rendering (auto-escapes HTML)",
      "Sanitize with DOMPurify if HTML rendering is required",
      "Set strict Content-Security-Policy headers",
    ],
    codeExample: `// BEFORE (vulnerable)
<div dangerouslySetInnerHTML={{ __html: userContent }} />

// AFTER (safe)
<div>{userContent}</div>
// Or with sanitization:
import DOMPurify from "dompurify";
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userContent) }} />`,
    confidence: 0.88,
    automated: false,
    testRequired: true,
    references: ["https://owasp.org/www-community/attacks/xss/"],
  },

  csrf: {
    description: "Implement CSRF protection via SameSite cookies and tokens",
    steps: [
      "Set cookie SameSite=strict attribute",
      "Add CSRF token validation for state-changing operations",
      "Verify Origin/Referer headers for cross-origin requests",
    ],
    codeExample: `// Cookie configuration
{
  httpOnly: true,
  secure: true,
  sameSite: "strict",  // Prevents CSRF
  path: "/",
}`,
    confidence: 0.9,
    automated: false,
    testRequired: true,
  },

  missing_rate_limit: {
    description: "Add rate limiting to the endpoint",
    steps: [
      "Import rateLimit from @/lib/rateLimit",
      "Add rate limit check at top of route handler",
      "Return 429 Too Many Requests if limit exceeded",
    ],
    codeExample: `import { checkRateLimit } from "@/lib/rateLimit";

export async function POST(req: Request) {
  const rateLimitResult = await checkRateLimit(req);
  if (!rateLimitResult.allowed) {
    return new Response("Too Many Requests", { status: 429 });
  }
  // ... rest of handler
}`,
    confidence: 0.87,
    automated: false,
    testRequired: true,
  },

  ssrf: {
    description: "Validate and restrict external URLs to prevent SSRF",
    steps: [
      "Import validateUrl from @/lib/ssrf",
      "Validate all user-supplied URLs before fetching",
      "Blocklist private IP ranges (10.x, 172.x, 192.168.x, 127.x)",
      "Use safeFetch wrapper instead of native fetch",
    ],
    codeExample: `import { safeFetch } from "@/lib/safeFetch";
import { validateUrl } from "@/lib/ssrf";

// Validate before fetching
const validation = validateUrl(userSuppliedUrl);
if (!validation.valid) {
  return new Response("Invalid URL", { status: 400 });
}
const response = await safeFetch(userSuppliedUrl);`,
    confidence: 0.93,
    automated: false,
    testRequired: true,
  },
};

function matchTemplate(finding: Finding): CodePatch | null {
  const text = `${finding.category} ${finding.title ?? ""} ${finding.description ?? ""}`.toLowerCase();

  if (text.includes("sql") && (text.includes("inject") || text.includes("query"))) {
    return FIX_TEMPLATES["sql_injection"] ?? null;
  }
  if (text.includes("hardcoded") && (text.includes("secret") || text.includes("key") || text.includes("password"))) {
    return FIX_TEMPLATES["hardcoded_secret"] ?? null;
  }
  if (text.includes("xss") || text.includes("cross-site scripting")) {
    return FIX_TEMPLATES["xss"] ?? null;
  }
  if (text.includes("csrf") || (text.includes("samesite") && text.includes("cookie"))) {
    return FIX_TEMPLATES["csrf"] ?? null;
  }
  if (text.includes("rate limit") || text.includes("rate-limit")) {
    return FIX_TEMPLATES["missing_rate_limit"] ?? null;
  }
  if (text.includes("ssrf")) {
    return FIX_TEMPLATES["ssrf"] ?? null;
  }
  if (text.includes("any type") || text.includes("missing type")) {
    return FIX_TEMPLATES["missing_type_hint"] ?? null;
  }

  return null;
}

async function generateGeminiFix(finding: Finding): Promise<CodePatch | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `You are a senior security engineer. Generate a concise fix for this security finding.

Finding:
- ID: ${finding.id}
- Severity: ${finding.severity}
- Category: ${finding.category}
- Title: ${finding.title ?? "unknown"}
- Location: ${finding.location}
- Description: ${finding.description ?? "none"}

Provide a practical, TypeScript-focused fix. Respond ONLY with JSON:
{
  "description": "one-line fix description",
  "steps": ["step 1", "step 2", "step 3"],
  "codeExample": "// optional before/after code snippet",
  "confidence": 0.0-1.0,
  "automated": boolean,
  "testRequired": boolean
}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { responseMimeType: "application/json", temperature: 0.2 },
    });

    if (!response.text) return null;
    return JSON.parse(response.text) as CodePatch;
  } catch {
    return null;
  }
}

export async function generateFix(finding: Finding): Promise<CodePatch | null> {
  // Try template match first (fastest + most reliable)
  const template = matchTemplate(finding);
  if (template && template.confidence >= 0.85) {
    return template;
  }

  // Try Gemini for complex/novel findings
  const geminiFix = await generateGeminiFix(finding);
  if (geminiFix && geminiFix.confidence >= 0.7) {
    return geminiFix;
  }

  return template; // Return template even if low confidence
}

export function isAutoApplicable(patch: CodePatch): boolean {
  return patch.automated && patch.confidence >= 0.9 && !patch.testRequired;
}

export function getRemediationPriority(
  finding: Finding,
): "IMMEDIATE" | "SPRINT" | "BACKLOG" {
  const severityMap: Record<Severity, "IMMEDIATE" | "SPRINT" | "BACKLOG"> = {
    P0: "IMMEDIATE",
    P1: "SPRINT",
    P2: "BACKLOG",
  };
  return severityMap[finding.severity];
}
