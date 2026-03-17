import { describe, expect, it } from "vitest";

import { checkRateLimit, getClientIp, resetRateLimiterForTests } from "@/lib/rateLimit";

describe("rate limiting", () => {
  it("enforces burst window", async () => {
    resetRateLimiterForTests();
    const key = "client-a";
    expect((await checkRateLimit(key, 20, 2)).allowed).toBe(true);
    expect((await checkRateLimit(key, 20, 2)).allowed).toBe(true);
    const blocked = await checkRateLimit(key, 20, 2);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe("burst_limit");
  });
});

describe("getClientIp", () => {
  function req(headers: Record<string, string>): Request {
    return new Request("https://example.com", { headers });
  }

  it("returns trimmed first segment from x-forwarded-for", () => {
    expect(getClientIp(req({ "x-forwarded-for": "1.2.3.4" }))).toBe("1.2.3.4");
  });

  it("returns first segment when x-forwarded-for has multiple IPs", () => {
    expect(getClientIp(req({ "x-forwarded-for": "1.2.3.4, 10.0.0.1, 172.16.0.1" }))).toBe(
      "1.2.3.4",
    );
  });

  it("trims whitespace from the first x-forwarded-for segment", () => {
    expect(getClientIp(req({ "x-forwarded-for": "  1.2.3.4  , 10.0.0.1" }))).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    expect(getClientIp(req({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
  });

  it("returns unknown when no relevant headers present", () => {
    expect(getClientIp(req({}))).toBe("unknown");
  });

  it("prefers x-forwarded-for over x-real-ip", () => {
    expect(
      getClientIp(req({ "x-forwarded-for": "1.2.3.4", "x-real-ip": "9.9.9.9" })),
    ).toBe("1.2.3.4");
  });
});
