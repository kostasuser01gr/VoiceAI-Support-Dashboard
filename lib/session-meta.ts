import type { IntegrationsMode, VerifierPolicy } from "@/lib/config";

export type SessionUrgency = "low" | "medium" | "high";
export type SessionSentiment = "negative" | "neutral" | "positive";

export type SessionIndex = {
  entities: string[];
  topics: string[];
  urgency: SessionUrgency;
  sentiment: SessionSentiment;
  openLoops: string[];
  openLoopsCount: number;
};

export type VerifierReport = {
  ok: boolean;
  score: number;
  flags: string[];
  policy: VerifierPolicy;
};

export type SessionAnalysis = {
  index: SessionIndex;
  verifier: VerifierReport;
};

export type ApprovalAction = "approve_email" | "approve_tasks" | "comment" | "execute";

export type ApprovalEvent = {
  id: string;
  sessionId: string;
  action: ApprovalAction;
  actorId: string;
  actorRole: "owner" | "admin" | "agent" | "viewer";
  timestamp: string;
  note?: string;
  payloadHash: string;
};

export type SessionReview = {
  emailApproved: boolean;
  tasksApproved: boolean;
  executed: boolean;
  taskOwners: Record<string, string>;
  comments: string[];
};

export type IntegrationExecutionRequest = {
  sessionId?: string;
  service: "gmail" | "calendar" | "jira_zendesk";
  mode: IntegrationsMode;
  action: "dry_run" | "connect_stub" | "execute";
  payload: Record<string, unknown>;
  idempotencyKey?: string;
};

export type OpenLoopItem = {
  sessionId: string;
  summarySnippet: string;
  task: string;
  createdAt: string;
  urgency: SessionUrgency;
};

export function defaultSessionReview(): SessionReview {
  return {
    emailApproved: false,
    tasksApproved: false,
    executed: false,
    taskOwners: {},
    comments: [],
  };
}

export function makeApprovalPayloadHash(input: {
  sessionId: string;
  actorId: string;
  actorRole: ApprovalEvent["actorRole"];
  action: ApprovalAction;
  note?: string;
  timestamp: string;
}) {
  const serialized = [
    input.sessionId,
    input.actorId,
    input.actorRole,
    input.action,
    input.note ?? "",
    input.timestamp,
  ].join("|");

  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function makeApprovalEvent(params: {
  sessionId: string;
  actorId: string;
  actorRole: ApprovalEvent["actorRole"];
  action: ApprovalAction;
  note?: string;
}) {
  const timestamp = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    sessionId: params.sessionId,
    action: params.action,
    actorId: params.actorId,
    actorRole: params.actorRole,
    timestamp,
    note: params.note,
    payloadHash: makeApprovalPayloadHash({
      sessionId: params.sessionId,
      actorId: params.actorId,
      actorRole: params.actorRole,
      action: params.action,
      note: params.note,
      timestamp,
    }),
  } satisfies ApprovalEvent;
}
