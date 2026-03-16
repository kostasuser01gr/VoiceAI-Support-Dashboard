import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createShareToken,
  parseShareToken,
  revokeShareTokenByToken,
} from "@/lib/share";
import { resetMemoryRuntimeStateForTests } from "@/lib/runtime-state/memory";

afterEach(() => {
  resetMemoryRuntimeStateForTests();
  vi.useRealTimers();
});

describe("share tokens", () => {
  it("creates and validates share token", async () => {
    const token = createShareToken({
      id: "s1",
      createdAt: "2026-03-02T10:00:00.000Z",
      workspaceId: "default-workspace",
      presetId: "support_recap",
      pinned: false,
      tags: [],
      review: {
        emailApproved: false,
        tasksApproved: false,
        executed: false,
        taskOwners: {},
        comments: [],
      },
      analysis: {
        index: {
          entities: [],
          topics: [],
          urgency: "low",
          sentiment: "neutral",
          openLoops: [],
          openLoopsCount: 0,
        },
        verifier: {
          ok: true,
          score: 100,
          flags: [],
          policy: "warn",
        },
      },
      approvalEvents: [],
      data: {
        inputMode: "text",
        transcript: "Please send update.",
        summary: "An update should be sent.",
        actions: {
          taskList: ["Send update"],
          emailDraft:
            "Subject: Update\n\nSharing a short update.\n\nPlease review before sending.",
        },
        intelligence: {
          topics: ["update"],
          entities: [],
          urgency: "low" as const,
          sentiment: "neutral" as const,
          openLoops: [],
        },
        auditTrail: [
          { step: "capture", timestamp: "2026-03-02T10:00:00.000Z", details: "Captured" },
          { step: "transcribe", timestamp: "2026-03-02T10:00:00.000Z", details: "Transcribed" },
          { step: "extract", timestamp: "2026-03-02T10:00:00.000Z", details: "Extracted" },
          { step: "draft", timestamp: "2026-03-02T10:00:00.000Z", details: "Drafted" },
          { step: "safety_check", timestamp: "2026-03-02T10:00:00.000Z", details: "Checked" },
        ],
        meta: {
          requestId: "req-1",
          model: "gemini-2.0-flash",
          latencyMs: 12,
          validation: "passed",
          fallbackUsed: false,
          approvalRequired: false,
        },
      },
    });

    const parsed = await parseShareToken(token);
    expect(parsed).not.toBeNull();
    expect(parsed?.session.id).toBe("s1");
  });

  it("expires share token based on configured ttl", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-02T10:00:00.000Z"));
    const token = createShareToken(
      {
        id: "s2",
        createdAt: "2026-03-02T10:00:00.000Z",
        workspaceId: "default-workspace",
        presetId: "support_recap",
        pinned: false,
        tags: [],
        review: {
          emailApproved: false,
          tasksApproved: false,
          executed: false,
          taskOwners: {},
          comments: [],
        },
        analysis: {
          index: {
            entities: [],
            topics: [],
            urgency: "low",
            sentiment: "neutral",
            openLoops: [],
            openLoopsCount: 0,
          },
          verifier: {
            ok: true,
            score: 100,
            flags: [],
            policy: "warn",
          },
        },
        approvalEvents: [],
        data: {
          inputMode: "text",
          transcript: "hello",
          summary: "hello",
          actions: { taskList: [], emailDraft: "hello" },
          intelligence: {
            topics: [],
            entities: [],
            urgency: "low" as const,
            sentiment: "neutral" as const,
            openLoops: [],
          },
          auditTrail: [],
          meta: {
            requestId: "req-2",
            model: "gemini-2.0-flash",
            latencyMs: 1,
            validation: "passed",
            fallbackUsed: false,
            approvalRequired: false,
          },
        },
      },
      { expiresInMs: 60_000 },
    );

    vi.setSystemTime(new Date("2026-03-02T10:02:02.000Z"));
    const parsed = await parseShareToken(token);
    expect(parsed).toBeNull();
  });

  it("rejects revoked token", async () => {
    const token = createShareToken({
      id: "s3",
      createdAt: "2026-03-02T10:00:00.000Z",
      workspaceId: "default-workspace",
      presetId: "support_recap",
      pinned: false,
      tags: [],
      review: {
        emailApproved: false,
        tasksApproved: false,
        executed: false,
        taskOwners: {},
        comments: [],
      },
      analysis: {
        index: {
          entities: [],
          topics: [],
          urgency: "low",
          sentiment: "neutral",
          openLoops: [],
          openLoopsCount: 0,
        },
        verifier: {
          ok: true,
          score: 100,
          flags: [],
          policy: "warn",
        },
      },
      approvalEvents: [],
      data: {
        inputMode: "text",
        transcript: "hello",
        summary: "hello",
        actions: { taskList: [], emailDraft: "hello" },
        intelligence: {
          topics: [],
          entities: [],
          urgency: "low" as const,
          sentiment: "neutral" as const,
          openLoops: [],
        },
        auditTrail: [],
        meta: {          requestId: "req-3",
          model: "gemini-2.0-flash",
          latencyMs: 1,
          validation: "passed",
          fallbackUsed: false,
          approvalRequired: false,
        },
      },
    });

    await revokeShareTokenByToken(token, "test");
    const parsed = await parseShareToken(token);
    expect(parsed).toBeNull();
  });
});
