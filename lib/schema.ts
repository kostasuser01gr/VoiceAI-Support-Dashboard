import { z } from "zod";

import type { DEFAULT_GEMINI_MODEL } from "@/lib/config";

export const inputModes = ["voice", "text"] as const;
export const auditSteps = [
  "capture",
  "transcribe",
  "extract",
  "draft",
  "safety_check",
] as const;

export const InputModeSchema = z.enum(inputModes);
export const AuditStepSchema = z.enum(auditSteps);

export const ProcessRequestSchema = z
  .object({
    inputMode: InputModeSchema,
    text: z.string(),
    presetId: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

const NonEmptyStringSchema = z.string().trim().min(1);

export const ProcessActionsSchema = z
  .object({
    taskList: z.array(NonEmptyStringSchema),
    emailDraft: NonEmptyStringSchema,
  })
  .strict();

export const AuditTrailEntrySchema = z
  .object({
    step: AuditStepSchema,
    timestamp: z.string(),
    details: z.string(),
  })
  .strict();

export const ProcessMetaSchema = z
  .object({
    requestId: z.string().min(1),
    model: z.string().min(1),
    latencyMs: z.number().int().min(0),
    validation: z.enum(["passed", "failed"]),
    fallbackUsed: z.boolean(),
    approvalRequired: z.boolean().default(false),
  })
  .strict();

export const ProcessIntelligenceSchema = z
  .object({
    topics: z.array(z.string()),
    entities: z.array(z.string()),
    urgency: z.enum(["low", "medium", "high"]),
    sentiment: z.enum(["positive", "negative", "neutral"]),
    openLoops: z.array(z.string()),
  })
  .strict();

export const ProcessResponseSchema = z
  .object({
    inputMode: InputModeSchema,
    transcript: z.string(),
    summary: z.string(),
    actions: ProcessActionsSchema,
    intelligence: ProcessIntelligenceSchema,
    auditTrail: z.array(AuditTrailEntrySchema),
    meta: ProcessMetaSchema,
  })
  .strict();

export const ProcessResponseJsonSchema = {
  type: "object",
  additionalProperties: false,
  propertyOrdering: [
    "inputMode",
    "transcript",
    "summary",
    "actions",
    "intelligence",
    "auditTrail",
    "meta",
  ],
  properties: {
    inputMode: {
      type: "string",
      enum: [...inputModes],
    },
    transcript: {
      type: "string",
    },
    summary: {
      type: "string",
    },
    actions: {
      type: "object",
      additionalProperties: false,
      propertyOrdering: ["taskList", "emailDraft"],
      properties: {
        taskList: {
          type: "array",
          items: {
            type: "string",
          },
        },
        emailDraft: {
          type: "string",
        },
      },
      required: ["taskList", "emailDraft"],
    },
    intelligence: {
      type: "object",
      additionalProperties: false,
      propertyOrdering: ["topics", "entities", "urgency", "sentiment", "openLoops"],
      properties: {
        topics: { type: "array", items: { type: "string" } },
        entities: { type: "array", items: { type: "string" } },
        urgency: { type: "string", enum: ["low", "medium", "high"] },
        sentiment: { type: "string", enum: ["positive", "negative", "neutral"] },
        openLoops: { type: "array", items: { type: "string" } },
      },
      required: ["topics", "entities", "urgency", "sentiment", "openLoops"],
    },
    auditTrail: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        propertyOrdering: ["step", "timestamp", "details"],
        properties: {
          step: {
            type: "string",
            enum: [...auditSteps],
          },
          timestamp: {
            type: "string",
          },
          details: {
            type: "string",
          },
        },
        required: ["step", "timestamp", "details"],
      },
    },
    meta: {
      type: "object",
      additionalProperties: false,
      propertyOrdering: [
        "requestId",
        "model",
        "latencyMs",
        "validation",
        "fallbackUsed",
        "approvalRequired"
      ],
      properties: {
        requestId: {
          type: "string",
        },
        model: {
          type: "string",
        },
        latencyMs: {
          type: "number",
        },
        validation: {
          type: "string",
          enum: ["passed", "failed"],
        },
        fallbackUsed: {
          type: "boolean",
        },
        approvalRequired: {
          type: "boolean",
        }
      },
      required: [
        "requestId",
        "model",
        "latencyMs",
        "validation",
        "fallbackUsed",
        "approvalRequired"
      ],
    },
  },
  required: [
    "inputMode",
    "transcript",
    "summary",
    "actions",
    "intelligence",
    "auditTrail",
    "meta",
  ],
} as const;

