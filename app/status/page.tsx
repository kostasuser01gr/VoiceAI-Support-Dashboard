import Link from "next/link";

import { AppNav } from "@/components/app-nav";
import { Badge, Button, Card } from "@/components/ui/primitives";
import { getAppConfig } from "@/lib/config";
import { pingDbConnection } from "@/lib/db";
import { getObservabilitySnapshot } from "@/lib/observability";

export default async function StatusPage() {
  const config = getAppConfig();
  const metrics = getObservabilitySnapshot();
  const dbHealthy = config.historyMode === "db" ? await pingDbConnection() : true;
  const degraded = !config.geminiKeyPresent && !config.demoSafeMode;
  const guardianStatus = config.guardianEnabled ? "enabled" : "disabled";

  return (
    <div className="min-h-screen bg-black px-4 py-16 text-zinc-300 md:px-12">
      <div className="mx-auto max-w-4xl">
        <header className="mb-12 rounded-[2.5rem] border border-white/5 bg-white/[0.02] p-10 backdrop-blur-2xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-sky-400 mb-2">Diagnostics</p>
              <h1 className="text-5xl font-bold tracking-tight text-white">System Vitality</h1>
              <p className="mt-4 text-sm text-zinc-500 font-medium">
                Real-time telemetry and infrastructure health parameters for the Voice-to-Action Protocol.
              </p>
            </div>
            <AppNav current="status" />
          </div>
          
          <div className="mt-10 flex flex-wrap gap-4 pt-8 border-t border-white/5">
            <Badge tone={degraded ? "warning" : "success"}>
              System: {degraded ? "DEGRADED" : "OPTIMAL"}
            </Badge>
            <Badge tone={dbHealthy ? "success" : "danger"}>Registry: {dbHealthy ? "ONLINE" : "OFFLINE"}</Badge>
            <Badge tone="neutral">Guardian: {guardianStatus.toUpperCase()}</Badge>
          </div>
        </header>

        <div className="grid gap-6">
          <Card className="rounded-[2.5rem] border border-white/5 bg-white/[0.01] p-10">
            <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-zinc-600 mb-8 pb-4 border-b border-white/5">Operational Parameters</h3>
            <div className="grid md:grid-cols-2 gap-y-6 gap-x-12">
              <DiagnosticRow label="Environment" value={process.env.NODE_ENV} />
              <DiagnosticRow label="Gemini Core" value={config.geminiKeyPresent ? "CONNECTED" : "MISSING"} />
              <DiagnosticRow label="Demo Sandbox" value={config.demoSafeMode ? "ACTIVE" : "INACTIVE"} />
              <DiagnosticRow label="History Sink" value={config.historyMode.toUpperCase()} />
              <DiagnosticRow label="Rate Ceiling" value={`${config.rateLimitPerMin}/MIN`} />
              <DiagnosticRow label="Prompt Revision" value={config.promptVersion} />
              <DiagnosticRow label="Verifier Policy" value={config.verifierPolicy.toUpperCase()} />
              <DiagnosticRow label="Integrations" value={config.integrationsMode.toUpperCase()} />
            </div>
          </Card>

          <Card className="rounded-[2.5rem] border border-white/5 bg-white/[0.01] p-10">
            <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-zinc-600 mb-8 pb-4 border-b border-white/5">Telemetry Snapshots</h3>
            <div className="grid md:grid-cols-3 gap-8">
              <MetricBox label="P50 Latency" value={`${metrics.p50LatencyMs}ms`} />
              <MetricBox label="P95 Latency" value={`${metrics.p95LatencyMs}ms`} />
              <MetricBox label="Success Rate" value={`${Math.round(metrics.successRate * 100)}%`} />
            </div>
            <div className="mt-10 pt-8 border-t border-white/5 flex flex-wrap gap-3">
              <Link href="/api/health">
                <Button variant="secondary" size="sm">Health JSON</Button>
              </Link>
              <Link href="/api/metrics">
                <Button variant="secondary" size="sm">Metrics Stream</Button>
              </Link>
              <Link href="/api/guardian">
                <Button variant="secondary" size="sm">Guardian Logs</Button>
              </Link>
              <Link href="/">
                <Button variant="primary" size="sm" className="px-6">Return to Command</Button>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function DiagnosticRow({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs font-bold uppercase tracking-widest text-zinc-700">{label}</span>
      <span className="text-sm font-mono text-zinc-400">{value ?? "N/A"}</span>
    </div>
  );
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-6 rounded-2xl bg-white/[0.01] border border-white/5">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-700 mb-2">{label}</p>
      <p className="text-3xl font-bold tracking-tighter text-white">{value}</p>
    </div>
  );
}
