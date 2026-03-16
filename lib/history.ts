import type { PresetId } from "@/lib/presets";
import type { ProcessResponse } from "@/lib/schema";
import {
  defaultSessionReview,
  makeApprovalPayloadHash,
  type ApprovalEvent,
  type SessionAnalysis,
  type SessionReview,
} from "@/lib/session-meta";

const STORAGE_KEY = "voice_to_action_sessions_v4";
const BACKUP_STORAGE_KEY = "voice_to_action_sessions_v4_backup";
const HISTORY_EVENT = "voice-to-action-history-updated";
const MAX_LOCAL_SESSIONS = (() => {
  const parsed = Number.parseInt(process.env.NEXT_PUBLIC_MAX_LOCAL_SESSIONS ?? "25", 10);
  if (!Number.isFinite(parsed)) {
    return 25;
  }

  return Math.max(5, Math.min(200, parsed));
})();

let cachedHistoryRaw: string | null = null;
let cachedHistorySnapshot: StoredSession[] = [];

export type StoredSession = {
  id: string;
  createdAt: string;
  workspaceId: string;
  presetId: PresetId;
  pinned: boolean;
  tags: string[];
  review: SessionReview;
  analysis: SessionAnalysis;
  approvalEvents: ApprovalEvent[];
  data: ProcessResponse;
};

type HistoryEnvelopeV4 = {
  version: 4;
  checksum: string;
  sessions: StoredSession[];
};

type LegacySession = {
  id: string;
  createdAt: string;
  workspaceId?: string;
  presetId?: string;
  pinned?: boolean;
  tags?: string[];
  review?: SessionReview;
  analysis?: SessionAnalysis;
  approvalEvents?: ApprovalEvent[];
  data?: ProcessResponse;
};

function isBrowser() {
  return typeof window !== "undefined";
}

function emptyAnalysis(): SessionAnalysis {
  return {
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
  };
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function computeEnvelopeChecksum(sessions: StoredSession[]) {
  return hashString(
    sessions
      .map((session) => `${session.id}:${session.createdAt}:${session.data.meta.requestId}`)
      .join("|"),
  );
}

function normalizeApprovalEvents(raw: unknown): ApprovalEvent[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.flatMap((entry): ApprovalEvent[] => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const candidate = entry as Partial<ApprovalEvent>;
    if (
      !candidate.id ||
      !candidate.sessionId ||
      !candidate.actorId ||
      !candidate.actorRole ||
      !candidate.action ||
      !candidate.timestamp
    ) {
      return [];
    }

    const payloadHash =
      typeof candidate.payloadHash === "string" && candidate.payloadHash.trim().length > 0
        ? candidate.payloadHash
        : makeApprovalPayloadHash({
            sessionId: candidate.sessionId,
            actorId: candidate.actorId,
            actorRole: candidate.actorRole,
            action: candidate.action,
            note: candidate.note,
            timestamp: candidate.timestamp,
          });

    return [
      {
        id: candidate.id,
        sessionId: candidate.sessionId,
        actorId: candidate.actorId,
        actorRole: candidate.actorRole,
        action: candidate.action,
        timestamp: candidate.timestamp,
        note: candidate.note,
        payloadHash,
      },
    ];
  });
}

