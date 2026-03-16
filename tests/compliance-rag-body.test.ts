import { describe, expect, it } from "vitest";

import { redactPiiText, sanitizeForRetention } from "@/lib/compliance";
import { retrieveContext } from "@/lib/rag";
import {
  JsonBodyParseError,
  JsonBodyTooLargeError,
  readJsonBodyWithLimit,
} from "@/lib/request-body";

// ── redactPiiText ──────────────────────────────────────────────────────────────

describe("redactPiiText", () => {
  it("redacts emails", () => {
    const result = redactPiiText("Contact bob@example.com for help");
    expect(result.output).toContain("[REDACTED_EMAIL]");
    expect(result.redactions).toBeGreaterThanOrEqual(1);
  });

  it("redacts phone numbers", () => {
    const result = redactPiiText("Call 555-123-4567 now");
    expect(result.output).toContain("[REDACTED_PHONE]");
    expect(result.redactions).toBeGreaterThanOrEqual(1);
  });

  it("redacts credit cards", () => {
    const result = redactPiiText("Card number 4111111111111111 was used");
    expect(result.output).toContain("[REDACTED_CREDIT_CARD]");
    expect(result.redactions).toBeGreaterThanOrEqual(1);
  });

  it("redacts SSNs", () => {
    const result = redactPiiText("SSN 123-45-6789");
    expect(result.output).toContain("[REDACTED_SSN]");
    expect(result.redactions).toBeGreaterThanOrEqual(1);
  });

  it("returns 0 redactions for clean text", () => {
    const result = redactPiiText("No PII here at all");
    expect(result.redactions).toBe(0);
    expect(result.output).toBe("No PII here at all");
  });

  it("redacts multiple items in one string", () => {
    const result = redactPiiText("Email: a@b.com, phone: 555-000-1234");
    expect(result.redactions).toBeGreaterThanOrEqual(2);
  });
});

// ── sanitizeForRetention ───────────────────────────────────────────────────────

describe("sanitizeForRetention", () => {
  it("truncates at maxChars", () => {
    const result = sanitizeForRetention("a".repeat(3000));
    expect(result.length).toBeLessThanOrEqual(2000);
  });

  it("respects a custom maxChars", () => {
    const result = sanitizeForRetention("hello world", 5);
    expect(result).toBe("hello");
  });

  it("trims whitespace", () => {
    const result = sanitizeForRetention("  hello  ");
    expect(result).toBe("hello");
  });
});

// ── retrieveContext ────────────────────────────────────────────────────────────

describe("retrieveContext", () => {
  it("returns password/login playbook for relevant transcript", () => {
    const result = retrieveContext("user cannot login after password reset");
    expect(result).toMatch(/Password resets/i);
  });

  it("returns refund playbook for charge-related transcript", () => {
    const result = retrieveContext("customer wants a refund on the charge");
    expect(result).toMatch(/Refunds/i);
  });

  it("returns bug/incident info for crash-related transcript", () => {
    const result = retrieveContext("app crash and error on login");
    expect(result).toMatch(/INC-/i);
  });

  it("returns VIP treatment for enterprise transcript", () => {
    const result = retrieveContext("enterprise vip customer complaint");
    expect(result).toMatch(/Enterprise Tier/i);
  });

  it("returns empty string for unrelated transcript", () => {
    const result = retrieveContext("general inquiry about shipping");
    expect(result).toBe("");
  });

  it("combines multiple context chunks", () => {
    const result = retrieveContext("vip user has login error");
    expect(result).toMatch(/Enterprise Tier/i);
    expect(result).toMatch(/INC-/i);
  });
});

// ── readJsonBodyWithLimit ──────────────────────────────────────────────────────

describe("readJsonBodyWithLimit", () => {
  it("parses valid JSON within limit", async () => {
    const req = new Request("https://example.com", {
      method: "POST",
      body: JSON.stringify({ hello: "world" }),
    });
    const result = await readJsonBodyWithLimit(req, 10_000);
    expect(result).toEqual({ hello: "world" });
  });

  it("throws JsonBodyTooLargeError when body exceeds limit", async () => {
    const req = new Request("https://example.com", {
      method: "POST",
      body: "x".repeat(100),
    });
    await expect(readJsonBodyWithLimit(req, 10)).rejects.toThrow(JsonBodyTooLargeError);
  });

  it("throws JsonBodyParseError for invalid JSON", async () => {
    const req = new Request("https://example.com", {
      method: "POST",
      body: "not-json",
    });
    await expect(readJsonBodyWithLimit(req, 10_000)).rejects.toThrow(JsonBodyParseError);
  });

  it("JsonBodyTooLargeError carries maxBytes", async () => {
    const req = new Request("https://example.com", {
      method: "POST",
      body: "x".repeat(100),
    });
    try {
      await readJsonBodyWithLimit(req, 10);
    } catch (e) {
      expect(e).toBeInstanceOf(JsonBodyTooLargeError);
      expect((e as JsonBodyTooLargeError).maxBytes).toBe(10);
    }
  });
});