export const ApiErrorSchema = z
  .object({
    error: z
      .object({
        code: z.string(),
        detailsCode: z.string().optional(),
        message: z.string(),
        requestId: z.string().optional(),
      })
      .strict(),
    auditTrail: z.array(AuditTrailEntrySchema).optional(),
    meta: ProcessMetaSchema.partial().optional(),
  })
  .strict();

export type InputMode = z.infer<typeof InputModeSchema>;
export type AuditStep = z.infer<typeof AuditStepSchema>;
export type ProcessRequest = z.infer<typeof ProcessRequestSchema>;
export type ProcessResponse = z.infer<typeof ProcessResponseSchema>;
export type ProcessMeta = z.infer<typeof ProcessMetaSchema>;
export type ProcessAuditEntry = z.infer<typeof AuditTrailEntrySchema>;

export type ApiErrorResponse = z.infer<typeof ApiErrorSchema>;

export type ProcessModelName = typeof DEFAULT_GEMINI_MODEL;

export const HealthDiagnosticsSchema = z
  .object({
    geminiKeyPresent: z.boolean(),
    demoSafeMode: z.boolean(),
    historyMode: z.enum(["db", "local"]),
    rateLimitPerMin: z.number().int().positive(),
    rateLimitBurstPer10s: z.number().int().positive(),
    maxInputChars: z.number().int().positive(),
    appBaseUrlConfigured: z.boolean(),
    model: z.string(),
    promptVersion: z.string(),
    shareTokenSecretPresent: z.boolean(),
    sessionSigningSecretPresent: z.boolean(),
    runtimeStateMode: z.enum(["memory", "redis"]).optional(),
    redisConfigured: z.boolean().optional(),
    guardianEnabled: z.boolean(),
    guardianIntervalMs: z.number().int().positive(),
    securityBlockMinutes: z.number().int().positive(),
    securityRiskThreshold: z.number().int().positive(),
    featureV2Apis: z.boolean().optional(),
    mutationIdempotencyRequired: z.boolean().optional(),
    shareTokenTtlMs: z.number().int().positive().optional(),
    shareTokenRequirePassword: z.boolean().optional(),
    geminiTimeoutMs: z.number().int().positive().optional(),
    canaryWorkspaceAllowlistSize: z.number().int().nonnegative().optional(),
    observability: z.object({
      processRequests: z.number().int().nonnegative(),
      processSuccesses: z.number().int().nonnegative(),
      processFailures: z.number().int().nonnegative(),
      safetyFailures: z.number().int().nonnegative(),
      geminiCacheHits: z.number().int().nonnegative(),
      averageLatencyMs: z.number().int().nonnegative(),
      p50LatencyMs: z.number().int().nonnegative(),
      p95LatencyMs: z.number().int().nonnegative(),
      successRate: z.number().min(0).max(1),
      integrationJobs: z.object({
        queued: z.number().int().nonnegative(),
        completed: z.number().int().nonnegative(),
        failed: z.number().int().nonnegative(),
        retried: z.number().int().nonnegative(),
      }),
    }),

    guardian: z.object({
      enabled: z.boolean(),
      status: z.enum(["healthy", "degraded", "critical"]),
      healthScore: z.number().int().min(0).max(100),
      startedAt: z.string().nullable(),
      lastEvaluatedAt: z.string().nullable(),
      activeMitigations: z.array(z.string()),
      reasons: z.array(z.string()),
      security: z.object({
        trackedClients: z.number().int().nonnegative(),
        blockedClients: z.number().int().nonnegative(),
        totalSignals: z.number().int().nonnegative(),
      }),
    }),
  })
  .strict();

export const HealthResponseSchema = z
  .object({
    status: z.string(),
    timestamp: z.string(),
    diagnostics: HealthDiagnosticsSchema,
  })
  .strict();

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const MetricsResponseSchema = z
  .object({
    requestId: z.string(),
    timestamp: z.string(),
    observability: HealthDiagnosticsSchema.shape.observability,
    guardian: HealthDiagnosticsSchema.shape.guardian,
  })
  .strict();

export type MetricsResponse = z.infer<typeof MetricsResponseSchema>;
