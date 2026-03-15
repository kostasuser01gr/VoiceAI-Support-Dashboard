import { beforeEach, describe, expect, it } from "vitest";

import { POST, processPayload } from "@/app/api/process/route";
import { GeminiConfigError } from "@/lib/gemini";
import { resetRateLimiterForTests } from "@/lib/rateLimit";
import { resetSecurityShieldForTests } from "@/lib/securityShield";

describe("processPayload", () => {
  beforeEach(() => {
    resetRateLimiterForTests();
    resetSecurityShieldForTests();
    delete process.env.DEMO_SAFE_MODE;
  });

  it("returns success payload with required meta and steps", async () => {
    const response = await processPayload(
      {
        inputMode: "text",
        text: "Please send weekly update to team.",
        presetId: "support_recap",
      },
      {
        requestId: "req-1",
        now: () => "2026-03-02T10:00:00.000Z",
        nowMs: (() => {
          let tick = 1000;
          return () => {
            tick += 10;
            return tick;
          };
        })(),
        generateStructuredResponse: async ({ inputMode, transcript, requestId }) => ({
          output: {
            inputMode,
            transcript,
            summary: "Weekly update is requested and should be sent.",
            actions: {
              taskList: ["Send weekly update to team"],
              emailDraft:
                "Subject: Weekly Update\n\nSharing weekly update details.\n\nPlease review before sending.",
            },
            intelligence: { topics: [], entities: [], urgency: "low", sentiment: "neutral", openLoops: [] },
            auditTrail: [
              {
                step: "capture",
                timestamp: "2026-03-02T10:00:00.000Z",
                details: "Captured",
              },
              {
                step: "transcribe",
                timestamp: "2026-03-02T10:00:00.000Z",
                details: "Transcribed",
              },
              {
                step: "extract",
                timestamp: "2026-03-02T10:00:00.000Z",
                details: "Extracted",
              },
              {
                step: "draft",
                timestamp: "2026-03-02T10:00:00.000Z",
                details: "Drafted",
              },
              {
                step: "safety_check",
                timestamp: "2026-03-02T10:00:00.000Z",
                details: "Checked",
              },
            ],
            meta: {
              requestId,
              model: "gemini-2.0-flash",
              latencyMs: 1,
              validation: "passed",
              fallbackUsed: false,
              approvalRequired: false,
            },
          },
          model: "gemini-2.0-flash",
        }),
      },
    );

    expect(response.meta.requestId).toBe("req-1");
    expect(response.meta.validation).toBe("passed");
    expect(response.auditTrail.map((step) => step.step)).toEqual([
      "capture",
      "transcribe",
      "extract",
      "draft",
      "safety_check",
    ]);
  });

  it("fails empty transcript with safety step", async () => {
    await expect(
      processPayload(
        {
          inputMode: "text",
          text: "   ",
        },
        {
          requestId: "req-2",
        },
      ),
    ).rejects.toMatchObject({
      code: "EMPTY_TRANSCRIPT",
      status: 422,
      auditTrail: expect.arrayContaining([
        expect.objectContaining({ step: "safety_check" }),
      ]),
    });
  });

  it("uses demo-safe fallback when Gemini config is missing and demo mode is enabled", async () => {
    process.env.DEMO_SAFE_MODE = "true";

    const response = await processPayload(
      {
        inputMode: "text",
        text: "Please create a support recap and send it to Maria today.",
      },
      {
        requestId: "req-demo-safe",
        generateStructuredResponse: async () => {
          throw new GeminiConfigError("Missing key");
        },
      },
    );

    expect(response.meta.model).toBe("demo-safe-local-v1");
    expect(response.actions.taskList.length).toBeGreaterThanOrEqual(1);
    expect(response.meta.fallbackUsed).toBe(true);
    expect(response.auditTrail.map((step) => step.step)).toEqual([
      "capture",
      "transcribe",
      "extract",
      "draft",
      "safety_check",
    ]);
  });

  it("returns verifier rejection under reject policy", async () => {
    process.env.VERIFIER_POLICY = "reject";
    try {
      await expect(
        processPayload(
          {
            inputMode: "text",
            text: "Please send status to Priya.",
            presetId: "support_recap",
          },
          {
            requestId: "req-reject-policy",
            generateStructuredResponse: async ({ inputMode, transcript, requestId }) => ({
              output: {
                inputMode,
                transcript,
                summary: "Contract signed with Marcus and legal counsel yesterday.",
                actions: {
                  taskList: ["Coordinate legal closure for contract board"],
                  emailDraft:
                    "Subject: Contract Board\\n\\nLegal closure is required.\\n\\nPlease review before sending.",
                },
                intelligence: { topics: [], entities: [], urgency: "low", sentiment: "neutral", openLoops: [] },
                auditTrail: [
                  {
                    step: "capture",
                    timestamp: "2026-03-02T10:00:00.000Z",
                    details: "Captured",
                  },
                  {
                    step: "transcribe",
                    timestamp: "2026-03-02T10:00:00.000Z",
                    details: "Transcribed",
                  },
                  {
                    step: "extract",
                    timestamp: "2026-03-02T10:00:00.000Z",
                    details: "Extracted",
                  },
                  {
                    step: "draft",
                    timestamp: "2026-03-02T10:00:00.000Z",
                    details: "Drafted",
                  },
                  {
                    step: "safety_check",
                    timestamp: "2026-03-02T10:00:00.000Z",
                    details: "Checked",
                  },
                ],
                meta: {
                  requestId,
                  model: "gemini-2.0-flash",
                  latencyMs: 1,
                  validation: "passed",
                  fallbackUsed: false,
                  approvalRequired: false,
                },
              },
              model: "gemini-2.0-flash",
            }),
          },
        ),
      ).rejects.toMatchObject({
        code: "VERIFIER_FAILED",
        status: 422,
      });
    } finally {
      delete process.env.VERIFIER_POLICY;
    }
  });
});

describe("POST /api/process", () => {
  beforeEach(() => {
    resetRateLimiterForTests();
    resetSecurityShieldForTests();
    delete process.env.MAX_INPUT_CHARS;
    delete process.env.RATE_LIMIT_PER_MIN;
  });

  it("rejects bad JSON", async () => {
    const request = new Request("http://localhost/api/process", {
      method: "POST",
      body: "{ bad json",
      headers: {
        "content-type": "application/json",
      },
    });

    const response = await POST(request);
    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("BAD_JSON");
  });

  it("enforces rate limiting", async () => {
    process.env.RATE_LIMIT_PER_MIN = "2";

    const makeRequest = () =>
      POST(
        new Request("http://localhost/api/process", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-real-ip": "198.51.100.2",
          },
          body: JSON.stringify({ inputMode: "text" }),
        }),
      );

    await makeRequest();
    await makeRequest();
    const blocked = await makeRequest();
    const payload = (await blocked.json()) as { error: { code: string } };

    expect(blocked.status).toBe(429);
    expect(payload.error.code).toBe("RATE_LIMITED");
  });
});
