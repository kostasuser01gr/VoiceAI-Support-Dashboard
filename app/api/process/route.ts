import { NextResponse } from "next/server";

import { redactPiiText } from "@/lib/compliance";
import { getAppConfig } from "@/lib/config";
import { insertSession, isUserInWorkspace } from "@/lib/db";
import { buildDemoSafeModelOutput } from "@/lib/demo-safe";
import {
  generateStructuredResponse,
  GeminiConfigError,
  GeminiResponseValidationError,
} from "@/lib/gemini";
import { retrieveContext } from "@/lib/rag";
import {
  logServerEvent,
  trackLatency,
  trackProcessFailure,
  trackProcessRequest,
  trackProcessSuccess,
  trackSafetyFailure,
} from "@/lib/observability";
import { getPresetById } from "@/lib/presets";
import { neutralizeProfanity } from "@/lib/profanity";
import { scoreQuality } from "@/lib/quality";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { getGuardianSnapshot, startRuntimeGuardian } from "@/lib/guardian";
import { ensureRole } from "@/lib/rbac";
import { getSessionFromRequest } from "@/lib/request-session";
import { runSafetyCheck } from "@/lib/safety";
import { isClientBlocked, trackSecuritySignal } from "@/lib/securityShield";
import { defaultSessionReview, type SessionAnalysis } from "@/lib/session-meta";
import { runGroundingVerifier } from "@/lib/verifier";
import {
  acquireIdempotencyLock,
  buildIdempotencyScopeKey,
  getIdempotencyKeyFromRequest,
  loadIdempotentResponse,
  releaseIdempotencyLock,
  storeIdempotentResponse,
} from "@/lib/idempotency";
import {
  ProcessRequestSchema,
  ProcessResponseSchema,
  type ProcessAuditEntry,
  type ProcessMeta,
  type ProcessResponse,
} from "@/lib/schema";

export const runtime = "nodejs";

type ProcessDeps = {
  now: () => string;
  nowMs: () => number;
  requestId: string;
  generateStructuredResponse: typeof generateStructuredResponse;
  redactPii?: boolean;
  onAnalysis?: (analysis: SessionAnalysis) => void;
};

class ApiProcessError extends Error {
  status: number;
  code: string;
  detailsCode?: string;
  auditTrail?: ProcessAuditEntry[];
  meta?: Partial<ProcessMeta>;

  constructor(params: {
    status: number;
    code: string;
    message: string;
    detailsCode?: string;
    auditTrail?: ProcessAuditEntry[];
    meta?: Partial<ProcessMeta>;
  }) {
    super(params.message);
    this.status = params.status;
    this.code = params.code;
    this.detailsCode = params.detailsCode;
    this.auditTrail = params.auditTrail;
    this.meta = params.meta;
    this.name = "ApiProcessError";
  }
}

function makeAuditEntry(step: ProcessAuditEntry["step"], details: string, now: () => string) {
  return {
    step,
    timestamp: now(),
    details,
  };
}

function buildErrorResponse(error: ApiProcessError | Error, requestId: string) {
  if (error instanceof ApiProcessError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          detailsCode: error.detailsCode,
          message: error.message,
          requestId,
        },
        ...(error.auditTrail ? { auditTrail: error.auditTrail } : {}),
        ...(error.meta ? { meta: error.meta } : {}),
      },
      { status: error.status },
    );
  }

  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        detailsCode: "PROCESS_UNHANDLED",
        message: "Unexpected server error while processing transcript.",
        requestId,
      },
    },
    { status: 500 },
  );
}

function createMeta(params: {
  requestId: string;
  model: string;
  startedAt: number;
  nowMs: () => number;
  validation: "passed" | "failed";
  fallbackUsed: boolean;
  approvalRequired?: boolean;
}): ProcessMeta {
  return {
    requestId: params.requestId,
    model: params.model,
    latencyMs: Math.max(0, Math.round(params.nowMs() - params.startedAt)),
    validation: params.validation,
    fallbackUsed: params.fallbackUsed,
    approvalRequired: params.approvalRequired ?? false,
  };
}

