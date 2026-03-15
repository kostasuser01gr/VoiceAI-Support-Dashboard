import { Pool } from "pg";

import { getAppConfig } from "@/lib/config";
import type { ProcessResponse } from "@/lib/schema";
import {
  defaultSessionReview,
  makeApprovalPayloadHash,
  type ApprovalEvent,
  type SessionAnalysis,
  type SessionReview,
} from "@/lib/session-meta";

export type DbSessionRecord = {
  id: string;
  created_at: string;
  workspace_id: string;
  user_id: string;
  input_mode: ProcessResponse["inputMode"];
  transcript: string;
  summary: string;
  tasks: string[];
  email_draft: string;
  audit_trail: ProcessResponse["auditTrail"];
  meta: ProcessResponse["meta"];
  session_index: SessionAnalysis["index"];
  verifier_report: SessionAnalysis["verifier"];
  review: SessionReview;
  approval_events: ApprovalEvent[];
};

export type DbIntegrationJobRecord = {
  id: string;
  created_at: string;
  updated_at: string;
  service: string;
  mode: string;
  action: string;
  payload: Record<string, unknown>;
  payload_preview: string;
  workspace_id: string;
  user_id: string;
  session_id: string | null;
  idempotency_key: string | null;
  status: string;
  attempt: number;
  source_job_id: string | null;
  result: string | null;
  output: Record<string, unknown> | null;
};

export type CursorPage<T> = {
  items: T[];
  nextCursor: string | null;
};

let pool: Pool | null = null;
let initialized = false;

function normalizeReview(review: unknown): SessionReview {
  if (!review || typeof review !== "object") {
    return defaultSessionReview();
  }

  const candidate = review as Partial<SessionReview>;
  return {
    emailApproved: Boolean(candidate.emailApproved),
    tasksApproved: Boolean(candidate.tasksApproved),
    executed: Boolean(candidate.executed),
    taskOwners:
      candidate.taskOwners && typeof candidate.taskOwners === "object"
        ? (candidate.taskOwners as Record<string, string>)
        : {},
    comments: Array.isArray(candidate.comments)
      ? candidate.comments.filter((entry: any) => typeof entry === "string")
      : [],
  };
}

