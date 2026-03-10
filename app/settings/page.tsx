"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { AppNav } from "@/components/app-nav";
import { Badge, Button, Card, Input, Select, Toast } from "@/components/ui/primitives";
import { PRESETS, type PresetId } from "@/lib/presets";
import { HealthResponseSchema, type HealthResponse } from "@/lib/schema";
import {
  getUserSettingsServerSnapshot,
  getUserSettingsSnapshot,
  patchUserSettings,
  subscribeUserSettings,
} from "@/lib/userSettings";

export default function SettingsPage() {
  const settings = useSyncExternalStore(
    subscribeUserSettings,
    getUserSettingsSnapshot,
    getUserSettingsServerSnapshot,
  );
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState("");
  const [sessionStatus, setSessionStatus] = useState("");
  const [copyStatus, setCopyStatus] = useState("");

  const deploymentUrls = [
    { label: "Cloud Run", value: "https://voice-to-action-agent-zbluqfbniq-ew.a.run.app" },
    { label: "Firebase", value: "https://chatgpt-ops.web.app" },
    { label: "Health", value: "/api/health" },
    { label: "Guardian", value: "/api/guardian" },
    { label: "Metrics", value: "/api/metrics" },
  ] as const;

  useEffect(() => {
    let cancelled = false;

    const loadHealth = async () => {
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        const payload = (await response.json()) as unknown;
        const parsed = HealthResponseSchema.safeParse(payload);

        if (!cancelled) {
          if (parsed.success) {
            setHealth(parsed.data);
            setHealthError("");
          } else {
            setHealthError("Diagnostics unavailable.");
          }
        }
      } catch {
        if (!cancelled) {
          setHealthError("Failed to load diagnostics.");
        }
      }
    };

    loadHealth();

    return () => {
      cancelled = true;
    };
  }, []);

  const syncSession = async () => {
    setSessionStatus("Updating session...");
    try {
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          workspaceId: settings.workspaceId,
          role: "owner",
        }),
      });

      if (!response.ok) {
        throw new Error("Could not update session.");
      }

      setSessionStatus("Session synced.");
    } catch {
      setSessionStatus("Session update failed.");
    }
  };

  const copyValue = async (value: string) => {
    if (typeof window === "undefined") {
      return;
    }

    const resolved = value.startsWith("http")
      ? value
      : `${window.location.origin}${value}`;
    await navigator.clipboard.writeText(resolved);
    setCopyStatus(`Copied ${resolved}`);
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#d9f5ff_0%,#f5f9ff_35%,#f7f6ff_60%,#ffffff_100%)] px-4 py-6 text-slate-900 md:px-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="rounded-3xl border border-white/60 bg-white/80 p-5 shadow-[0_10px_40px_rgba(15,23,42,0.08)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl font-semibold">Settings</h1>
              <p className="text-sm text-slate-600">
                Configure local behavior and diagnostics for demo stability.
              </p>
            </div>
            <AppNav current="settings" />
          </div>
        </header>

        <Card className="rounded-3xl border border-white/60 bg-white/80 p-5 shadow-[0_8px_32px_rgba(15,23,42,0.08)]">
          <h2 className="mb-4 text-xl font-semibold">Preferences</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <span className="mb-1 block text-sm font-semibold">Store History</span>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.storeHistory}
                  onChange={(event) =>
                    patchUserSettings({ storeHistory: event.target.checked })
                  }
                />
                <span className="text-sm text-slate-700">Keep session history</span>
              </div>
            </label>

            <label className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <span className="mb-1 block text-sm font-semibold">Default Preset</span>
              <Select
                value={settings.defaultPreset}
                onChange={(event) =>
                  patchUserSettings({ defaultPreset: event.target.value as PresetId })
                }
              >
                {PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </Select>
            </label>

            <label className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <span className="mb-1 block text-sm font-semibold">Language (placeholder)</span>
              <Input
                value={settings.language}
                onChange={(event) => patchUserSettings({ language: event.target.value })}
              />
            </label>

            <label className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <span className="mb-1 block text-sm font-semibold">Tone</span>
              <Select
                value={settings.tone}
                onChange={(event) =>
                  patchUserSettings({ tone: event.target.value as "neutral" | "pro" })
                }
              >
                <option value="neutral">neutral</option>
                <option value="pro">pro</option>
              </Select>
            </label>

            <label className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <span className="mb-1 block text-sm font-semibold">Workspace ID</span>
              <Input
                value={settings.workspaceId}
                onChange={(event) => patchUserSettings({ workspaceId: event.target.value })}
              />
            </label>

            <label className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <span className="mb-1 block text-sm font-semibold">User ID</span>
              <Input
                value={settings.userId}
                onChange={(event) => patchUserSettings({ userId: event.target.value })}
              />
            </label>

            <label className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <span className="mb-1 block text-sm font-semibold">Retention Days</span>
              <Input
                type="number"
                min={1}
                max={365}
                value={settings.retentionDays}
                onChange={(event) =>
                  patchUserSettings({ retentionDays: Number(event.target.value) || 30 })
                }
              />
            </label>

            <label className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <span className="mb-1 block text-sm font-semibold">PII Redaction</span>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.redactPii}
                  onChange={(event) =>
                    patchUserSettings({ redactPii: event.target.checked })
                  }
                />
                <span className="text-sm text-slate-700">
                  Redact email/phone before processing
                </span>
              </div>
            </label>
          </div>
        </Card>

        <Card className="rounded-3xl border border-white/60 bg-white/80 p-5 shadow-[0_8px_32px_rgba(15,23,42,0.08)]">
          <h2 className="mb-4 text-xl font-semibold">Workspace Session</h2>
          <p className="text-sm text-slate-600">
            Demo auth/workspace cookie for multi-tenant simulation.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <Button variant="secondary" onClick={syncSession}>
              Sync session cookie
            </Button>
            <Badge tone={sessionStatus.includes("failed") ? "danger" : "info"}>
              {sessionStatus || "Idle"}
            </Badge>
          </div>
        </Card>

        <Card className="rounded-3xl border border-white/60 bg-white/80 p-5 shadow-[0_8px_32px_rgba(15,23,42,0.08)]">
          <h2 className="mb-3 text-xl font-semibold">Diagnostics</h2>
          {healthError && (
            <Toast tone="danger" className="mb-3">
              {healthError}
            </Toast>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
              <p>
                Gemini key present: {health?.diagnostics.geminiKeyPresent ? "yes" : "no"}
              </p>
              <p>Demo safe mode: {health?.diagnostics.demoSafeMode ? "enabled" : "disabled"}</p>
              <p>History mode: {health?.diagnostics.historyMode ?? "unknown"}</p>
              <p>Rate limit/min: {health?.diagnostics.rateLimitPerMin ?? "unknown"}</p>
              <p>
                Burst limit/10s: {health?.diagnostics.rateLimitBurstPer10s ?? "unknown"}
              </p>
              <p>Max input chars: {health?.diagnostics.maxInputChars ?? "unknown"}</p>
              <p>Guardian enabled: {health?.diagnostics.guardianEnabled ? "yes" : "no"}</p>
              <p>Guardian interval: {health?.diagnostics.guardianIntervalMs ?? "unknown"} ms</p>
              <p>
                Security block minutes: {health?.diagnostics.securityBlockMinutes ?? "unknown"}
              </p>
              <p>
                Security risk threshold: {health?.diagnostics.securityRiskThreshold ?? "unknown"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
              <p>Last latency: {settings.lastLatencyMs ?? "-"} ms</p>
              <p>Last validation: {settings.lastValidation ?? "-"}</p>
              <p>Model: {health?.diagnostics.model ?? "unknown"}</p>
              <p>Prompt version: {health?.diagnostics.promptVersion ?? "unknown"}</p>
              <p>
                APP_BASE_URL configured: {health?.diagnostics.appBaseUrlConfigured ? "yes" : "no"}
              </p>
              <p>
                Share token secret present:{" "}
                {health?.diagnostics.shareTokenSecretPresent ? "yes" : "no"}
              </p>
              <p>
                Session signing secret present:{" "}
                {health?.diagnostics.sessionSigningSecretPresent ? "yes" : "no"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm md:col-span-2">
              <p className="font-semibold">Observability</p>
              <p>
                Requests: {health?.diagnostics.observability.processRequests ?? 0} | Successes:{" "}
                {health?.diagnostics.observability.processSuccesses ?? 0} | Failures:{" "}
                {health?.diagnostics.observability.processFailures ?? 0}
              </p>
              <p>
                Success rate:{" "}
                {Math.round((health?.diagnostics.observability.successRate ?? 0) * 100)}% |
                Safety failures: {health?.diagnostics.observability.safetyFailures ?? 0}
              </p>
              <p>
                Avg latency: {health?.diagnostics.observability.averageLatencyMs ?? 0} ms |
                P50 latency: {health?.diagnostics.observability.p50LatencyMs ?? 0} ms |
                P95 latency: {health?.diagnostics.observability.p95LatencyMs ?? 0} ms
              </p>
              <p>
                Integration jobs - queued:{" "}
                {health?.diagnostics.observability.integrationJobs.queued ?? 0}, completed:{" "}
                {health?.diagnostics.observability.integrationJobs.completed ?? 0}, failed:{" "}
                {health?.diagnostics.observability.integrationJobs.failed ?? 0}, retried:{" "}
                {health?.diagnostics.observability.integrationJobs.retried ?? 0}
              </p>
              <p>
                Guardian status: {health?.diagnostics.guardian.status ?? "unknown"} | Health
                score: {health?.diagnostics.guardian.healthScore ?? "unknown"} | Blocked clients:{" "}
                {health?.diagnostics.guardian.security.blockedClients ?? 0}
              </p>
            </div>
          </div>
        </Card>

        <Card className="rounded-3xl border border-white/60 bg-white/80 p-5 shadow-[0_8px_32px_rgba(15,23,42,0.08)]">
          <h2 className="mb-3 text-xl font-semibold">Deployment URLs</h2>
          <p className="text-sm text-slate-600">
            Copy-safe links for smoke checks and status verification.
          </p>
          <div className="mt-3 space-y-2">
            {deploymentUrls.map((item) => (
              <div
                key={item.label}
                className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[140px_1fr_auto]"
              >
                <span className="text-sm font-semibold text-slate-700">{item.label}</span>
                <code className="overflow-hidden text-ellipsis whitespace-nowrap text-xs text-slate-600">
                  {item.value}
                </code>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => copyValue(item.value)}
                >
                  Copy
                </Button>
              </div>
            ))}
          </div>
          {copyStatus && (
            <Toast tone="success" className="mt-3 text-xs">
              {copyStatus}
            </Toast>
          )}
        </Card>
      </div>
    </div>
  );
}
