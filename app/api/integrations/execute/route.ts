import { NextResponse } from "next/server";
import { z } from "zod";

import {
  requireRoleAndWorkspaceFromRequest,
  requireWave1,
} from "@/lib/api-guards";
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
import { enqueueIntegrationExecution } from "@/lib/jobQueue";
import { logServerEvent } from "@/lib/observability";
import {
  JsonBodyParseError,
  JsonBodyTooLargeError,
  readJsonBodyWithLimit,
} from "@/lib/request-body";
import { makeApprovalEvent } from "@/lib/session-meta";

const BodySchema = z
  .object({
    service: z.enum(["gmail", "calendar", "jira_zendesk"]),
    action: z.enum(["dry_run", "connect_stub", "execute"]).default("dry_run"),
    sessionId: z.string().uuid().optional(),
    payload: z.record(z.string(), z.unknown()).default({}),
    idempotencyKey: z.string().trim().min(4).max(128).optional(),
  })
  .strict();

export const runtime = "nodejs";

export async function POST(request: Request) {
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
    "RBAC_INTEGRATION_EXECUTE_DENIED",
  );
  if (denied) {
    denied.headers.set("x-correlation-id", correlationId);
    return denied;
  }

  let raw: unknown;
  try {
    raw = await readJsonBodyWithLimit(request, 32_000);
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "BAD_REQUEST",
          detailsCode:
            error instanceof JsonBodyTooLargeError
              ? "INTEGRATION_EXECUTE_PAYLOAD_TOO_LARGE"
              : "INTEGRATION_EXECUTE_BAD_JSON",
          message:
            error instanceof JsonBodyTooLargeError
              ? error.message
              : error instanceof JsonBodyParseError
                ? error.message
                : "Invalid integration execute payload.",
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
          detailsCode: "INTEGRATION_EXECUTE_BAD_PAYLOAD",
          message: "Invalid integration execute payload.",
          requestId,
        },
      },
      { status: 400, headers: { "x-correlation-id": correlationId } },
    );
  }

  const config = getAppConfig();
  const payload = parsed.data;
  const idempotencyKey = getIdempotencyKeyFromRequest(request) ?? payload.idempotencyKey ?? null;
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
        route: "api.integrations.execute",
        workspaceId: session.workspaceId,
        userId: session.userId,
        key: idempotencyKey,
      })
    : null;
  let hasIdempotencyLock = false;

  const respond = async (status: number, body: Record<string, unknown>) => {
    if (idempotencyScope) {
      await storeIdempotentResponse(idempotencyScope, {
        status,
        body,
        storedAt: new Date().toISOString(),
      });
    }
    return NextResponse.json(body, {
      status,
      headers: { "x-correlation-id": correlationId },
    });
  };

  if (idempotencyScope) {
    const replay = await loadIdempotentResponse(idempotencyScope);
    if (replay) {
      const response = NextResponse.json(replay.body, {
        status: replay.status,
        headers: replay.headers,
      });
      response.headers.set("x-correlation-id", correlationId);
      response.headers.set("x-idempotent-replay", "true");
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

  try {
    if (payload.action === "execute" && !payload.sessionId) {
      return respond(400, {
        error: {
          code: "BAD_REQUEST",
          detailsCode: "INTEGRATION_EXECUTE_SESSION_REQUIRED",
          message: "sessionId is required for execute action.",
          requestId,
        },
      });
    }

    if (
      config.integrationsMode === "live" &&
      payload.action === "execute" &&
      payload.payload.dryRunAcknowledged !== true
    ) {
      return respond(409, {
        error: {
          code: "DRY_RUN_REQUIRED",
          detailsCode: "INTEGRATION_LIVE_DRY_RUN_REQUIRED",
          message:
            "Live mode execute requires payload.dryRunAcknowledged=true after dry-run review.",
          requestId,
        },
      });
    }

    if (payload.action === "execute" && payload.sessionId) {
      if (config.historyMode !== "db") {
        return respond(400, {
          error: {
            code: "HISTORY_MODE_LOCAL",
            detailsCode: "INTEGRATION_EXECUTION_DB_REQUIRED",
            message: "Execution approval gating requires HISTORY_MODE=db.",
            requestId,
          },
        });
      }

      const sourceSession = await getSessionById(payload.sessionId);
      if (!sourceSession || sourceSession.workspace_id !== session.workspaceId) {
        return respond(404, {
          error: {
            code: "NOT_FOUND",
            detailsCode: "INTEGRATION_SESSION_NOT_FOUND",
            message: "Session not found in this workspace.",
            requestId,
          },
        });
      }

      const review = sourceSession.review;
      if (!review?.emailApproved || !review?.tasksApproved) {
        const latestEventId = sourceSession.approval_events?.length
          ? sourceSession.approval_events[sourceSession.approval_events.length - 1]?.id
          : null;
        return respond(409, {
          error: {
            code: "APPROVAL_REQUIRED",
            detailsCode: "INTEGRATION_EXECUTION_BLOCKED_UNAPPROVED",
            message:
              "Execution blocked until both tasks and email are approved for this session.",
            requestId,
          },
          requiredApprovals: {
            emailApproved: Boolean(review?.emailApproved),
            tasksApproved: Boolean(review?.tasksApproved),
            sessionId: sourceSession.id,
            latestEventId,
          },
        });
      }

      try {
        const executeEvent = makeApprovalEvent({
          sessionId: sourceSession.id,
          actorId: session.userId,
          actorRole: session.role,
          action: "execute",
          note: `Integration execute requested for ${payload.service}.`,
        });
        await appendApprovalEvent(sourceSession.id, executeEvent);
        await updateSessionReview(sourceSession.id, {
          ...review,
          executed: true,
        });
      } catch (error) {
        logServerEvent("warn", "integrations.execute.review_update_failed", {
          requestId,
          sessionId: payload.sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const execution = enqueueIntegrationExecution(
      {
        service: payload.service,
        action: payload.action,
        sessionId: payload.sessionId,
        payload: payload.payload,
        idempotencyKey: idempotencyKey ?? undefined,
        mode: config.integrationsMode,
      },
      {
        workspaceId: session.workspaceId,
        userId: session.userId,
      },
    );

    return respond(202, {
      job: execution.job,
      reused: execution.reused,
      requestId,
    });
  } finally {
    if (idempotencyScope && hasIdempotencyLock) {
      await releaseIdempotencyLock(idempotencyScope);
    }
  }
}
