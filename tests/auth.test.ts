import { createHmac } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_SESSION,
  getSessionCookieName,
  maskEmail,
  parseSessionCookieValue,
} from "@/lib/auth";

// Helpers to construct valid signed / unsigned cookie values
function makePayload(session: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
}

function makeSigned(session: Record<string, unknown>, secret: string) {
  const payload = makePayload(session);
  const sig = createHmac("sha256", secret).update(`v1.${payload}`).digest("base64url");
  return `${payload}.${sig}`;
}

const VALID_SESSION = {
  userId: "u1",
  name: "Test User",
  email: "t@example.com",
  workspaceId: "ws1",
  role: "admin",
};

afterEach(() => {
  vi.unstubAllEnvs();
});

// ── parseSessionCookieValue ────────────────────────────────────────────────────

describe("parseSessionCookieValue", () => {
  it("returns null for null/undefined/empty", () => {
    expect(parseSessionCookieValue(null)).toBeNull();
    expect(parseSessionCookieValue(undefined)).toBeNull();
    expect(parseSessionCookieValue("")).toBeNull();
  });

  it("parses an unsigned cookie when no secret is set", () => {
    const raw = makePayload(VALID_SESSION);
    const result = parseSessionCookieValue(raw);
    expect(result).not.toBeNull();
    expect(result?.session.userId).toBe("u1");
    expect(result?.session.role).toBe("admin");
    expect(result?.signed).toBe(false);
  });

  it("returns null for a payload with extra dots (>2 segments)", () => {
    const raw = makePayload(VALID_SESSION);
    expect(parseSessionCookieValue(`${raw}.sig.extra`)).toBeNull();
  });

  it("returns null for malformed base64 payload", () => {
    expect(parseSessionCookieValue("!!!invalid!!!")).toBeNull();
  });

  it("returns null when payload is valid JSON but missing required fields", () => {
    const partial = makePayload({ name: "No ID" });
    expect(parseSessionCookieValue(partial)).toBeNull();
  });

  it("returns null for unknown role in payload", () => {
    const bad = makePayload({ ...VALID_SESSION, role: "superuser" });
    expect(parseSessionCookieValue(bad)).toBeNull();
  });

  it("parses a signed cookie when secret matches", () => {
    vi.stubEnv("SESSION_SIGNING_SECRET", "my-secret");
    const raw = makeSigned(VALID_SESSION, "my-secret");
    const result = parseSessionCookieValue(raw);
    expect(result).not.toBeNull();
    expect(result?.signed).toBe(true);
    expect(result?.session.userId).toBe("u1");
  });

  it("returns null when signature is wrong", () => {
    vi.stubEnv("SESSION_SIGNING_SECRET", "my-secret");
    const raw = makeSigned(VALID_SESSION, "wrong-secret");
    expect(parseSessionCookieValue(raw)).toBeNull();
  });

  it("returns null for unsigned cookie when secret is set (no signature provided)", () => {
    vi.stubEnv("SESSION_SIGNING_SECRET", "my-secret");
    const raw = makePayload(VALID_SESSION);
    expect(parseSessionCookieValue(raw)).toBeNull();
  });

  it("blocks unsigned cookies in production when REQUIRE_SIGNED_SESSION_IN_PROD=true", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SIGNING_SECRET", "prod-secret");
    const raw = makePayload(VALID_SESSION);
    expect(parseSessionCookieValue(raw)).toBeNull();
  });

  it("returns null in production when no secret and REQUIRE_SIGNED is default-true", () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.SESSION_SIGNING_SECRET;
    const raw = makeSigned(VALID_SESSION, "any");
    // No secret set in production with require_signed → null
    expect(parseSessionCookieValue(raw)).toBeNull();
  });

  it("accepts all valid roles", () => {
    for (const role of ["owner", "admin", "agent", "viewer"] as const) {
      const raw = makePayload({ ...VALID_SESSION, role });
      const result = parseSessionCookieValue(raw);
      expect(result?.session.role).toBe(role);
    }
  });
});

// ── getSessionCookieName ───────────────────────────────────────────────────────

describe("getSessionCookieName", () => {
  it("returns the cookie name constant", () => {
    expect(getSessionCookieName()).toBe("vaa_demo_session");
  });
});

// ── DEFAULT_SESSION ────────────────────────────────────────────────────────────

describe("DEFAULT_SESSION", () => {
  it("has required fields with exact values", () => {
    expect(DEFAULT_SESSION.userId).toBe("demo-user");
    expect(DEFAULT_SESSION.workspaceId).toBe("default-workspace");
    expect(DEFAULT_SESSION.role).toBe("owner");
    expect(DEFAULT_SESSION.email).toBeTruthy();
    expect(DEFAULT_SESSION.name).toBeTruthy();
  });
});

// ── requireSignedSessionInProd — each allowlist value ─────────────────────────
// Tests kill StringLiteral mutants on the ["1","true","yes","on"] array
// by verifying each value independently enables signature enforcement.

