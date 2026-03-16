import { createHash } from "node:crypto";

import { GoogleGenAI, Type } from "@google/genai";

import { DEFAULT_GEMINI_MODEL, getAppConfig } from "@/lib/config";
import type { Preset } from "@/lib/presets";
import { buildProcessPrompt, getProcessSystemInstruction } from "@/lib/prompts";
import { getRuntimeStateAdapter } from "@/lib/runtime-state";
import {
  ProcessResponseJsonSchema,
  ProcessResponseSchema,
  type InputMode,
  type ProcessResponse,
} from "@/lib/schema";
import { logServerEvent, trackGeminiCacheHit } from "@/lib/observability";

export class GeminiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiConfigError";
  }
}

export class GeminiResponseValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiResponseValidationError";
  }
}

export class GeminiProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiProviderUnavailableError";
  }
}

type GenerateStructuredResponseParams = {
  inputMode: InputMode;
  transcript: string;
  preset: Preset;
  requestId: string;
  model?: string;
  promptVersion?: string;
  ragContext?: string;
};

type CacheEntry = {
  output: ProcessResponse;
  model: string;
  timestamp: number;
};

const CACHE_TTL_SECONDS = 60 * 60;
const MAX_RETRIES = 2;

const BREAKER_FAILURES_KEY = "gemini:breaker:failures";
const BREAKER_OPEN_KEY = "gemini:breaker:open";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function cacheKey(params: GenerateStructuredResponseParams) {
  const raw = `${params.inputMode}:${params.preset.id}:${params.transcript.trim().toLowerCase()}`;
  return `gemini:cache:${createHash("sha256").update(raw).digest("hex")}`;
}

function getModelCandidates(params: GenerateStructuredResponseParams) {
  const config = getAppConfig();
  const requested = params.model ?? DEFAULT_GEMINI_MODEL;
  return [requested, config.secondaryGeminiModel]
    .map((entry) => entry?.trim())
    .filter((entry): entry is string => Boolean(entry))
    .filter((entry, index, list) => list.indexOf(entry) === index);
}

async function shouldShortCircuit() {
  const open = await getRuntimeStateAdapter().get(BREAKER_OPEN_KEY);
  return open === "true";
}

async function recordProviderFailure() {
  const config = getAppConfig();
  const adapter = getRuntimeStateAdapter();
  
  const failures = await adapter.incrBy(BREAKER_FAILURES_KEY, 1);
  if (failures >= config.geminiCircuitBreakerFailureThreshold) {
    await adapter.set(BREAKER_OPEN_KEY, "true", config.geminiCircuitBreakerCooldownMs / 1000);
    await adapter.del(BREAKER_FAILURES_KEY);
    
    logServerEvent("error", "gemini.circuit_breaker_opened", {
      threshold: config.geminiCircuitBreakerFailureThreshold,
      cooldownMs: config.geminiCircuitBreakerCooldownMs,
    });
  }
}

async function recordProviderSuccess() {
  const adapter = getRuntimeStateAdapter();
  await adapter.del(BREAKER_FAILURES_KEY);
  await adapter.del(BREAKER_OPEN_KEY);
}

async function getCachedResponse(params: GenerateStructuredResponseParams) {
  const key = cacheKey(params);
  const raw = await getRuntimeStateAdapter().get(key);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as CacheEntry;
    if (
      !parsed ||
      typeof parsed.model !== "string" ||
      typeof parsed.timestamp !== "number" ||
      !parsed.output
    ) {
      return null;
    }

    if (Date.now() - parsed.timestamp > CACHE_TTL_SECONDS * 1000) {
      await getRuntimeStateAdapter().del(key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function setCachedResponse(
  params: GenerateStructuredResponseParams,
  entry: CacheEntry,
) {
  const key = cacheKey(params);
  await getRuntimeStateAdapter().set(key, JSON.stringify(entry), CACHE_TTL_SECONDS);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race<T>([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new GeminiProviderUnavailableError(`Model call timed out after ${timeoutMs}ms.`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function generateWithModel(
  ai: GoogleGenAI,
  params: GenerateStructuredResponseParams,
  model: string,
) {
  const promptVersion = params.promptVersion ?? "v1";
  const config = getAppConfig();

  const response = await withTimeout(
    ai.models.generateContent({
      model,
      contents: buildProcessPrompt({
        inputMode: params.inputMode,
        transcript: params.transcript,
        preset: params.preset,
        requestId: params.requestId,
        promptVersion,
        ragContext: params.ragContext,
      }),
      config: {
        systemInstruction: getProcessSystemInstruction(promptVersion),
        responseMimeType: "application/json",
        responseJsonSchema: ProcessResponseJsonSchema,
        temperature: 0.2,
        tools: [
          {
            functionDeclarations: [
              {
                name: "query_knowledge_base",
                description: "Queries the internal CRM and Support playbook knowledge base.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    query: {
                      type: Type.STRING,
                      description: "The search query",
                    },
                  },
                  required: ["query"],
                },
              },
            ],
          },
        ],
      },
    }),
    config.geminiTimeoutMs,
  );

  if (!response.text) {
    throw new GeminiResponseValidationError("Gemini returned an empty response body.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.text);
  } catch {
    throw new GeminiResponseValidationError("Gemini structured output was not valid JSON.");
  }

  const validated = ProcessResponseSchema.safeParse(parsed);
  if (!validated.success) {
    throw new GeminiResponseValidationError(
      `Gemini JSON failed schema validation: ${validated.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    );
  }

  return validated.data;
}

export async function generateStructuredResponse(
  params: GenerateStructuredResponseParams,
): Promise<{ output: ProcessResponse; model: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new GeminiConfigError(
      "Missing GEMINI_API_KEY. Add it to .env.local before processing.",
    );
  }

  if (await shouldShortCircuit()) {
    throw new GeminiProviderUnavailableError(
      "Model provider is temporarily unavailable due to repeated failures.",
    );
  }

  const cached = await getCachedResponse(params);
  if (cached) {
    logServerEvent("info", "gemini.cache_hit", { requestId: params.requestId });
    trackGeminiCacheHit();
    return { output: cached.output, model: cached.model };
  }

  const ai = new GoogleGenAI({ apiKey });
  const candidates = getModelCandidates(params);
  const providerErrors: string[] = [];

  for (const model of candidates) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        const output = await generateWithModel(ai, params, model);
        const entry = {
          output,
          model,
          timestamp: Date.now(),
        };
        await setCachedResponse(params, entry);
        await recordProviderSuccess();
        return {
          output,
          model,
        };
      } catch (error) {
        if (
          error instanceof GeminiConfigError ||
          error instanceof GeminiResponseValidationError
        ) {
          throw error;
        }

        providerErrors.push(error instanceof Error ? error.message : String(error));
        await recordProviderFailure();

        if (attempt >= MAX_RETRIES) {
          break;
        }
        const backoffMs = Math.round((Math.pow(2, attempt + 1) * 400) + Math.random() * 180);
        logServerEvent("warn", "gemini.retry", {
          requestId: params.requestId,
          model,
          attempt: attempt + 1,
          backoffMs,
          error: error instanceof Error ? error.message : String(error),
        });
        await delay(backoffMs);
      }
    }
  }

  throw new GeminiProviderUnavailableError(
    `Model provider failed after retries. ${providerErrors.join(" | ")}`.slice(0, 500),
  );
}

export async function resetGeminiCircuitBreakerForTests() {
  const adapter = getRuntimeStateAdapter();
  await adapter.del(BREAKER_FAILURES_KEY);
  await adapter.del(BREAKER_OPEN_KEY);
}
