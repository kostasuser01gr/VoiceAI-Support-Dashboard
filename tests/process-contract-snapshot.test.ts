import { describe, expect, it } from "vitest";

import { processPayload } from "@/app/api/process/route";

describe("/api/process contract snapshot", () => {
  it("keeps the response shape stable", async () => {
    const response = await processPayload(
      {
        inputMode: "text",
        text: "Please send weekly update to the support and QA teams.",
        presetId: "support_recap",
      },
      {
        requestId: "snapshot-contract-1",
        now: () => "2026-03-10T11:00:00.000Z",
        nowMs: (() => {
          let tick = 10_000;
          return () => {
            tick += 25;
            return tick;
          };
        })(),
        generateStructuredResponse: async ({ inputMode, transcript, requestId }) => ({
          output: {
            inputMode,
            transcript,
            summary: "Team asked for a weekly update to support and QA.",
            actions: {
              taskList: ["Send weekly update to support and QA"],
              emailDraft:
                "Subject: Weekly Update\n\nSharing this week's progress update for support and QA.",
            },
            auditTrail: [
              {
                step: "capture",
                timestamp: "2026-03-10T11:00:00.000Z",
                details: "Captured.",
              },
            ],
            meta: {
              requestId,
              model: "gemini-2.0-flash",
              latencyMs: 3,
              validation: "passed",
              fallbackUsed: false,
              approvalRequired: false,
            },
          },
          model: "gemini-2.0-flash",
        }),
      },
    );

    const contractShape = {
      topLevelKeys: Object.keys(response),
      actionKeys: Object.keys(response.actions),
      metaKeys: Object.keys(response.meta),
      auditEntryKeys: response.auditTrail.map((entry) => Object.keys(entry)),
    };

    expect(contractShape).toMatchInlineSnapshot(`
      {
        "actionKeys": [
          "taskList",
          "emailDraft",
        ],
        "auditEntryKeys": [
          [
            "step",
            "timestamp",
            "details",
          ],
          [
            "step",
            "timestamp",
            "details",
          ],
          [
            "step",
            "timestamp",
            "details",
          ],
          [
            "step",
            "timestamp",
            "details",
          ],
          [
            "step",
            "timestamp",
            "details",
          ],
        ],
        "metaKeys": [
          "requestId",
          "model",
          "latencyMs",
          "validation",
          "fallbackUsed",
          "approvalRequired",
        ],
        "topLevelKeys": [
          "inputMode",
          "transcript",
          "summary",
          "actions",
          "auditTrail",
          "meta",
        ],
      }
    `);
  });
});