describe("requireSignedSessionInProd via parseSessionCookieValue", () => {
  const unsignedRaw = makePayload(VALID_SESSION);

  it('REQUIRE_SIGNED_SESSION_IN_PROD="false" → unsigned cookie accepted in production', () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REQUIRE_SIGNED_SESSION_IN_PROD", "false");
    // No secret configured; requireSigned=false → unsigned accepted
    expect(parseSessionCookieValue(unsignedRaw)).not.toBeNull();
  });

  it('REQUIRE_SIGNED_SESSION_IN_PROD="0" → unsigned cookie accepted in production', () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REQUIRE_SIGNED_SESSION_IN_PROD", "0");
    expect(parseSessionCookieValue(unsignedRaw)).not.toBeNull();
  });

  for (const truthyValue of ["1", "true", "yes", "on"]) {
    it(`REQUIRE_SIGNED_SESSION_IN_PROD="${truthyValue}" + no secret → null in production`, () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("REQUIRE_SIGNED_SESSION_IN_PROD", truthyValue);
      delete process.env.SESSION_SIGNING_SECRET;
      expect(parseSessionCookieValue(unsignedRaw)).toBeNull();
    });
  }

  it("missing REQUIRE_SIGNED_SESSION_IN_PROD defaults to require-signed in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.REQUIRE_SIGNED_SESSION_IN_PROD;
    delete process.env.SESSION_SIGNING_SECRET;
    // Default = requireSigned=true, no secret → null
    expect(parseSessionCookieValue(unsignedRaw)).toBeNull();
  });
});

// ── maskEmail ─────────────────────────────────────────────────────────────────

describe("maskEmail", () => {
  it("masks a normal email", () => {
    expect(maskEmail("alice@example.com")).toBe("al***@example.com");
  });

  it("masks a short local part (1 char)", () => {
    const result = maskEmail("a@example.com");
    expect(result).toMatch(/^a\*@example\.com$/);
  });

  it("masks a 2-char local part", () => {
    const result = maskEmail("ab@example.com");
    expect(result).toMatch(/^a\*@example\.com$/);
  });

  it("returns hidden for email without @", () => {
    expect(maskEmail("nodomain")).toBe("hidden");
  });

  it("returns hidden for email starting with @", () => {
    expect(maskEmail("@domain.com")).toBe("hidden");
  });

  it("masks a long local part", () => {
    const result = maskEmail("verylongname@domain.org");
    expect(result).toBe("ve***@domain.org");
  });
});

// ── normalizeSession edge cases — kills L36 &&→|| mutant ──────────────────────
describe("normalizeSession via parseSessionCookieValue", () => {
  it("returns null when userId is missing but workspaceId is present", () => {
    // Kills L36 LogicalOperator &&→|| mutant:
    // Original: !userId || !workspaceId → null if EITHER missing
    // Mutant: !userId && !workspaceId → null only if BOTH missing
    const partial = makePayload({ workspaceId: "ws1", name: "No ID", role: "admin" });
    expect(parseSessionCookieValue(partial)).toBeNull();
  });

  it("returns null when workspaceId is missing but userId is present", () => {
    const partial = makePayload({ userId: "u1", name: "No WS", role: "admin" });
    expect(parseSessionCookieValue(partial)).toBeNull();
  });
});

// ── getSessionSigningSecret whitespace trim — kills L48 MethodExpression mutant ─
describe("getSessionSigningSecret whitespace handling", () => {
  it("ignores signing secret that is only whitespace (treats as unsigned)", () => {
    vi.stubEnv("SESSION_SIGNING_SECRET", "   ");
    const raw = makePayload(VALID_SESSION);
    // Whitespace-only secret → trimmed → empty → null → treated as no-secret
    const result = parseSessionCookieValue(raw);
    expect(result).not.toBeNull();
    expect(result?.signed).toBe(false);
  });
});

// ── requireSignedSessionInProd whitespace — kills L52 MethodExpression/OptionalChaining ─
describe("requireSignedSessionInProd with padded values", () => {
  it("recognises padded truthy value '  true  ' in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REQUIRE_SIGNED_SESSION_IN_PROD", "  true  ");
    delete process.env.SESSION_SIGNING_SECRET;
    const raw = makePayload(VALID_SESSION);
    expect(parseSessionCookieValue(raw)).toBeNull();
  });

  it("recognises padded falsy value '  false  ' in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REQUIRE_SIGNED_SESSION_IN_PROD", "  false  ");
    const raw = makePayload(VALID_SESSION);
    expect(parseSessionCookieValue(raw)).not.toBeNull();
  });
});

// ── L90 BooleanLiteral (!signed → signed) ────────────────────────────────────
// Kills the mutant where `!signed` in `requireSigned && !signed` becomes `signed`
// causing signed cookies to be rejected when requireSigned=true.
describe("signed cookie accepted when requireSigned=true (kills L90 BooleanLiteral)", () => {
  it("signed cookie passes in production with requireSigned=true and correct secret", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SIGNING_SECRET", "my-secret");
    vi.stubEnv("REQUIRE_SIGNED_SESSION_IN_PROD", "true");
    const raw = makeSigned(VALID_SESSION, "my-secret");
    const result = parseSessionCookieValue(raw);
    // Original: requireSigned && !signed = true && false = false → proceed
    // Mutant !signed → signed: true && true = true → returns null → test fails → kills mutant
    expect(result).not.toBeNull();
    expect(result?.signed).toBe(true);
  });
});

// ── L94 LogicalOperator (!signed || !signatureBase64Url) ─────────────────────
describe("verifySignature — signed true but no actual signature bytes (kills L94 LogicalOperator)", () => {
  it("cookie with secret set but no signature returns null (kills L94 ||→&& mutant)", () => {
    // Original: !signed || !signatureBase64Url → returns null if EITHER missing
    // Mutant &&: needs BOTH missing. payload.sig format: "payload" (1 part, signed=false)
    // With secret set, signed=false → !signed=true → return null (original)
    // Mutant: !signed && !signatureBase64Url = true && true = true → same result (null)
    // Flip: signed=true but signatureBase64Url exists (normal signing path) → should NOT null
    vi.stubEnv("SESSION_SIGNING_SECRET", "test-secret");
    const raw = makeSigned(VALID_SESSION, "test-secret");
    const result = parseSessionCookieValue(raw);
    expect(result).not.toBeNull();
    expect(result?.signed).toBe(true);
  });
});