function normalizeAnalysis(raw: unknown): SessionAnalysis {
  const fallback: SessionAnalysis = {
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

  if (!raw || typeof raw !== "object") {
    return fallback;
  }

  const candidate = raw as Partial<SessionAnalysis>;
  const index = candidate.index ?? fallback.index;
  const verifier = candidate.verifier ?? fallback.verifier;

  return {
    index: {
      entities: Array.isArray(index.entities)
        ? index.entities.filter((entry) => typeof entry === "string")
        : [],
      topics: Array.isArray(index.topics)
        ? index.topics.filter((entry) => typeof entry === "string")
        : [],
      urgency:
        index.urgency === "high" || index.urgency === "medium" || index.urgency === "low"
          ? index.urgency
          : "low",
      sentiment:
        index.sentiment === "positive" || index.sentiment === "negative" || index.sentiment === "neutral"
          ? index.sentiment
          : "neutral",
      openLoops: Array.isArray(index.openLoops)
        ? index.openLoops.filter((entry) => typeof entry === "string")
        : [],
      openLoopsCount:
        typeof index.openLoopsCount === "number" && Number.isFinite(index.openLoopsCount)
          ? Math.max(0, Math.round(index.openLoopsCount))
          : Array.isArray(index.openLoops)
            ? index.openLoops.filter((entry) => typeof entry === "string").length
            : 0,
    },
    verifier: {
      ok: Boolean(verifier.ok),
      score:
        typeof verifier.score === "number" && Number.isFinite(verifier.score)
          ? Math.max(0, Math.min(100, Math.round(verifier.score)))
          : 100,
      flags: Array.isArray(verifier.flags)
        ? verifier.flags.filter((entry) => typeof entry === "string")
        : [],
      policy:
        verifier.policy === "reject" || verifier.policy === "repair" || verifier.policy === "warn"
          ? verifier.policy
          : "warn",
    },
  };
}

function normalizeApprovalEvents(input: unknown): ApprovalEvent[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.flatMap((entry): ApprovalEvent[] => {
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

function normalizeDbRow(row: DbSessionRecord): DbSessionRecord {
  const analysis = normalizeAnalysis({
    index: row.session_index,
    verifier: row.verifier_report,
  });

  return {
    ...row,
    review: normalizeReview(row.review),
    session_index: analysis.index,
    verifier_report: analysis.verifier,
    approval_events: normalizeApprovalEvents(row.approval_events),
  };
}

function encodeCursor(createdAt: string, id: string) {
  return Buffer.from(JSON.stringify({ createdAt, id }), "utf8").toString("base64url");
}

function decodeCursor(cursor?: string | null) {
  if (!cursor) {
    return null;
  }

  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as { createdAt?: string; id?: string };
    if (!parsed.createdAt || !parsed.id) {
      return null;
    }
    return {
      createdAt: parsed.createdAt,
      id: parsed.id,
    };
  } catch {
    return null;
  }
}

export function getPool(): Pool {
  if (pool) {
    return pool;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required when HISTORY_MODE=db.");
  }

  pool = new Pool({ connectionString });
  return pool;
}

async function ensureInitialized() {
  if (initialized) {
    return;
  }

  const client = await getPool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        workspace_id text NOT NULL DEFAULT 'default-workspace',
        user_id text NOT NULL DEFAULT 'demo-user',
        input_mode text NOT NULL,
        transcript text NOT NULL,
        summary text NOT NULL,
        tasks jsonb NOT NULL,
        email_draft text NOT NULL,
        audit_trail jsonb NOT NULL,
        meta jsonb NOT NULL,
        session_index jsonb NOT NULL DEFAULT '{}'::jsonb,
        verifier_report jsonb NOT NULL DEFAULT '{}'::jsonb,
        review jsonb NOT NULL DEFAULT '{}'::jsonb,
        approval_events jsonb NOT NULL DEFAULT '[]'::jsonb
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id text PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        service text NOT NULL,
        mode text NOT NULL,
        action text NOT NULL,
        payload jsonb NOT NULL,
        payload_preview text NOT NULL,
        workspace_id text NOT NULL,
        user_id text NOT NULL,
        session_id text,
        idempotency_key text,
        status text NOT NULL,
        attempt integer NOT NULL DEFAULT 1,
        source_job_id text,
        result text,
        output jsonb
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS share_token_revocations (
        token_hash text PRIMARY KEY,
        revoked_at timestamptz NOT NULL DEFAULT now(),
        reason text
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS workspace_memberships (
        workspace_id text NOT NULL,
        user_id text NOT NULL,
        role text NOT NULL DEFAULT 'viewer',
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (workspace_id, user_id)
      )
    `);

    await client.query(`
      ALTER TABLE sessions
      ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'default-workspace'
    `);
    await client.query(`
      ALTER TABLE sessions
      ADD COLUMN IF NOT EXISTS user_id text NOT NULL DEFAULT 'demo-user'
    `);
    await client.query(`
      ALTER TABLE sessions
      ADD COLUMN IF NOT EXISTS session_index jsonb NOT NULL DEFAULT '{}'::jsonb
    `);
    await client.query(`
      ALTER TABLE sessions
      ADD COLUMN IF NOT EXISTS verifier_report jsonb NOT NULL DEFAULT '{}'::jsonb
    `);
    await client.query(`
      ALTER TABLE sessions
      ADD COLUMN IF NOT EXISTS review jsonb NOT NULL DEFAULT '{}'::jsonb
    `);
    await client.query(`
      ALTER TABLE sessions
      ADD COLUMN IF NOT EXISTS approval_events jsonb NOT NULL DEFAULT '[]'::jsonb
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sessions_workspace_created_desc
      ON sessions (workspace_id, created_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sessions_workspace_mode_created_desc
      ON sessions (workspace_id, input_mode, created_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sessions_summary_transcript_fts
      ON sessions USING GIN (
        to_tsvector('simple', coalesce(summary, '') || ' ' || coalesce(transcript, ''))
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_jobs_workspace_created_desc
      ON jobs (workspace_id, created_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_jobs_workspace_status_created_desc
      ON jobs (workspace_id, status, created_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_share_token_revocations_revoked_at
      ON share_token_revocations (revoked_at DESC)
    `);

    initialized = true;
  } finally {
    client.release();
  }
}

export function isDbHistoryEnabled() {
  const config = getAppConfig();
  return config.historyMode === "db";
}

export async function insertSession(row: DbSessionRecord) {
  await ensureInitialized();

  await getPool().query(
    `
      INSERT INTO sessions (
        id,
        created_at,
        workspace_id,
        user_id,
        input_mode,
        transcript,
        summary,
        tasks,
        email_draft,
        audit_trail,
        meta,
        session_index,
        verifier_report,
        review,
        approval_events
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    `,
    [
      row.id,
      row.created_at,
      row.workspace_id,
      row.user_id,
      row.input_mode,
      row.transcript,
      row.summary,
      JSON.stringify(row.tasks),
      row.email_draft,
      JSON.stringify(row.audit_trail),
      JSON.stringify(row.meta),
      JSON.stringify(row.session_index),
      JSON.stringify(row.verifier_report),
      JSON.stringify(row.review),
      JSON.stringify(row.approval_events),
    ],
  );
}

export async function listSessions(params: {
  workspaceId?: string;
  userId?: string;
  search?: string;
  mode?: "voice" | "text" | "all";
  limit?: number;
}) {
  await ensureInitialized();

  const values: Array<string | number> = [];
  const conditions: string[] = [];

  if (params.workspaceId?.trim()) {
    values.push(params.workspaceId.trim());
    conditions.push(`workspace_id = $${values.length}`);
  }

  if (params.userId?.trim()) {
    values.push(params.userId.trim());
    conditions.push(`user_id = $${values.length}`);
  }

  if (params.mode && params.mode !== "all") {
    values.push(params.mode);
    conditions.push(`input_mode = $${values.length}`);
  }

  if (params.search?.trim()) {
    values.push(`%${params.search.trim()}%`);
    conditions.push(`(summary ILIKE $${values.length} OR transcript ILIKE $${values.length})`);
  }

  values.push(Math.max(1, Math.min(params.limit ?? 100, 200)));

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await getPool().query(
    `
      SELECT id, created_at, workspace_id, user_id, input_mode, transcript, summary, tasks, email_draft, audit_trail, meta
      , session_index, verifier_report, review, approval_events
      FROM sessions
      ${where}
      ORDER BY created_at DESC
      LIMIT $${values.length}
    `,
    values,
  );

  return (result.rows as DbSessionRecord[]).map((row) => normalizeDbRow(row));
}

export async function listSessionsV2(params: {
  workspaceId?: string;
  userId?: string;
  search?: string;
  mode?: "voice" | "text" | "all";
  pageSize?: number;
  cursor?: string | null;
}): Promise<CursorPage<DbSessionRecord>> {
  await ensureInitialized();

  const values: Array<string | number> = [];
  const conditions: string[] = [];
  const pageSize = Math.max(1, Math.min(params.pageSize ?? 25, 100));

  if (params.workspaceId?.trim()) {
    values.push(params.workspaceId.trim());
    conditions.push(`workspace_id = $${values.length}`);
  }

  if (params.userId?.trim()) {
    values.push(params.userId.trim());
    conditions.push(`user_id = $${values.length}`);
  }

  if (params.mode && params.mode !== "all") {
    values.push(params.mode);
    conditions.push(`input_mode = $${values.length}`);
  }

  if (params.search?.trim()) {
    values.push(params.search.trim());
    conditions.push(
      `to_tsvector('simple', coalesce(summary, '') || ' ' || coalesce(transcript, '')) @@ plainto_tsquery('simple', $${values.length})`,
    );
  }

  const decoded = decodeCursor(params.cursor);
  if (decoded) {
    values.push(decoded.createdAt);
    values.push(decoded.id);
    conditions.push(`(created_at, id) < ($${values.length - 1}::timestamptz, $${values.length})`);
  }

  values.push(pageSize + 1);
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await getPool().query(
    `
      SELECT id, created_at, workspace_id, user_id, input_mode, transcript, summary, tasks, email_draft, audit_trail, meta
      , session_index, verifier_report, review, approval_events
      FROM sessions
      ${where}
      ORDER BY created_at DESC, id DESC
      LIMIT $${values.length}
    `,
    values,
  );

  const rows = (result.rows as DbSessionRecord[]).map((row) => normalizeDbRow(row));
  const hasNext = rows.length > pageSize;
  const items = hasNext ? rows.slice(0, pageSize) : rows;
  const last = items[items.length - 1];

  return {
    items,
    nextCursor: hasNext && last ? encodeCursor(last.created_at, last.id) : null,
  };
}

export async function getSessionById(id: string) {
  await ensureInitialized();

  const result = await getPool().query(
    `
      SELECT id, created_at, workspace_id, user_id, input_mode, transcript, summary, tasks, email_draft, audit_trail, meta
      , session_index, verifier_report, review, approval_events
      FROM sessions
      WHERE id = $1
      LIMIT 1
    `,
    [id],
  );

  const row = (result.rows[0] as DbSessionRecord | undefined) ?? null;
  return row ? normalizeDbRow(row) : null;
}

export async function updateSessionReview(
  sessionId: string,
  review: SessionReview,
) {
  await ensureInitialized();
  await getPool().query(
    `
      UPDATE sessions
      SET review = $2
      WHERE id = $1
    `,
    [sessionId, JSON.stringify(review)],
  );
}

export async function appendApprovalEvent(
  sessionId: string,
  event: ApprovalEvent,
) {
  await ensureInitialized();
  await getPool().query(
    `
      UPDATE sessions
      SET approval_events = COALESCE(approval_events, '[]'::jsonb) || $2::jsonb
      WHERE id = $1
    `,
    [sessionId, JSON.stringify([event])],
  );
}

export async function pingDbConnection() {
  try {
    await ensureInitialized();
    await getPool().query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

export async function listOpenLoops(params: {
  workspaceId?: string;
  limit?: number;
}) {
  const rows = await listSessions({
    workspaceId: params.workspaceId,
    mode: "all",
    limit: params.limit ?? 100,
  });

  return rows.flatMap((row) => {
    const review = row.review ?? defaultSessionReview();
    if (review.executed) {
      return [];
    }

    return row.tasks.map((task) => ({
      sessionId: row.id,
      summarySnippet: row.summary.slice(0, 120),
      task,
      createdAt: row.created_at,
      urgency: row.session_index?.urgency ?? "low",
    }));
  });
}

export async function listOpenLoopsV2(params: {
  workspaceId?: string;
  pageSize?: number;
  cursor?: string | null;
}) {
  const page = await listSessionsV2({
    workspaceId: params.workspaceId,
    mode: "all",
    pageSize: params.pageSize ?? 25,
    cursor: params.cursor,
  });

  const loops = page.items.flatMap((row) => {
    const review = row.review ?? defaultSessionReview();
    if (review.executed) {
      return [];
    }
    return row.tasks.map((task) => ({
      sessionId: row.id,
      summarySnippet: row.summary.slice(0, 120),
      task,
      createdAt: row.created_at,
      urgency: row.session_index?.urgency ?? "low",
    }));
  });

  return {
    items: loops,
    nextCursor: page.nextCursor,
  };
}

export async function getIntegrationJobById(id: string) {
  await ensureInitialized();
  const result = await getPool().query(
    `
      SELECT id, created_at, updated_at, service, mode, action, payload, payload_preview, workspace_id, user_id, session_id, idempotency_key, status, attempt, source_job_id, result, output
      FROM jobs
      WHERE id = $1
      LIMIT 1
    `,
    [id],
  );
  return (result.rows[0] as DbIntegrationJobRecord | undefined) ?? null;
}

export async function listIntegrationJobsV2(params: {
  workspaceId: string;
  userId?: string;
  status?: string;
  service?: string;
  pageSize?: number;
  cursor?: string | null;
}) {
  await ensureInitialized();

  const values: Array<string | number> = [params.workspaceId];
  const conditions = [`workspace_id = $1`];
  const pageSize = Math.max(1, Math.min(params.pageSize ?? 25, 100));

  if (params.userId?.trim()) {
    values.push(params.userId.trim());
    conditions.push(`user_id = $${values.length}`);
  }
  if (params.status?.trim()) {
    values.push(params.status.trim());
    conditions.push(`status = $${values.length}`);
  }
  if (params.service?.trim()) {
    values.push(params.service.trim());
    conditions.push(`service = $${values.length}`);
  }

  const decoded = decodeCursor(params.cursor);
  if (decoded) {
    values.push(decoded.createdAt);
    values.push(decoded.id);
    conditions.push(`(created_at, id) < ($${values.length - 1}::timestamptz, $${values.length})`);
  }

  values.push(pageSize + 1);

  const result = await getPool().query(
    `
      SELECT id, created_at, updated_at, service, mode, action, payload, payload_preview, workspace_id, user_id, session_id, idempotency_key, status, attempt, source_job_id, result, output
      FROM jobs
      WHERE ${conditions.join(" AND ")}
      ORDER BY created_at DESC, id DESC
      LIMIT $${values.length}
    `,
    values,
  );

  const rows = result.rows as DbIntegrationJobRecord[];
  const hasNext = rows.length > pageSize;
  const items = hasNext ? rows.slice(0, pageSize) : rows;
  const last = items[items.length - 1];

  return {
    items,
    nextCursor: hasNext && last ? encodeCursor(last.created_at, last.id) : null,
  };
}

export async function revokeShareToken(tokenHash: string, reason?: string) {
  await ensureInitialized();
  await getPool().query(
    `
      INSERT INTO share_token_revocations (token_hash, reason)
      VALUES ($1, $2)
      ON CONFLICT (token_hash) DO UPDATE
      SET reason = EXCLUDED.reason, revoked_at = now()
    `,
    [tokenHash, reason ?? null],
  );
}

export async function isShareTokenRevoked(tokenHash: string) {
  await ensureInitialized();
  const result = await getPool().query(
    `
      SELECT token_hash
      FROM share_token_revocations
      WHERE token_hash = $1
      LIMIT 1
    `,
    [tokenHash],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function isUserInWorkspace(workspaceId: string, userId: string) {
  await ensureInitialized();
  const hasMembersResult = await getPool().query(
    `
      SELECT 1
      FROM workspace_memberships
      WHERE workspace_id = $1
      LIMIT 1
    `,
    [workspaceId],
  );
  if ((hasMembersResult.rowCount ?? 0) === 0) {
    return true;
  }

  const membershipResult = await getPool().query(
    `
      SELECT 1
      FROM workspace_memberships
      WHERE workspace_id = $1 AND user_id = $2
      LIMIT 1
    `,
    [workspaceId, userId],
  );
  return (membershipResult.rowCount ?? 0) > 0;
}
