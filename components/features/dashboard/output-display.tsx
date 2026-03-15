import { useAppStore } from '@/lib/store';
import { Card, Badge } from '@/components/ui/primitives';
import { ActionCards } from '@/components/features/actions/action-cards';

export function OutputDisplay() {
  const { result, loading } = useAppStore();

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-40 rounded-xl bg-white/5" />
        <div className="h-60 rounded-xl bg-white/5" />
        <div className="h-32 rounded-xl bg-white/5" />
      </div>
    );
  }

  if (!result) {
    return (
      <Card className="h-full flex flex-col items-center justify-center text-center p-12 bg-white/2 hover:bg-white/5 transition-colors border-dashed border-white/10">
        <div className="w-16 h-16 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center mb-4">
          <span className="text-2xl">⚡</span>
        </div>
        <h3 className="text-lg font-semibold text-white tracking-tighter">No Extraction Active</h3>
        <p className="text-sm text-zinc-500 max-w-xs mt-2">Provide voice or text input to see structured intelligence here.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-accent/80">
            Executive Summary
          </h3>
          <Badge tone="info">Model: {result.meta.model}</Badge>
        </div>
        <p className="text-sm text-zinc-300 leading-relaxed">
          {result.summary}
        </p>
      </Card>

      <ActionCards actions={result.actions.taskList.map(t => ({ description: t }))} emailDraft={result.actions.emailDraft} />

      <Card className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-accent/80">
          System Audit Trail
        </h3>
        <div className="space-y-3">
          {result.auditTrail.map((audit, idx) => (
            <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-black/40 border border-white/5">
              <div className="w-1.5 h-1.5 mt-2 rounded-full bg-accent/40" />
              <div className="flex-grow">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-xs font-bold text-white uppercase">{audit.step}</p>
                  <p className="text-[10px] text-zinc-600 font-mono">{new Date(audit.timestamp).toLocaleTimeString()}</p>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">{audit.details}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}