function normalizeSession(entry: LegacySession): StoredSession | null {
  if (!entry?.id || !entry?.createdAt || !entry?.data) {
    return null;
  }

  const reviewBase = defaultSessionReview();
  const review = {
    ...reviewBase,
    ...(entry.review ?? {}),
    taskOwners:
      entry.review?.taskOwners && typeof entry.review.taskOwners === "object"
        ? entry.review.taskOwners
        : reviewBase.taskOwners,
    comments: Array.isArray(entry.review?.comments) ? entry.review.comments : reviewBase.comments,
  };

  const analysis = entry.analysis ?? emptyAnalysis();

  return {
    id: entry.id,
    createdAt: entry.createdAt,
    workspaceId: entry.workspaceId ?? "default-workspace",
    presetId: (entry.presetId ?? "support_recap") as PresetId,
    pinned: Boolean(entry.pinned),
    tags: Array.isArray(entry.tags)
      ? entry.tags.filter((tag) => typeof tag === "string").slice(0, 8)
      : [],
    review,
    analysis: {
      index: {
        entities: Array.isArray(analysis.index?.entities) ? analysis.index.entities : [],
        topics: Array.isArray(analysis.index?.topics) ? analysis.index.topics : [],
        urgency:
          analysis.index?.urgency === "high" ||
          analysis.index?.urgency === "medium" ||
          analysis.index?.urgency === "low"
            ? analysis.index.urgency
            : "low",
        sentiment:
          analysis.index?.sentiment === "positive" ||
          analysis.index?.sentiment === "negative" ||
          analysis.index?.sentiment === "neutral"
            ? analysis.index.sentiment
            : "neutral",
        openLoops: Array.isArray(analysis.index?.openLoops) ? analysis.index.openLoops : [],
        openLoopsCount:
          typeof analysis.index?.openLoopsCount === "number" &&
          Number.isFinite(analysis.index.openLoopsCount)
            ? Math.max(0, Math.round(analysis.index.openLoopsCount))
            : Array.isArray(analysis.index?.openLoops)
              ? analysis.index.openLoops.length
              : 0,
      },
      verifier: {
        ok: Boolean(analysis.verifier?.ok ?? true),
        score:
          typeof analysis.verifier?.score === "number"
            ? Math.max(0, Math.min(100, Math.round(analysis.verifier.score)))
            : 100,
        flags: Array.isArray(analysis.verifier?.flags) ? analysis.verifier.flags : [],
        policy:
          analysis.verifier?.policy === "reject" ||
          analysis.verifier?.policy === "repair" ||
          analysis.verifier?.policy === "warn"
            ? analysis.verifier.policy
            : "warn",
      },
    },
    approvalEvents: normalizeApprovalEvents(entry.approvalEvents),
    data: entry.data as ProcessResponse,
  };
}

function toEnvelope(input: unknown): HistoryEnvelopeV4 {
  if (
    typeof input === "object" &&
    input !== null &&
    "version" in input &&
    (input as { version?: unknown }).version === 4 &&
    Array.isArray((input as { sessions?: unknown }).sessions)
  ) {
    const withSessions = input as unknown as { sessions: LegacySession[] };
    const sessions = withSessions.sessions
      .map((entry) => normalizeSession(entry))
      .filter((entry) => Boolean(entry)) as StoredSession[];

    return {
      version: 4,
      checksum: computeEnvelopeChecksum(sessions),
      sessions,
    };
  }

  if (
    typeof input === "object" &&
    input !== null &&
    "version" in input &&
    ((input as { version?: unknown }).version === 2 ||
      (input as { version?: unknown }).version === 3) &&
    Array.isArray((input as { sessions?: unknown }).sessions)
  ) {
    const withSessions = input as unknown as { sessions: LegacySession[] };
    const sessions = withSessions.sessions
      .map((entry) => normalizeSession(entry))
      .filter((entry) => Boolean(entry)) as StoredSession[];

    return {
      version: 4,
      checksum: computeEnvelopeChecksum(sessions),
      sessions,
    };
  }

  if (Array.isArray(input)) {
    const migrated = (input as LegacySession[]).map((entry) => normalizeSession(entry));

    return {
      version: 4,
      sessions: migrated.filter((entry) => Boolean(entry)) as StoredSession[],
      checksum: computeEnvelopeChecksum(
        migrated.filter((entry) => Boolean(entry)) as StoredSession[],
      ),
    };
  }

  return {
    version: 4,
    checksum: computeEnvelopeChecksum([]),
    sessions: [],
  };
}

function readEnvelope(): HistoryEnvelopeV4 {
  if (!isBrowser()) {
    return { version: 4, checksum: computeEnvelopeChecksum([]), sessions: [] };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { version: 4, checksum: computeEnvelopeChecksum([]), sessions: [] };
    }

    const parsed = JSON.parse(raw) as unknown;
    const envelope = toEnvelope(parsed);
    const normalized: HistoryEnvelopeV4 = {
      version: 4,
      checksum: computeEnvelopeChecksum(envelope.sessions),
      sessions: envelope.sessions,
    };
    const hasValidChecksum =
      typeof (parsed as { checksum?: unknown })?.checksum === "string" &&
      (parsed as { checksum?: string }).checksum === normalized.checksum;

    if (!hasValidChecksum) {
      const backupRaw = window.localStorage.getItem(BACKUP_STORAGE_KEY);
      if (backupRaw) {
        try {
          const backupParsed = JSON.parse(backupRaw) as unknown;
          const backupEnvelope = toEnvelope(backupParsed);
          const backupChecksum = computeEnvelopeChecksum(backupEnvelope.sessions);
          if (
            typeof (backupParsed as { checksum?: unknown })?.checksum === "string" &&
            (backupParsed as { checksum?: string }).checksum === backupChecksum
          ) {
            const recovered: HistoryEnvelopeV4 = {
              version: 4,
              checksum: backupChecksum,
              sessions: backupEnvelope.sessions,
            };
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(recovered));
            return recovered;
          }
        } catch {
          // Ignore invalid backup and continue with repaired envelope.
        }
      }
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  } catch {
    try {
      const backupRaw = window.localStorage.getItem(BACKUP_STORAGE_KEY);
      if (backupRaw) {
        const backupParsed = JSON.parse(backupRaw) as unknown;
        return toEnvelope(backupParsed);
      }
    } catch {
      // Ignore backup parse errors.
    }

    return { version: 4, checksum: computeEnvelopeChecksum([]), sessions: [] };
  }
}

