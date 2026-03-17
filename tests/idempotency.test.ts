import { describe, expect, it } from "vitest";

import {
  acquireIdempotencyLock,
  buildIdempotencyScopeKey,
  getIdempotencyKeyFromRequest,
  loadIdempotentResponse,
  releaseIdempotencyLock,
  storeIdempotentResponse,
} from "@/lib/idempotency";
import { getRuntimeStateAdapter } from "@/lib/runtime-state";
import { resetMemoryRuntimeStateForTests } from "@/lib/runtime-state/memory";

describe("idempotency store", () => {
  it("stores and replays responses by scope key", async () => {
    resetMemoryRuntimeStateForTests();
    const scope = buildIdempotencyScopeKey({
      route: "api.process",
      workspaceId: "w1",
      userId: "u1",
      key: "abc-123",
    });

    await storeIdempotentResponse(scope, {
      status: 202,
      body: { ok: true, requestId: "r1" },
      storedAt: new Date().toISOString(),
    });

    const loaded = await loadIdempotentResponse(scope);
    expect(loaded).not.toBeNull();
    expect(loaded?.status).toBe(202);
    expect(loaded?.body).toEqual({ ok: true, requestId: "r1" });
  });

  it("prevents duplicate in-flight requests using lock", async () => {
    resetMemoryRuntimeStateForTests();
    const scope = buildIdempotencyScopeKey({
      route: "api.integrations.execute",
      workspaceId: "w1",
      userId: "u1",
      key: "dup-key",
    });

    expect(await acquireIdempotencyLock(scope)).toBe(true);
    expect(await acquireIdempotencyLock(scope)).toBe(false);
    await releaseIdempotencyLock(scope);
    expect(await acquireIdempotencyLock(scope)).toBe(true);
  });
});

// Key-extraction and boundary tests — kill L17-L22 mutants
describe("getIdempotencyKeyFromRequest", () => {
  function reqWithKey(key: string | null): Request {
    const headers: Record<string, string> = {};
    if (key !== null) {
      headers["idempotency-key"] = key;
    }
    return new Request("https://example.com", { headers });
  }

  it("returns null when header is absent", () => {
    expect(getIdempotencyKeyFromRequest(reqWithKey(null))).toBeNull();
  });

  it("returns null for empty header value", () => {
    expect(getIdempotencyKeyFromRequest(reqWithKey(""))).toBeNull();
  });

  it("returns null when key is exactly 3 chars (below min)", () => {
    expect(getIdempotencyKeyFromRequest(reqWithKey("abc"))).toBeNull();
  });

  it("returns key when length is exactly 4 chars (min boundary)", () => {
    expect(getIdempotencyKeyFromRequest(reqWithKey("abcd"))).toBe("abcd");
  });

  it("returns key when length is exactly 128 chars (max boundary)", () => {
    const key = "a".repeat(128);
    expect(getIdempotencyKeyFromRequest(reqWithKey(key))).toBe(key);
  });

  it("returns null when key is exactly 129 chars (above max)", () => {
    const key = "a".repeat(129);
    expect(getIdempotencyKeyFromRequest(reqWithKey(key))).toBeNull();
  });

  it("trims leading/trailing whitespace from the key header", () => {
    expect(getIdempotencyKeyFromRequest(reqWithKey("  abcd  "))).toBe("abcd");
  });
});

// sanitizeSegment and buildIdempotencyScopeKey — kill L13-L14 mutants
describe("buildIdempotencyScopeKey sanitization", () => {
  it("sanitizes special characters in all segments", () => {
    const key = buildIdempotencyScopeKey({
      route: "api/process",
      workspaceId: "ws 1!",
      userId: "u@1",
      key: "key#1",
    });
    expect(key).toMatch(/^idem:/);
    expect(key).not.toMatch(/[/!@ #]/);
  });

  it("preserves alphanumeric, colons, hyphens, underscores", () => {
    // Note: dots are NOT in the allowlist [a-zA-Z0-9:_-] → replaced with _
    const key = buildIdempotencyScopeKey({
      route: "api.process",
      workspaceId: "ws-1",
      userId: "u_1",
      key: "k:1",
    });
    expect(key).toBe("idem:api_process:ws-1:u_1:k:1");
  });

  it("produces different scope keys for different users", () => {
    const a = buildIdempotencyScopeKey({ route: "r", workspaceId: "w", userId: "u1", key: "k" });
    const b = buildIdempotencyScopeKey({ route: "r", workspaceId: "w", userId: "u2", key: "k" });
    expect(a).not.toBe(b);
  });
});

// loadIdempotentResponse edge cases — kill L33-L34 parse mutants
describe("loadIdempotentResponse edge cases", () => {
  it("returns null for scope with nothing stored", async () => {
    resetMemoryRuntimeStateForTests();
    const scope = buildIdempotencyScopeKey({
      route: "r",
      workspaceId: "w",
      userId: "u",
      key: "miss",
    });
    expect(await loadIdempotentResponse(scope)).toBeNull();
  });

  it("returns null when stored value is invalid JSON", async () => {
    resetMemoryRuntimeStateForTests();
    await getRuntimeStateAdapter().set("idem:r:w:u:bad:response", "{not json}", 3600);
    expect(await loadIdempotentResponse("idem:r:w:u:bad")).toBeNull();
  });

  it("returns null when stored JSON is missing required fields", async () => {
    resetMemoryRuntimeStateForTests();
    await getRuntimeStateAdapter().set(
      "idem:r:w:u:partial:response",
      JSON.stringify({ status: 200 }),
      3600,
    );
    expect(await loadIdempotentResponse("idem:r:w:u:partial")).toBeNull();
  });

  it("returns null when stored JSON is missing storedAt (kills L53 LogicalOperator &&→||)", async () => {
    // Original: status is number && storedAt is string && body !== undefined (all required)
    // If storedAt missing: typeof undefined !== "string" = true → ||: true → null
    // Mutant &&→||: only null when ALL conditions true simultaneously (impossible for valid data)
    // So valid-but-no-storedAt would pass with && mutant → test kills it
    resetMemoryRuntimeStateForTests();
    await getRuntimeStateAdapter().set(
      "idem:r:w:u:notime:response",
      JSON.stringify({ status: 200, body: { ok: true } }),
      3600,
    );
    expect(await loadIdempotentResponse("idem:r:w:u:notime")).toBeNull();
  });

  it("returns parsed response with all required fields present", async () => {
    // Positive case: ensures ConditionalExpression → true mutant on L53 is killed
    // (mutant always returns null even for valid data)
    resetMemoryRuntimeStateForTests();
    const scope = buildIdempotencyScopeKey({ route: "r", workspaceId: "w", userId: "u", key: "full" });
    await storeIdempotentResponse(scope, {
      status: 201,
      body: { result: "done" },
      storedAt: new Date().toISOString(),
    });
    const loaded = await loadIdempotentResponse(scope);
    expect(loaded).not.toBeNull();
    expect(loaded?.status).toBe(201);
    expect(loaded?.body).toEqual({ result: "done" });
  });
});
