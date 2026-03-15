import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { listLocalSessions, saveLocalSession, type StoredSession } from "@/lib/history";

const STORAGE_KEY = "voice_to_action_sessions_v4";
const BACKUP_KEY = "voice_to_action_sessions_v4_backup";

type StorageMap = Map<string, string>;

function createWindowMock(store: StorageMap) {
  const listeners = new Map<string, Set<() => void>>();

  return {
    localStorage: {
      getItem(key: string) {
        return store.has(key) ? store.get(key) ?? null : null;
      },
      setItem(key: string, value: string) {
        store.set(key, value);
      },
      removeItem(key: string) {
        store.delete(key);
      },
      clear() {
        store.clear();
      },
    },
    addEventListener(type: string, cb: () => void) {
      const set = listeners.get(type) ?? new Set<() => void>();
      set.add(cb);
      listeners.set(type, set);
    },
    removeEventListener(type: string, cb: () => void) {
      listeners.get(type)?.delete(cb);
    },
    dispatchEvent(event: Event) {
      const set = listeners.get(event.type);
      set?.forEach((listener) => listener());
      return true;
    },
  } as unknown as Window;
}

describe("local history v4 migration", () => {
  const originalWindow = globalThis.window;
  let store: StorageMap;

  beforeEach(() => {
    store = new Map();
    const mockWindow = createWindowMock(store);
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: mockWindow,
      writable: true,
    });
  });

  afterEach(() => {
    if (originalWindow === undefined) {
      // @ts-expect-error restoring absent window in node test env
      delete globalThis.window;
      return;
    }

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
      writable: true,
    });
  });

  it("migrates legacy session shape and backfills index/event fields", () => {
    store.set(
      STORAGE_KEY,
      JSON.stringify({
        version: 3,
        sessions: [
          {
            id: "legacy-session",
            createdAt: "2026-03-01T10:00:00.000Z",
            review: {
              emailApproved: false,
              tasksApproved: false,
              executed: false,
              taskOwners: {},
              comments: ["legacy note"],
            },
            analysis: {
              index: {
                entities: ["Maya"],
                topics: ["support"],
                urgency: "medium",
                openLoops: ["Send recap"],
              },
              verifier: {
                ok: true,
                score: 90,
                flags: [],
                policy: "warn",
              },
            },
            approvalEvents: [
              {
                id: "evt-1",
                sessionId: "legacy-session",
                action: "comment",
                actorId: "demo-user",
                actorRole: "agent",
                timestamp: "2026-03-01T10:05:00.000Z",
                note: "legacy event",
              },
            ],
            data: {
              inputMode: "text",
              transcript: "Please send recap to Maya.",
              summary: "Recap request captured.",
              actions: {
                taskList: ["Send recap to Maya"],
                emailDraft:
                  "Subject: Recap\n\nSharing recap.\n\nPlease review before sending.",
              },
              auditTrail: [
                {
                  step: "capture",
                  timestamp: "2026-03-01T10:00:00.000Z",
                  details: "Captured",
                },
                {
                  step: "transcribe",
                  timestamp: "2026-03-01T10:00:01.000Z",
                  details: "Transcribed",
                },
                {
                  step: "extract",
                  timestamp: "2026-03-01T10:00:02.000Z",
                  details: "Extracted",
                },
                {
                  step: "draft",
                  timestamp: "2026-03-01T10:00:03.000Z",
                  details: "Drafted",
                },
                {
                  step: "safety_check",
                  timestamp: "2026-03-01T10:00:04.000Z",
                  details: "Checked",
                },
              ],
              intelligence: {
                topics: [],
                entities: [],
                urgency: "low",
                sentiment: "neutral",
                openLoops: [],
                openLoopsCount: 0,
              },
              meta: {
                requestId: "legacy-session",
                model: "gemini-2.0-flash",
                latencyMs: 10,
                validation: "passed",
                fallbackUsed: false,
              },
            },
          },
        ],
      }),
    );

    const sessions = listLocalSessions();

    expect(sessions).toHaveLength(1);
    expect(sessions[0].analysis.index.openLoopsCount).toBe(1);
    expect(sessions[0].approvalEvents[0].payloadHash).toMatch(/^fnv1a-/);

    const stored = JSON.parse(store.get(STORAGE_KEY) ?? "{}");
    expect(stored.version).toBe(4);
    expect(typeof stored.checksum).toBe("string");
  });

  it("recovers from primary corruption via backup envelope", () => {
    const validEnvelope: {
      version: 4;
      checksum: string;
      sessions: StoredSession[];
    } = {
      version: 4,
      checksum: "placeholder",
      sessions: [],
    };

    saveLocalSession({
      id: "session-1",
      createdAt: "2026-03-02T09:00:00.000Z",
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
        actions: {
          taskList: ["Follow up"],
          emailDraft: "Subject: Hello\n\nHello\n\nPlease review before sending.",
        },
        auditTrail: [
          {
            step: "capture",
            timestamp: "2026-03-02T09:00:00.000Z",
            details: "Captured",
          },
          {
            step: "transcribe",
            timestamp: "2026-03-02T09:00:01.000Z",
            details: "Transcribed",
          },
          {
            step: "extract",
            timestamp: "2026-03-02T09:00:02.000Z",
            details: "Extracted",
          },
          {
            step: "draft",
            timestamp: "2026-03-02T09:00:03.000Z",
            details: "Drafted",
          },
          {
            step: "safety_check",
            timestamp: "2026-03-02T09:00:04.000Z",
            details: "Checked",
          },
        ],
        intelligence: {
          topics: [],
          entities: [],
          urgency: "low",
          sentiment: "neutral",
          openLoops: [],
        },
        meta: {
          requestId: "session-1",
          model: "gemini-2.0-flash",
          latencyMs: 10,
          validation: "passed",
          fallbackUsed: false,
          approvalRequired: false,
        },
      },
    });

    validEnvelope.sessions = listLocalSessions();
    store.set(BACKUP_KEY, JSON.stringify(validEnvelope));
    store.set(STORAGE_KEY, "{this is not valid json");

    const sessions = listLocalSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe("session-1");
  });
});
