import "server-only";

import type { CircuitBreakerConfig, CircuitBreakerState, CircuitState } from "./types";

// ─── Circuit Breaker ──────────────────────────────────────────────────────────
// Prevents cascading failures in hardening system.
// States: CLOSED (normal) → OPEN (failing) → HALF_OPEN (recovery attempt)

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  recoveryTimeoutMs: 60_000,
  successThreshold: 2,
  name: "default",
};

// In-memory state store (per process)
const circuitStates = new Map<string, CircuitBreakerState & { successCount: number }>();

function getState(name: string): CircuitBreakerState & { successCount: number } {
  if (!circuitStates.has(name)) {
    circuitStates.set(name, { state: "CLOSED", failures: 0, successCount: 0 });
  }
  return circuitStates.get(name)!;
}

function setState(
  name: string,
  updates: Partial<CircuitBreakerState & { successCount: number }>,
): void {
  const current = getState(name);
  circuitStates.set(name, { ...current, ...updates });
}

export class CircuitBreakerOpenError extends Error {
  constructor(name: string, nextAttemptAt?: string) {
    const retry = nextAttemptAt ? ` Next attempt: ${nextAttemptAt}` : "";
    super(`Circuit breaker [${name}] is OPEN.${retry}`);
    this.name = "CircuitBreakerOpenError";
  }
}

export class CircuitBreaker {
  private readonly config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  getState(): CircuitState {
    const s = getState(this.config.name);

    // Check if OPEN circuit should transition to HALF_OPEN
    if (s.state === "OPEN" && s.openedAt) {
      const openedMs = new Date(s.openedAt).getTime();
      if (Date.now() - openedMs >= this.config.recoveryTimeoutMs) {
        setState(this.config.name, {
          state: "HALF_OPEN",
          nextAttemptAt: new Date().toISOString(),
        });
        return "HALF_OPEN";
      }
    }

    return s.state;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const state = this.getState();

    if (state === "OPEN") {
      const s = getState(this.config.name);
      throw new CircuitBreakerOpenError(this.config.name, s.nextAttemptAt);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    const s = getState(this.config.name);

    if (s.state === "HALF_OPEN") {
      const newSuccessCount = s.successCount + 1;
      if (newSuccessCount >= this.config.successThreshold) {
        // Full recovery
        setState(this.config.name, {
          state: "CLOSED",
          failures: 0,
          successCount: 0,
          openedAt: undefined,
          nextAttemptAt: undefined,
        });
      } else {
        setState(this.config.name, { successCount: newSuccessCount });
      }
    } else {
      // CLOSED: reset failure count on success
      setState(this.config.name, { failures: 0, successCount: 0 });
    }
  }

  private onFailure(): void {
    const s = getState(this.config.name);
    const newFailures = s.failures + 1;

    if (s.state === "HALF_OPEN" || newFailures >= this.config.failureThreshold) {
      // Open the circuit
      const openedAt = new Date().toISOString();
      const nextAttemptAt = new Date(
        Date.now() + this.config.recoveryTimeoutMs,
      ).toISOString();

      setState(this.config.name, {
        state: "OPEN",
        failures: newFailures,
        lastFailureAt: openedAt,
        openedAt,
        nextAttemptAt,
        successCount: 0,
      });
    } else {
      setState(this.config.name, {
        failures: newFailures,
        lastFailureAt: new Date().toISOString(),
      });
    }
  }

  reset(): void {
    setState(this.config.name, {
      state: "CLOSED",
      failures: 0,
      successCount: 0,
      openedAt: undefined,
      nextAttemptAt: undefined,
      lastFailureAt: undefined,
    });
  }

  getFullState(): CircuitBreakerState {
    const { successCount: _successCount, ...rest } = getState(this.config.name);
    return { ...rest, state: this.getState() };
  }
}

// ─── Named Circuit Breakers (singleton per service) ───────────────────────────

const breakers = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(
  name: string,
  config?: Partial<CircuitBreakerConfig>,
): CircuitBreaker {
  if (!breakers.has(name)) {
    breakers.set(name, new CircuitBreaker({ name, ...config }));
  }
  return breakers.get(name)!;
}

export function getAllCircuitStates(): Record<string, CircuitBreakerState> {
  const result: Record<string, CircuitBreakerState> = {};
  for (const [name, breaker] of breakers) {
    result[name] = breaker.getFullState();
  }
  return result;
}

// Pre-defined circuit breakers for NEXUS services
export const gateRunnerBreaker = getCircuitBreaker("gate-runner", {
  failureThreshold: 5,
  recoveryTimeoutMs: 60_000,
});

export const complianceBotBreaker = getCircuitBreaker("compliance-bot", {
  failureThreshold: 3,
  recoveryTimeoutMs: 120_000,
});

export const integrationBreaker = getCircuitBreaker("integrations", {
  failureThreshold: 5,
  recoveryTimeoutMs: 30_000,
});
