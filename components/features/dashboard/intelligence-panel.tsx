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
    <Card className="border-white/5 bg-white/[0.02] p-8">
      <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-zinc-500 mb-8">
        Session Intelligence
      </h3>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
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
            <span className={`text-xl font-semibold ${verifier.ok ? 'text-emerald-400' : 'text-amber-400'}`}>
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

      <div className="mt-12 space-y-6">
        <DetailGroup title="Topics" items={index.topics} />
        <DetailGroup title="Detected Entities" items={index.entities} />
        {verifier.flags.length > 0 && (
          <div className="rounded-xl border border-rose-500/10 bg-rose-500/5 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-rose-400 mb-2">Safety Flags</p>
            <div className="flex flex-wrap gap-2">
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
      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-2">{label}</p>
      {children}
    </div>
  );
}

function DetailGroup({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-3">{title}</p>
      <div className="flex flex-wrap gap-2">
        {items.length > 0 ? (
          items.map((item, idx) => (
            <span key={idx} className="px-3 py-1 rounded-full border border-white/5 bg-white/[0.01] text-xs text-zinc-400">
              {item}
            </span>
          ))
        ) : (
          <span className="text-xs text-zinc-700 italic">No data detected</span>
        )}
      </div>
    </div>
  );
}
