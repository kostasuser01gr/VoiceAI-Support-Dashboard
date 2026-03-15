"use client";

import { Badge, Button, Card } from "@/components/ui/primitives";
import Link from "next/link";
import { type ProcessResponse } from "@/lib/schema";

type ActionCenterProps = {
  onProcess: () => void;
  onOpenLatest: () => void;
  onExport: () => void;
  onRegenerate: () => void;
  result: ProcessResponse | null;
  stats: {
    processed: number;
    pendingApprovals: number;
    openLoops: number;
    guardianBlocks: number;
    p50Latency: number;
    p95Latency: number;
  };
  guardianStatus: string;
  successRate: number;
};

export function ActionCenter({
  onProcess,
  onOpenLatest,
  onExport,
  onRegenerate,
  result,
  stats,
  guardianStatus,
  successRate,
}: ActionCenterProps) {
  return (
    <Card className="mb-8 border-white/5 bg-white/[0.02] p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-white/90">Quick Actions</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Streamlined workflow for processing, analysis, and data export.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={onProcess}>
            Run process
          </Button>
          <Button variant="secondary" onClick={onOpenLatest}>
            Open latest
          </Button>
          <Button variant="secondary" onClick={onExport} disabled={!result}>
            Export
          </Button>
          <Link href="/history/compare">
            <Button variant="secondary">Compare</Button>
          </Link>
          <Button variant="secondary" onClick={onRegenerate}>
            Regenerate
          </Button>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard label="Processed" value={stats.processed} />
        <StatCard label="Pending Approvals" value={stats.pendingApprovals} />
        <StatCard label="Open Loops" value={stats.openLoops} />
        <StatCard label="Guardian Blocks" value={stats.guardianBlocks} />
        <StatCard label="P50 Latency" value={`${stats.p50Latency}ms`} />
        <StatCard label="P95 Latency" value={`${stats.p95Latency}ms`} />
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Badge tone={guardianStatus === "critical" ? "danger" : guardianStatus === "degraded" ? "warning" : "success"}>
          Guardian: {guardianStatus}
        </Badge>
        <Badge tone="neutral">
          Success rate: {Math.round(successRate * 100)}%
        </Badge>
      </div>
    </Card>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.01] p-4 transition-colors hover:border-white/10 hover:bg-white/[0.02]">
      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-1">{label}</p>
      <p className="text-2xl font-semibold tracking-tight text-zinc-200">{value}</p>
    </div>
  );
}
