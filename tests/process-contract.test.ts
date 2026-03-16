import { describe, expect, it } from "vitest";

import { processPayload } from "@/app/api/process/route";
import type { ProcessResponse } from "@/lib/schema";

function buildStubResponse(
  inputMode: "voice" | "text",
  transcript: string,
  requestId: string,
): { output: ProcessResponse; model: string } {
  return {
    output: {
      inputMode,
      transcript,
      summary: "Team requested a follow-up with next actions.",
      actions: {
        taskList: ["Send follow-up summary to team"],
        emailDraft:
          "Subject: Follow-up\n\nThanks for the update.\n\nPlease review before sending.",
      },
      intelligence: {
        topics: ["follow-up"],
        entities: ["team"],
        urgency: "low" as const,
        sentiment: "neutral" as const,
        openLoops: [],
      },
      auditTrail: [
        {
          step: "capture" as const,
          timestamp: "2026-03-03T10:00:00.000Z",
          details: "Captured input.",
        },
        {
          step: "transcribe" as const,
          timestamp: "2026-03-03T10:00:01.000Z",
          details: "Client transcript accepted.",
        },
        {
          step: "extract" as const,
          timestamp: "2026-03-03T10:00:02.000Z",
          details: "Extracted summary and tasks.",
        },
        {
          step: "draft" as const,
          timestamp: "2026-03-03T10:00:03.000Z",
          details: "Generated email draft.",
        },
        {
          step: "safety_check" as const,
          timestamp: "2026-03-03T10:00:04.000Z",
          details: "Safety checks complete.",
        },
      ],
      meta: {
        requestId,
        model: "gemini-2.0-flash",
        latencyMs: 12,
        validation: "passed" as const,
        fallbackUsed: false,
        approvalRequired: false,
      },
    },
    model: "gemini-2.0-flash",
  };
}

describe("/api/process response contract", () => {
  it("preserves top-level key contract", async () => {
    const response = await processPayload(
      {
        inputMode: "text",
        text: "Please send the follow-up summary today.",
      },
      {
        requestId: "contract-check-1",
        generateStructuredResponse: async ({ inputMode, transcript, requestId }) =>
          buildStubResponse(inputMode, transcript, requestId),
      },
    );

    expect(Object.keys(response)).toEqual([
      "inputMode",
      "transcript",
      "summary",
      "actions",
      "intelligence",
      "auditTrail",
      "meta",
    ]);

    expect(Object.keys(response.actions)).toEqual(["taskList", "emailDraft"]);

    for (const entry of response.auditTrail) {
      expect(Object.keys(entry)).toEqual(["step", "timestamp", "details"]);
    }

    expect(Object.keys(response.meta)).toEqual([
      "requestId",
      "model",
      "latencyMs",
      "validation",
      "fallbackUsed",
      "approvalRequired",
    ]);
  });

  it("does not allow key removals in required branches", async () => {
    const response = await processPayload(
      {
        inputMode: "voice",
        text: "Can you schedule a QA sync tomorrow morning?",
      },
      {
        requestId: "contract-check-2",
        generateStructuredResponse: async ({ inputMode, transcript, requestId }) =>
          buildStubResponse(inputMode, transcript, requestId),
      },
    );

    expect(response).toHaveProperty("actions.taskList");
    expect(response).toHaveProperty("actions.emailDraft");
    expect(response).toHaveProperty("meta.validation");
    expect(response.auditTrail.map((entry) => entry.step)).toEqual([
      "capture",
      "transcribe",
      "extract",
      "draft",
      "safety_check",
    ]);
  });
});
