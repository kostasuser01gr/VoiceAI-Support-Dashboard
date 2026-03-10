import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRoleAndWorkspaceFromRequest } from "@/lib/api-guards";
import { getPresetById } from "@/lib/presets";
import {
  JsonBodyParseError,
  JsonBodyTooLargeError,
  readJsonBodyWithLimit,
} from "@/lib/request-body";
import { defaultSessionReview, makeApprovalPayloadHash } from "@/lib/session-meta";
import { createShareToken } from "@/lib/share";
import { ProcessResponseSchema } from "@/lib/schema";

const BodySchema = z
  .object({
    id: z.string().trim().min(1),
    createdAt: z.string().trim().min(1),
    workspaceId: z.string().trim().min(1),
    presetId: z.string().trim().min(1),
    pinned: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
    review: z
      .object({
        emailApproved: z.boolean(),
        tasksApproved: z.boolean(),
        executed: z.boolean(),
        taskOwners: z.record(z.string(), z.string()),
        comments: z.array(z.string()),
      })
      .default(defaultSessionReview()),
    analysis: z
      .object({
        index: z.object({
          entities: z.array(z.string()).default([]),
          topics: z.array(z.string()).default([]),
          urgency: z.enum(["low", "medium", "high"]).default("low"),
          sentiment: z.enum(["negative", "neutral", "positive"]).default("neutral"),
          openLoops: z.array(z.string()).default([]),
          openLoopsCount: z.number().int().min(0).default(0),
        }),
        verifier: z.object({
          ok: z.boolean().default(true),
          score: z.number().int().min(0).max(100).default(100),
          flags: z.array(z.string()).default([]),
          policy: z.enum(["warn", "repair", "reject"]).default("warn"),
        }),
      })
      .default({
        index: { entities: [], topics: [], urgency: "low", sentiment: "neutral", openLoops: [], openLoopsCount: 0 },
        verifier: { ok: true, score: 100, flags: [], policy: "warn" },
      }),
    approvalEvents: z
      .array(
        z.object({
          id: z.string().trim().min(1),
          sessionId: z.string().trim().min(1),
          action: z.enum(["approve_email", "approve_tasks", "comment", "execute"]),
          actorId: z.string().trim().min(1),
          actorRole: z.enum(["owner", "admin", "agent", "viewer"]),
          timestamp: z.string().trim().min(1),
          note: z.string().trim().optional(),
          payloadHash: z.string().trim().min(1).optional(),
        }),
      )
      .default([]),
    sharePassword: z.string().trim().min(4).max(100).optional(),
    expiresInMs: z.number().int().min(60_000).max(365 * 24 * 60 * 60 * 1000).optional(),
    data: ProcessResponseSchema,
  })
  .strict();

export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const correlationId = request.headers.get("x-correlation-id") ?? requestId;
  const { denied } = await requireRoleAndWorkspaceFromRequest(
    request,
    requestId,
    ["agent"],
    "RBAC_SHARE_DENIED",
  );
  if (denied) {
    denied.headers.set("x-correlation-id", correlationId);
    return denied;
  }

  let raw: unknown;
  try {
    raw = await readJsonBodyWithLimit(request, 48_000);
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "BAD_REQUEST",
          detailsCode:
            error instanceof JsonBodyTooLargeError ? "SHARE_PAYLOAD_TOO_LARGE" : "SHARE_BAD_JSON",
          message:
            error instanceof JsonBodyTooLargeError
              ? error.message
              : error instanceof JsonBodyParseError
                ? error.message
                : "Invalid share payload.",
          requestId,
        },
      },
      {
        status: error instanceof JsonBodyTooLargeError ? 413 : 400,
        headers: { "x-correlation-id": correlationId },
      },
    );
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "BAD_REQUEST",
          detailsCode: "SHARE_PAYLOAD_INVALID",
          message: "Invalid share payload.",
          requestId,
        },
      },
      { status: 400, headers: { "x-correlation-id": correlationId } },
    );
  }

  try {
    const { sharePassword, expiresInMs, ...sessionPayload } = parsed.data;
    const token = createShareToken(
      {
        ...sessionPayload,
        presetId: getPresetById(sessionPayload.presetId).id,
        approvalEvents: sessionPayload.approvalEvents.map((event) => ({
          ...event,
          payloadHash:
            event.payloadHash ??
            makeApprovalPayloadHash({
              sessionId: event.sessionId,
              actorId: event.actorId,
              actorRole: event.actorRole,
              action: event.action,
              note: event.note,
              timestamp: event.timestamp,
            }),
        })),
      },
      {
        password: sharePassword,
        expiresInMs,
      },
    );
    return NextResponse.json(
      { token, requestId },
      { headers: { "x-correlation-id": correlationId } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "SHARE_TOKEN_ERROR",
          detailsCode: "SHARE_TOKEN_CREATE_FAILED",
          message: error instanceof Error ? error.message : "Could not create share token.",
          requestId,
        },
      },
      { status: 400, headers: { "x-correlation-id": correlationId } },
    );
  }
}
