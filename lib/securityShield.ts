import { getAppConfig } from "@/lib/config";

export type SecuritySignal =
  | "success"
  | "rbac_denied"
  | "rate_limited"
  | "bad_json"
  | "payload_invalid"
  | "payload_too_large"
  | "safety_failed"
  | "verifier_rejected"
  | "model_failure"
  | "blocked_request";

type SignalEvent = {
  clientKey: string;
  signal: SecuritySignal;
  riskDelta: number;
  scoreAfter: number;
  timestamp: string;
};

type SecurityState = {
  score: number;
  blockedUntil: number;
  lastSeen: number;
  signals: number;
};

type SecuritySnapshot = {
  trackedClients: number;
  blockedClients: number;
  signalCounts: Record<SecuritySignal, number>;
  recentEvents: SignalEvent[];
};

const clientState = new Map<string, SecurityState>();
const eventLog: SignalEvent[] = [];
const signalCounts: Record<SecuritySignal, number> = {
  success: 0,
  rbac_denied: 0,
  rate_limited: 0,
  bad_json: 0,
  payload_invalid: 0,
  payload_too_large: 0,
  safety_failed: 0,
  verifier_rejected: 0,
  model_failure: 0,
  blocked_request: 0,
};

const SIGNAL_WEIGHTS: Record<SecuritySignal, number> = {
  success: -12,
  rbac_denied: 16,
  rate_limited: 22,
  bad_json: 12,
  payload_invalid: 10,
  payload_too_large: 14,
  safety_failed: 8,
  verifier_rejected: 8,
  model_failure: 6,
  blocked_request: 5,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function decayScore(entry: SecurityState, now: number) {
  const elapsedMs = now - entry.lastSeen;
  if (elapsedMs <= 0) {
    return;
  }

  const elapsedMinutes = Math.floor(elapsedMs / 60_000);
  if (elapsedMinutes <= 0) {
    return;
  }

  entry.score = clamp(entry.score - elapsedMinutes * 6, 0, 400);
}

function getOrCreateState(clientKey: string, now: number): SecurityState {
  const existing = clientState.get(clientKey);
  if (existing) {
    decayScore(existing, now);
    return existing;
  }

  const created: SecurityState = {
    score: 0,
    blockedUntil: 0,
    lastSeen: now,
    signals: 0,
  };
  clientState.set(clientKey, created);
  return created;
}

export function trackSecuritySignal(clientKey: string, signal: SecuritySignal) {
  const config = getAppConfig();
  const now = Date.now();
  const state = getOrCreateState(clientKey, now);

  const riskDelta = SIGNAL_WEIGHTS[signal] ?? 0;
  state.score = clamp(state.score + riskDelta, 0, 400);
  state.lastSeen = now;
  state.signals += 1;

  if (state.score >= config.securityRiskThreshold) {
    state.blockedUntil = Math.max(
      state.blockedUntil,
      now + config.securityBlockMinutes * 60_000,
    );
  }

  signalCounts[signal] += 1;

  eventLog.unshift({
    clientKey,
    signal,
    riskDelta,
    scoreAfter: state.score,
    timestamp: new Date(now).toISOString(),
  });
  if (eventLog.length > 120) {
    eventLog.pop();
  }

  clientState.set(clientKey, state);

  return {
    blocked: state.blockedUntil > now,
    blockedUntil: state.blockedUntil > now ? new Date(state.blockedUntil).toISOString() : null,
    score: state.score,
  };
}

export function isClientBlocked(clientKey: string) {
  const now = Date.now();
  const state = clientState.get(clientKey);
  if (!state) {
    return {
      blocked: false,
      score: 0,
      blockedUntil: null as string | null,
    };
  }

  decayScore(state, now);
  if (state.blockedUntil <= now) {
    state.blockedUntil = 0;
  }
  state.lastSeen = now;
  clientState.set(clientKey, state);

  return {
    blocked: state.blockedUntil > now,
    score: state.score,
    blockedUntil: state.blockedUntil > now ? new Date(state.blockedUntil).toISOString() : null,
  };
}

export function purgeSecurityState(maxIdleMinutes = 30) {
  const now = Date.now();
  const maxIdleMs = maxIdleMinutes * 60_000;
  for (const [key, value] of clientState.entries()) {
    if (value.blockedUntil > now) {
      continue;
    }
    if (now - value.lastSeen > maxIdleMs && value.score <= 0) {
      clientState.delete(key);
    }
  }
}

export function getSecuritySnapshot(): SecuritySnapshot {
  const now = Date.now();
  let blockedClients = 0;
  for (const entry of clientState.values()) {
    if (entry.blockedUntil > now) {
      blockedClients += 1;
    }
  }

  return {
    trackedClients: clientState.size,
    blockedClients,
    signalCounts: { ...signalCounts },
    recentEvents: [...eventLog],
  };
}

export function resetSecurityShieldForTests() {
  clientState.clear();
  eventLog.length = 0;
  for (const key of Object.keys(signalCounts) as SecuritySignal[]) {
    signalCounts[key] = 0;
  }
}
