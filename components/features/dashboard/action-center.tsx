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
    <Card className="mb-12 border-border bg-surface p-10">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-8">
        <div>
          <h2 className="text-xl font-medium tracking-tight text-white">System Insights</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-md">
            Operational metrics and quick-access management for voice-to-action streams.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={onProcess}>
            Run Analysis
          </Button>
          <Button variant="secondary" onClick={onOpenLatest}>
            History
          </Button>
          <Button variant="secondary" onClick={onExport} disabled={!result}>
            Export
          </Button>
          <Link href="/history/compare">
            <Button variant="secondary">Compare</Button>
          </Link>
          <Button variant="secondary" onClick={onRegenerate}>
            Rebuild
          </Button>
        </div>
      </div>

      <div className="mt-10 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-6">
        <StatCard label="Total Processed" value={stats.processed} />
        <StatCard label="Pending Approval" value={stats.pendingApprovals} />
        <StatCard label="Open Loops" value={stats.openLoops} />
        <StatCard label="Shield Blocks" value={stats.guardianBlocks} />
        <StatCard label="P50 Latency" value={`${stats.p50Latency}ms`} />
        <StatCard label="P95 Latency" value={`${stats.p95Latency}ms`} />
      </div>

      <div className="mt-8 flex flex-wrap gap-4 pt-8 border-t border-border/50">
        <Badge tone={guardianStatus === "critical" ? "danger" : guardianStatus === "degraded" ? "warning" : "success"}>
          Shield Status: {guardianStatus}
        </Badge>
        <Badge tone="neutral">
          Reliability: {Math.round(successRate * 100)}%
        </Badge>
      </div>
    </Card>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border/50 bg-background/50 p-5 transition-all hover:border-border hover:bg-background">
      <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-3">{label}</p>
      <p className="text-xl font-medium tracking-tight text-foreground">{value}</p>
    </div>
  );
}
