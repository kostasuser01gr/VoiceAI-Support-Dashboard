import { describe, expect, it, vi } from "vitest";

import {
  applySecurityHeaders,
  isMutatingMethod,
  isSameOriginRequest,
} from "@/lib/http-security";

describe("http security", () => {
  it("detects mutating methods", () => {
    expect(isMutatingMethod("POST")).toBe(true);
    expect(isMutatingMethod("delete")).toBe(true);
    expect(isMutatingMethod("GET")).toBe(false);
  });

  it("accepts same-origin requests and known allowlist origins", () => {
    vi.stubEnv("APP_BASE_URL", "https://chatgpt-ops.web.app");
    vi.stubEnv("CSRF_ALLOWED_ORIGINS", "https://chatgpt-ops.web.app,https://example.org");

    expect(
      isSameOriginRequest({
        originHeader: "https://chatgpt-ops.web.app",
        hostHeader: "voice-to-action-agent-zbluqfbniq-ew.a.run.app",
        forwardedHostHeader: "voice-to-action-agent-zbluqfbniq-ew.a.run.app",
        forwardedProtoHeader: "https",
      }),
    ).toBe(true);

    expect(
      isSameOriginRequest({
        originHeader: "https://voice-to-action-agent-zbluqfbniq-ew.a.run.app",
        hostHeader: "voice-to-action-agent-zbluqfbniq-ew.a.run.app",
        forwardedHostHeader: "voice-to-action-agent-zbluqfbniq-ew.a.run.app",
        forwardedProtoHeader: "https",
      }),
    ).toBe(true);

    vi.unstubAllEnvs();
  });

  it("blocks invalid or mismatched origins", () => {
    expect(
      isSameOriginRequest({
        originHeader: "not-a-url",
        hostHeader: "voice-to-action-agent-zbluqfbniq-ew.a.run.app",
        forwardedHostHeader: null,
        forwardedProtoHeader: "https",
      }),
    ).toBe(false);

    expect(
      isSameOriginRequest({
        originHeader: "https://evil.example",
        hostHeader: "voice-to-action-agent-zbluqfbniq-ew.a.run.app",
        forwardedHostHeader: "voice-to-action-agent-zbluqfbniq-ew.a.run.app",
        forwardedProtoHeader: "https",
      }),
    ).toBe(false);
  });

  it("sets baseline security headers", () => {
    const headers = new Headers();
    applySecurityHeaders(headers);

    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("x-frame-options")).toBe("DENY");
    expect(headers.get("referrer-policy")).toBe("same-origin");
    expect(headers.get("permissions-policy")).toContain("camera=()");
    expect(headers.get("content-security-policy")).toContain("default-src 'self'");
  });
});