export async function processPayload(
  payload: unknown,
  deps: Partial<ProcessDeps> = {},
): Promise<ProcessResponse> {
  const config = getAppConfig();
  const now = deps.now ?? (() => new Date().toISOString());
  const nowMs = deps.nowMs ?? (() => Date.now());
  const requestId = deps.requestId ?? crypto.randomUUID();
  const startedAt = nowMs();
  const redactPii = Boolean(deps.redactPii);

  const parsed = ProcessRequestSchema.safeParse(payload);

  if (!parsed.success) {
    logServerEvent("warn", "process.request_validation_failed", {
      requestId,
      issues: parsed.error.issues,
    });

    throw new ApiProcessError({
      status: 400,
      code: "BAD_REQUEST",
      detailsCode: "PROCESS_PAYLOAD_INVALID",
      message: parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "payload"}: ${issue.message}`)
        .join("; "),
      meta: createMeta({
        requestId,
        model: config.geminiModel,
        startedAt,
        nowMs,
        validation: "failed",
        fallbackUsed: false,
      }),
    });
  }

  const { inputMode, text, presetId } = parsed.data;

  if (text.length > config.maxInputChars) {
    throw new ApiProcessError({
      status: 413,
      code: "MAX_INPUT_EXCEEDED",
      detailsCode: "PROCESS_INPUT_TOO_LONG",
      message: `Input exceeds MAX_INPUT_CHARS (${config.maxInputChars}).`,
      meta: createMeta({
        requestId,
        model: config.geminiModel,
        startedAt,
        nowMs,
        validation: "failed",
        fallbackUsed: false,
      }),
    });
  }

  const preset = getPresetById(presetId);
  const transcript = text.trim();
  const auditTrail: ProcessAuditEntry[] = [
    makeAuditEntry(
      "capture",
      `Input captured in ${inputMode} mode with preset '${preset.label}' (prompt ${config.promptVersion}).`,
      now,
    ),
    makeAuditEntry(
      "transcribe",
      inputMode === "voice"
        ? "Client provided transcript from browser voice capture."
        : "Client provided transcript from text fallback input.",
      now,
    ),
  ];

  if (!transcript) {
    auditTrail.push(
      makeAuditEntry("safety_check", "Validation failed: transcript is empty.", now),
    );

    throw new ApiProcessError({
      status: 422,
      code: "EMPTY_TRANSCRIPT",
      detailsCode: "PROCESS_TRANSCRIPT_EMPTY",
      message: "Transcript is empty. Add speech or typed text before processing.",
      auditTrail,
      meta: createMeta({
        requestId,
        model: config.geminiModel,
        startedAt,
        nowMs,
        validation: "failed",
        fallbackUsed: false,
      }),
    });
  }

  const profanity = neutralizeProfanity(transcript);
  const pii = redactPii
    ? redactPiiText(profanity.sanitized)
    : { output: profanity.sanitized, redactions: 0 };
  const cleanTranscript = pii.output;

  let modelOutput: ProcessResponse;
  let modelName = config.geminiModel;
  let usedDemoSafeFallback = false;

  const ragContext = retrieveContext(cleanTranscript);
  const generator = deps.generateStructuredResponse ?? generateStructuredResponse;

  try {
    const generated = await generator({
      inputMode,
      transcript: cleanTranscript,
      preset,
      requestId,
      model: config.geminiModel,
      promptVersion: config.promptVersion,
      ragContext,
    });

    modelOutput = generated.output;
    modelName = generated.model;
  } catch (error) {
    if (error instanceof GeminiConfigError && config.demoSafeMode) {
      modelOutput = buildDemoSafeModelOutput({
        inputMode,
        transcript: cleanTranscript,
        requestId,
      });
      modelName = modelOutput.meta.model;
      usedDemoSafeFallback = true;
      auditTrail.push(
        makeAuditEntry(
          "extract",
          "Demo-safe fallback mode enabled because Gemini configuration is missing.",
          now,
        ),
      );
    } else {
    auditTrail.push(
      makeAuditEntry(
        "safety_check",
        "Validation failed: structured model response was invalid.",
        now,
      ),
    );

    const safeMessage =
      error instanceof GeminiConfigError
        ? error.message
        : "Model response validation failed. Please retry.";

    throw new ApiProcessError({
      status: 500,
      code:
        error instanceof GeminiConfigError
          ? "GEMINI_CONFIG_ERROR"
          : error instanceof GeminiResponseValidationError
            ? "MODEL_SCHEMA_ERROR"
            : "MODEL_ERROR",
      detailsCode: "PROCESS_MODEL_FAILURE",
      message: safeMessage,
      auditTrail,
      meta: createMeta({
        requestId,
        model: modelName,
        startedAt,
        nowMs,
        validation: "failed",
        fallbackUsed: false,
      }),
    });
    }
  }

  if (!usedDemoSafeFallback) {
    auditTrail.push(
      makeAuditEntry(
        "extract",
        `Summary and ${modelOutput.actions.taskList.length} task(s) extracted from transcript.`,
        now,
      ),
      makeAuditEntry("draft", "Email draft generated from transcript context.", now),
    );
  } else {
    auditTrail.push(
      makeAuditEntry(
        "draft",
        "Email draft generated by deterministic demo-safe fallback.",
        now,
      ),
    );
  }

  const safety = runSafetyCheck({
    transcript: cleanTranscript,
    summary: modelOutput.summary,
    taskList: modelOutput.actions.taskList,
    emailDraft: modelOutput.actions.emailDraft,
  });

  if (!safety.ok) {
    trackSafetyFailure();
    auditTrail.push(
      makeAuditEntry("safety_check", `Failed: ${safety.issues.join(" | ")}`, now),
    );

    throw new ApiProcessError({
      status: 422,
      code: "SAFETY_CHECK_FAILED",
      detailsCode: "PROCESS_SAFETY_FAILED",
      message: `Safety check failed: ${safety.issues.join(" ")}`,
      auditTrail,
      meta: createMeta({
        requestId,
        model: modelName,
        startedAt,
        nowMs,
        validation: "failed",
        fallbackUsed: safety.fallbackUsed || profanity.replacedCount > 0,
      }),
    });
  }

  const verifier = runGroundingVerifier({
    transcript: cleanTranscript,
    summary: safety.normalized.summary,
    taskList: safety.normalized.taskList,
    emailDraft: safety.normalized.emailDraft,
    policy: config.verifierPolicy,
  });

  let normalizedSummary = verifier.repaired.summary;
  let normalizedTaskList = verifier.repaired.taskList;
  let normalizedEmailDraft = verifier.repaired.emailDraft;

  if (!verifier.report.ok && config.verifierPolicy === "reject") {
    trackSafetyFailure();
    auditTrail.push(
      makeAuditEntry(
        "safety_check",
        `Verifier failed (reject policy): ${verifier.report.flags.join(", ") || "no flags"}`,
        now,
      ),
    );

    throw new ApiProcessError({
      status: 422,
      code: "VERIFIER_FAILED",
      detailsCode: "PROCESS_VERIFIER_REJECTED",
      message: "Grounding verifier blocked the output under reject policy.",
      auditTrail,
      meta: createMeta({
        requestId,
        model: modelName,
        startedAt,
        nowMs,
        validation: "failed",
        fallbackUsed: true,
      }),
    });
  }

  if (!verifier.report.ok && config.verifierPolicy === "warn") {
    normalizedSummary = safety.normalized.summary;
    normalizedTaskList = safety.normalized.taskList;
    normalizedEmailDraft = safety.normalized.emailDraft;
  }

  const quality = scoreQuality({
    summary: normalizedSummary,
    taskList: normalizedTaskList,
    emailDraft: normalizedEmailDraft,
  });

  const analysis: SessionAnalysis = {
    index: {
      ...modelOutput.intelligence,
      openLoopsCount: modelOutput.intelligence.openLoops.length,
    },
    verifier: verifier.report,
  };

  deps.onAnalysis?.(analysis);

  auditTrail.push(
    makeAuditEntry(
      "safety_check",
      [
        profanity.replacedCount > 0
          ? `Profanity-safe normalization: ${profanity.replacedCount}.`
          : null,
        pii.redactions > 0 ? `PII redactions: ${pii.redactions}.` : null,
        `Verifier score: ${verifier.report.score}/100 (${verifier.report.ok ? "pass" : "flagged"}).`,
        verifier.report.flags.length ? `Verifier flags: ${verifier.report.flags.join(", ")}.` : null,
        `Quality score: ${quality.score}/100.`,
      ]
        .filter(Boolean)
        .join(" "),
      now,
    ),
  );

  const response: ProcessResponse = {
    inputMode,
    transcript: cleanTranscript,
    summary: normalizedSummary,
    actions: {
      taskList: normalizedTaskList,
      emailDraft: normalizedEmailDraft,
    },
    intelligence: modelOutput.intelligence,
    auditTrail,
    meta: createMeta({
      requestId,
      model: modelName,
      startedAt,
      nowMs,
      validation: "passed",
      fallbackUsed:
        usedDemoSafeFallback ||
        safety.fallbackUsed ||
        profanity.replacedCount > 0 ||
        pii.redactions > 0 ||
        !verifier.report.ok,
      approvalRequired: modelOutput.intelligence.urgency === "high",
    }),
  };

  return ProcessResponseSchema.parse(response);
}

export async function POST(request: Request) {
  const config = getAppConfig();
  startRuntimeGuardian();
  const requestId = crypto.randomUUID();
  const correlationId = request.headers.get("x-correlation-id") ?? requestId;
  trackProcessRequest();

  const clientIp = getClientIp(request);
  const session = getSessionFromRequest(request);
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
        route: "api.process",
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
      response.headers.set("x-correlation-id", correlationId);
      response.headers.set("x-idempotent-replay", "true");
      return response;
    }
  }
  const clientIdentity = `${clientIp}:${session.userId}`;
  const shieldState = isClientBlocked(clientIdentity);
  if (shieldState.blocked) {
    trackProcessFailure();
    trackSecuritySignal(clientIdentity, "blocked_request");
    return NextResponse.json(
      {
        error: {
          code: "SECURITY_BLOCKED",
          detailsCode: "PROCESS_SECURITY_BLOCKED",
          message: "Request temporarily blocked by runtime security shield.",
          requestId,
        },
        security: {
          blockedUntil: shieldState.blockedUntil,
          riskScore: shieldState.score,
          guardianStatus: getGuardianSnapshot().status,
        },
      },
      { status: 403, headers: { "x-correlation-id": correlationId } },
    );
  }

  const denied = ensureRole(session, ["agent"], requestId, "RBAC_PROCESS_DENIED");
  if (denied) {
    trackProcessFailure();
    trackSecuritySignal(clientIdentity, "rbac_denied");
    return denied;
  }

  if (config.historyMode === "db") {
    const workspaceAllowed = await isUserInWorkspace(
      session.workspaceId,
      session.userId,
    );
    if (!workspaceAllowed) {
      trackProcessFailure();
      trackSecuritySignal(clientIdentity, "rbac_denied");
      return NextResponse.json(
        {
          error: {
            code: "FORBIDDEN",
            detailsCode: "RBAC_WORKSPACE_MEMBERSHIP_REQUIRED",
            message: "User is not a member of this workspace.",
            requestId,
          },
        },
        { status: 403, headers: { "x-correlation-id": correlationId } },
      );
    }
  }

  const rateLimit = await checkRateLimit(
    clientIdentity,
    config.rateLimitPerMin,
    config.rateLimitBurstPer10s,
  );
  if (!rateLimit.allowed) {
    trackProcessFailure();
    trackSecuritySignal(clientIdentity, "rate_limited");
    return NextResponse.json(
      {
        error: {
          code: "RATE_LIMITED",
          detailsCode: "PROCESS_RATE_LIMITED",
          message: `Rate limit exceeded (${rateLimit.reason ?? "limit"}). Retry in ${rateLimit.retryAfterSeconds}s.`,
          requestId,
        },
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
          "x-correlation-id": correlationId,
        },
      },
    );
  }

  if (idempotencyScope) {
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
    const rawBody = await request.text();
    const maxBodyBytes = config.maxInputChars * 8 + 4000;

    if (Buffer.byteLength(rawBody, "utf8") > maxBodyBytes) {
      trackProcessFailure();
      trackSecuritySignal(clientIdentity, "payload_too_large");
      return NextResponse.json(
        {
          error: {
            code: "PAYLOAD_TOO_LARGE",
            detailsCode: "PROCESS_PAYLOAD_TOO_LARGE",
            message: `Request body exceeds ${maxBodyBytes} bytes.`,
            requestId,
          },
        },
        { status: 413, headers: { "x-correlation-id": correlationId } },
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody) as unknown;
    } catch {
      trackProcessFailure();
      trackSecuritySignal(clientIdentity, "bad_json");
      return NextResponse.json(
        {
          error: {
            code: "BAD_JSON",
            detailsCode: "PROCESS_BAD_JSON",
            message: "Request body must be valid JSON.",
            requestId,
          },
        },
        { status: 400, headers: { "x-correlation-id": correlationId } },
      );
    }

    const redactPii = request.headers.get("x-redact-pii") === "true";
    let analysis: SessionAnalysis = {
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
        policy: config.verifierPolicy,
      },
    };

    const result = await processPayload(payload, {
      requestId,
      redactPii,
      onAnalysis: (next) => {
        analysis = next;
      },
    });

    trackProcessSuccess();
    trackLatency(result.meta.latencyMs);
    trackSecuritySignal(clientIdentity, "success");

    const storeHistory = request.headers.get("x-store-history") !== "false";
    if (storeHistory && config.historyMode === "db") {
      try {
        await insertSession({
          id: result.meta.requestId,
          created_at: new Date().toISOString(),
          workspace_id: session.workspaceId,
          user_id: session.userId,
          input_mode: result.inputMode,
          transcript: result.transcript,
          summary: result.summary,
          tasks: result.actions.taskList,
          email_draft: result.actions.emailDraft,
          audit_trail: result.auditTrail,
          meta: result.meta,
          session_index: analysis.index,
          verifier_report: analysis.verifier,
          review: defaultSessionReview(),
          approval_events: [],
        });
      } catch (error) {
        logServerEvent("warn", "process.db_persist_failed", {
          requestId,
          correlationId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const successResponse = NextResponse.json(result, {
      headers: {
        "x-correlation-id": correlationId,
        "x-verifier-score": String(analysis.verifier.score),
        "x-verifier-ok": analysis.verifier.ok ? "true" : "false",
        "x-verifier-flags": analysis.verifier.flags.join(","),
      },
    });
    if (idempotencyScope) {
      await storeIdempotentResponse(idempotencyScope, {
        status: successResponse.status,
        body: result,
        headers: {
          "x-verifier-score": String(analysis.verifier.score),
          "x-verifier-ok": analysis.verifier.ok ? "true" : "false",
          "x-verifier-flags": analysis.verifier.flags.join(","),
        },
        storedAt: new Date().toISOString(),
      });
    }
    return successResponse;
  } catch (error) {
    trackProcessFailure();
    logServerEvent("error", "process.failed", {
      requestId,
      correlationId,
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof Error) {
      const apiError = error as ApiProcessError;
      if (apiError.code === "BAD_REQUEST") {
        trackSecuritySignal(clientIdentity, "payload_invalid");
      } else if (apiError.code === "SAFETY_CHECK_FAILED") {
        trackSecuritySignal(clientIdentity, "safety_failed");
      } else if (apiError.code === "VERIFIER_FAILED") {
        trackSecuritySignal(clientIdentity, "verifier_rejected");
      } else if (
        apiError.code === "MODEL_ERROR" ||
        apiError.code === "MODEL_SCHEMA_ERROR" ||
        apiError.code === "GEMINI_CONFIG_ERROR"
      ) {
        trackSecuritySignal(clientIdentity, "model_failure");
      }
      if (apiError.meta?.latencyMs != null) {
        trackLatency(apiError.meta.latencyMs);
      }

      const response = buildErrorResponse(error as ApiProcessError | Error, requestId);
      response.headers.set("x-correlation-id", correlationId);
      if (idempotencyScope) {
        const body = (await response.clone().json().catch(() => null)) as unknown;
        await storeIdempotentResponse(idempotencyScope, {
          status: response.status,
          body: body ?? {
            error: {
              code: "INTERNAL_ERROR",
              detailsCode: "PROCESS_RESPONSE_PARSE_FAILED",
              message: "Failed to parse response.",
              requestId,
            },
          },
          storedAt: new Date().toISOString(),
        });
      }
      return response;
    }

    const fallbackResponse = NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          detailsCode: "PROCESS_UNKNOWN_ERROR",
          message: "Unknown processing error.",
          requestId,
        },
      },
      { status: 500, headers: { "x-correlation-id": correlationId } },
    );
    if (idempotencyScope) {
      const body = (await fallbackResponse.clone().json().catch(() => null)) as unknown;
      await storeIdempotentResponse(idempotencyScope, {
        status: fallbackResponse.status,
        body: body ?? {
          error: {
            code: "INTERNAL_ERROR",
            detailsCode: "PROCESS_RESPONSE_PARSE_FAILED",
            message: "Failed to parse response.",
            requestId,
          },
        },
        storedAt: new Date().toISOString(),
      });
    }
    return fallbackResponse;
  } finally {
    if (idempotencyScope && hasIdempotencyLock) {
      await releaseIdempotencyLock(idempotencyScope);
    }
  }
}
