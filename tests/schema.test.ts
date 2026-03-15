import { describe, expect, it } from "vitest";

import {
  ProcessRequestSchema,
  ProcessResponseSchema,
  type ProcessResponse,
} from "@/lib/schema";

describe("schema contracts", () => {
  it("accepts valid process request", () => {
    const parsed = ProcessRequestSchema.parse({
      inputMode: "text",
      text: "Please send recap",
      presetId: "support_recap",
    });

    expect(parsed.inputMode).toBe("text");
    expect(parsed.presetId).toBe("support_recap");
  });

  it("rejects extra properties in process response", () => {
    const candidate: ProcessResponse & { extra: boolean } = {
      inputMode: "voice",
      transcript: "Transcript",
      summary: "Summary.",
      actions: {
        taskList: ["Send recap"],
        emailDraft: "Subject: Update\n\nBody\n\nPlease review before sending.",
      },
      intelligence: { topics: [], entities: [], urgency: "low", sentiment: "neutral", openLoops: [] },
      auditTrail: [
        {
          step: "capture",
          timestamp: "2026-03-02T10:00:00.000Z",
          details: "Captured",
        },
      ],
      meta: {
        requestId: "abc",
        model: "gemini-2.0-flash",
        latencyMs: 20,
        validation: "passed",
        fallbackUsed: false,
        approvalRequired: false,
      },
      extra: true,
    };

    expect(() => ProcessResponseSchema.parse(candidate)).toThrow();
  });
});