function writeEnvelope(envelope: HistoryEnvelopeV4) {
  if (!isBrowser()) {
    return;
  }

  const normalized: HistoryEnvelopeV4 = {
    version: 4,
    checksum: computeEnvelopeChecksum(envelope.sessions),
    sessions: envelope.sessions,
  };
  const normalizedRaw = JSON.stringify(normalized);
  cachedHistoryRaw = normalizedRaw;
  cachedHistorySnapshot = normalized.sessions;
  const currentRaw = window.localStorage.getItem(STORAGE_KEY);
  if (currentRaw) {
    window.localStorage.setItem(BACKUP_STORAGE_KEY, currentRaw);
  }

  window.localStorage.setItem(STORAGE_KEY, normalizedRaw);
  window.dispatchEvent(new Event(HISTORY_EVENT));
}

export function listLocalSessions(): StoredSession[] {
  return readEnvelope().sessions;
}

export function getLocalSessionById(id: string): StoredSession | null {
  return listLocalSessions().find((session) => session.id === id) ?? null;
}

export function saveLocalSession(session: StoredSession) {
  const existing = listLocalSessions().filter((item) => item.id !== session.id);
  const next = [session, ...existing].slice(0, MAX_LOCAL_SESSIONS);

  writeEnvelope({
    version: 4,
    checksum: "",
    sessions: next,
  });
}

export function removeLocalSession(sessionId: string) {
  const next = listLocalSessions().filter((session) => session.id !== sessionId);
  writeEnvelope({
    version: 4,
    checksum: "",
    sessions: next,
  });
}

export function clearAllLocalSessions() {
  writeEnvelope({
    version: 4,
    checksum: "",
    sessions: [],
  });
}

export function updateLocalSession(
  sessionId: string,
  patch: Partial<
    Pick<
      StoredSession,
      | "pinned"
      | "tags"
      | "review"
      | "workspaceId"
      | "presetId"
      | "analysis"
      | "approvalEvents"
    >
  >,
) {
  const next = listLocalSessions().map((session) => {
    if (session.id !== sessionId) {
      return session;
    }

    return {
      ...session,
      ...patch,
      review: patch.review ? { ...session.review, ...patch.review } : session.review,
      analysis: patch.analysis ? { ...session.analysis, ...patch.analysis } : session.analysis,
      approvalEvents: patch.approvalEvents ?? session.approvalEvents,
    };
  });

  writeEnvelope({
    version: 4,
    checksum: "",
    sessions: next,
  });
}

export function pruneLocalSessions(retentionDays: number) {
  const cutoff = Date.now() - Math.max(1, retentionDays) * 24 * 60 * 60 * 1000;
  const next = listLocalSessions().filter((session) => {
    const date = new Date(session.createdAt).getTime();
    return Number.isFinite(date) && date >= cutoff;
  });

  writeEnvelope({
    version: 4,
    checksum: "",
    sessions: next,
  });
}

export function subscribeLocalHistory(listener: () => void) {
  if (!isBrowser()) {
    return () => {};
  }

  const onStorage = () => listener();
  const onInternal = () => listener();

  window.addEventListener("storage", onStorage);
  window.addEventListener(HISTORY_EVENT, onInternal);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(HISTORY_EVENT, onInternal);
  };
}

export function getLocalHistorySnapshot() {
  if (!isBrowser()) {
    return [];
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === cachedHistoryRaw) {
    return cachedHistorySnapshot;
  }

  const nextEnvelope = readEnvelope();
  cachedHistoryRaw = window.localStorage.getItem(STORAGE_KEY);
  cachedHistorySnapshot = nextEnvelope.sessions;
  return cachedHistorySnapshot;
}

export function getLocalHistoryServerSnapshot(): StoredSession[] {
  return [];
}
