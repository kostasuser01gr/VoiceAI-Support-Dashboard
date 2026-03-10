import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRoleAndWorkspaceFromRequest, requireWave1 } from "@/lib/api-guards";
import { getAppConfig } from "@/lib/config";
import { appendApprovalEvent, getSessionById, updateSessionReview } from "@/lib/db";
import {
  acquireIdempotencyLock,
  buildIdempotencyScopeKey,
  getIdempotencyKeyFromRequest,
  loadIdempotentResponse,
  releaseIdempotencyLock,
  storeIdempotentResponse,
} from "@/lib/idempotency";
import {
  JsonBodyParseError,
  JsonBodyTooLargeError,
  readJsonBodyWithLimit,
} from "@/lib/request-body";
import { makeApprovalEvent } from "@/lib/session-meta";

export const runtime = "nodejs";

type RouteParams = {
  params: Promise<{ id: string }>;
};

const BodySchema = z
  .object({
    note: z.string().trim().max(200).optional(),
  })
  .strict();

export async function POST(request: Request, context: RouteParams) {
  const requestId = crypto.randomUUID();
  const correlationId = request.headers.get("x-correlation-id") ?? requestId;
  const featureBlocked = requireWave1(requestId);
  if (featureBlocked) {
    return featureBlocked;
  }

  const { session, denied } = await requireRoleAndWorkspaceFromRequest(
    request,
    requestId,
    ["agent"],
    "RBAC_APPROVE_TASKS_DENIED",
  );
  if (denied) {
    denied.headers.set("x-correlation-id", correlationId);
    return denied;
  }

  const config = getAppConfig();
  if (config.historyMode !== "db") {
    return NextResponse.json(
      {
        error: {
          code: "HISTORY_MODE_LOCAL",
          detailsCode: "APPROVAL_DB_REQUIRED",
          message: "Approval endpoints require HISTORY_MODE=db.",
          requestId,
        },
      },
      { status: 400, headers: { "x-correlation-id": correlationId } },
    );
  }

  const { id } = await context.params;
  const idempotencyKey = getIdempotencyKeyFromRequest(request);
  if (config.mutationIdempotencyRequired && !idempotencyKey) {
    return NextResponse.json(
      {
        error: {
          code: "BAD_REQUEST",
          detailsCode: "IDEMPOTENCY_KEY_REQUIRED",
          message: "Idempotency-Key header is required for this endpoint.",
          requestId,
        },
      },
      { status: 400, headers: { "x-correlation-id": correlationId } },
    );
  }

  const idempotencyScope = idempotencyKey
    ? buildIdempotencyScopeKey({
        route: `api.sessions.approve-tasks.${id}`,
        workspaceId: session.workspaceId,
        userId: session.userId,
        key: idempotencyKey,
      })
    : null;
  let hasIdempotencyLock = false;
  if (idempotencyScope) {
    const replay = await loadIdempotentResponse(idempotencyScope);
    if (replay) {
      const response = NextResponse.json(replay.body, {
        status: replay.status,
        headers: replay.headers,
      });
      response.headers.set("x-idempotent-replay", "true");
      response.headers.set("x-correlation-id", correlationId);
      return response;
    }
    const acquired = await acquireIdempotencyLock(idempotencyScope);
    if (!acquired) {
      return NextResponse.json(
        {
          error: {
            code: "IDEMPOTENCY_IN_PROGRESS",
            detailsCode: "IDEMPOTENCY_LOCKED",
            message: "Another request with this idempotency key is still processing.",
            requestId,
          },
        },
        { status: 409, headers: { "x-correlation-id": correlationId } },
      );
    }
    hasIdempotencyLock = true;
  }

  let payload: unknown;
  try {
    payload = await readJsonBodyWithLimit(request, 8_000);
  } catch (error) {
    if (idempotencyScope && hasIdempotencyLock) {
      await releaseIdempotencyLock(idempotencyScope);
    }
    return NextResponse.json(
      {
        error: {
          code: "BAD_REQUEST",
          detailsCode:
            error instanceof JsonBodyTooLargeError
              ? "APPROVAL_PAYLOAD_TOO_LARGE"
              : "APPROVAL_BAD_JSON",
          message:
            error instanceof JsonBodyTooLargeError
              ? error.message
              : error instanceof JsonBodyParseError
                ? error.message
                : "Invalid approval payload.",
          requestId,
        },
      },
      {
        status: error instanceof JsonBodyTooLargeError ? 413 : 400,
        headers: { "x-correlation-id": correlationId },
      },
    );
  }

  const parsed = BodySchema.safeParse(payload);
  if (!parsed.success) {
    if (idempotencyScope && hasIdempotencyLock) {
      await releaseIdempotencyLock(idempotencyScope);
    }
    return NextResponse.json(
      {
        error: {
          code: "BAD_REQUEST",
          detailsCode: "APPROVAL_PAYLOAD_INVALID",
          message: "Invalid approval payload.",
          requestId,
        },
      },
      { status: 400, headers: { "x-correlation-id": correlationId } },
    );
  }

  try {
    const row = await getSessionById(id);
    if (!row || row.workspace_id !== session.workspaceId) {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            detailsCode: "SESSION_NOT_FOUND_OR_FORBIDDEN",
            message: "Session not found.",
            requestId,
          },
        },
        { status: 404, headers: { "x-correlation-id": correlationId } },
      );
    }

    const review = {
      ...row.review,
      tasksApproved: true,
    };
    const event = makeApprovalEvent({
      sessionId: row.id,
      actorId: session.userId,
      actorRole: session.role,
      action: "approve_tasks",
      note: parsed.data.note,
    });

    await updateSessionReview(row.id, review);
    await appendApprovalEvent(row.id, event);

    const response = NextResponse.json(
      {
        ok: true,
        review,
        event,
      },
      { headers: { "x-correlation-id": correlationId } },
    );
    if (idempotencyScope) {
      await storeIdempotentResponse(idempotencyScope, {
        status: response.status,
        body: await response.clone().json(),
        storedAt: new Date().toISOString(),
      });
    }
    return response;
  } finally {
    if (idempotencyScope && hasIdempotencyLock) {
      await releaseIdempotencyLock(idempotencyScope);
    }
  }
}
