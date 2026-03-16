import { describe, expect, it } from "vitest";

import type { SessionData, SessionRole } from "@/lib/auth";
import { ensureRole, forbiddenResponse, hasRole } from "@/lib/rbac";

function makeSession(role: SessionRole): SessionData {
  return {
    userId: "u1",
    name: "Test",
    email: "t@example.com",
    workspaceId: "ws1",
    role,
  };
}

// ── hasRole ────────────────────────────────────────────────────────────────────

describe("hasRole", () => {
  it("owner satisfies all roles", () => {
    for (const r of ["owner", "admin", "agent", "viewer"] as const) {
      expect(hasRole("owner", [r])).toBe(true);
    }
  });

  it("viewer only satisfies viewer", () => {
    expect(hasRole("viewer", ["viewer"])).toBe(true);
    expect(hasRole("viewer", ["agent"])).toBe(false);
    expect(hasRole("viewer", ["admin"])).toBe(false);
    expect(hasRole("viewer", ["owner"])).toBe(false);
  });

  it("agent satisfies agent + viewer", () => {
    expect(hasRole("agent", ["viewer"])).toBe(true);
    expect(hasRole("agent", ["agent"])).toBe(true);
    expect(hasRole("agent", ["admin"])).toBe(false);
  });

  it("admin satisfies admin + agent + viewer", () => {
    expect(hasRole("admin", ["admin", "owner"])).toBe(true);
    expect(hasRole("admin", ["owner"])).toBe(false);
  });

  it("accepts a multi-role array — passes if any is satisfied", () => {
    expect(hasRole("agent", ["admin", "agent"])).toBe(true);
    expect(hasRole("viewer", ["admin", "owner"])).toBe(false);
  });
});

// ── forbiddenResponse ──────────────────────────────────────────────────────────

describe("forbiddenResponse", () => {
  it("returns 403 with default code", async () => {
    const resp = forbiddenResponse("req-1");
    expect(resp.status).toBe(403);
    const body = (await resp.json()) as { error: { code: string; detailsCode: string } };
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.detailsCode).toBe("RBAC_FORBIDDEN");
  });

  it("returns 403 with custom detailsCode", async () => {
    const resp = forbiddenResponse("req-2", "CUSTOM_CODE");
    const body = (await resp.json()) as { error: { detailsCode: string } };
    expect(body.error.detailsCode).toBe("CUSTOM_CODE");
  });
});

// ── ensureRole ─────────────────────────────────────────────────────────────────

describe("ensureRole", () => {
  it("returns null when session has sufficient role", () => {
    expect(ensureRole(makeSession("admin"), ["admin", "owner"], "req-3")).toBeNull();
  });

  it("returns 403 NextResponse when role is insufficient", async () => {
    const resp = ensureRole(makeSession("viewer"), ["admin"], "req-4");
    expect(resp).not.toBeNull();
    expect(resp?.status).toBe(403);
  });

  it("propagates custom detailsCode through forbiddenResponse", async () => {
    const resp = ensureRole(makeSession("viewer"), ["owner"], "req-5", "WRITE_FORBIDDEN");
    const body = (await resp?.json()) as { error: { detailsCode: string } };
    expect(body.error.detailsCode).toBe("WRITE_FORBIDDEN");
  });
});
