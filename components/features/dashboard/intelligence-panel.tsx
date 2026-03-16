"use client";

import { Badge, Card } from "@/components/ui/primitives";

type IntelligencePanelProps = {
  analysis: {
    index: {
      topics: string[];
      entities: string[];
      urgency: string;
      sentiment: string;
    };
    verifier: {
      score: number;
      ok: boolean;
      flags: string[];
    };
  };
};

export function IntelligencePanel({ analysis }: IntelligencePanelProps) {
  const { index, verifier } = analysis;

  return (
    <Card className="border-border bg-surface p-10">
      <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-10">
        Session Intelligence
      </h3>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-10">
        <MetricItem label="Urgency">
          <Badge tone={index.urgency === "high" ? "danger" : index.urgency === "medium" ? "warning" : "info"}>
            {index.urgency}
          </Badge>
        </MetricItem>
        
        <MetricItem label="Sentiment">
          <Badge tone={index.sentiment === "positive" ? "success" : index.sentiment === "negative" ? "danger" : "neutral"}>
            {index.sentiment}
          </Badge>
        </MetricItem>

        <MetricItem label="Verifier">
          <div className="flex items-center gap-2">
            <span className={`text-xl font-medium ${verifier.ok ? 'text-emerald-400' : 'text-amber-400'}`}>
              {verifier.score}%
            </span>
          </div>
        </MetricItem>

        <MetricItem label="Status">
          <Badge tone={verifier.ok ? "success" : "warning"}>
            {verifier.ok ? "Verified" : "Flagged"}
          </Badge>
        </MetricItem>
      </div>

      <div className="mt-12 space-y-10">
        <DetailGroup title="Topics" items={index.topics} />
        <DetailGroup title="Detected Entities" items={index.entities} />
        
        {verifier.flags.length > 0 && (
          <div className="rounded-md border border-rose-500/10 bg-rose-500/5 p-6">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-rose-400 mb-4">Safety Flags</p>
            <div className="flex flex-wrap gap-3">
              {verifier.flags.map(f => (
                <Badge key={f} tone="danger" className="lowercase">{f}</Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function MetricItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-4">{label}</p>
      {children}
    </div>
  );
}

function DetailGroup({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-4">{title}</p>
      <div className="flex flex-wrap gap-2.5">
        {items.length > 0 ? (
          items.map((item, idx) => (
            <span key={idx} className="px-3 py-1 rounded-sm border border-border bg-background text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground">
              {item}
            </span>
          ))
        ) : (
          <span className="text-[11px] text-zinc-800 italic uppercase tracking-widest font-bold">No signal detected</span>
        )}
      </div>
    </div>
  );
}
