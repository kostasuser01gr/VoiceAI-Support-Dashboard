import { AppNav } from '@/components/app-nav';
import { Button } from '@/components/ui/primitives';
import { useAppStore } from '@/lib/store';
import Link from 'next/link';

export function CommandHeader() {
  const { result, setIsExportOpen, health } = useAppStore();

  const guardianStatus = health?.diagnostics.guardian.status || 'unknown';
  const statusColors = {
    healthy: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    degraded: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    critical: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    unknown: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  };

  return (
    <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-accent/80 mb-1">
          Strategic Intelligence
        </p>
        <h1 className="text-4xl font-semibold tracking-tighter">Command Center</h1>
        <div className="mt-3 flex items-center gap-3">
          <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ${statusColors[guardianStatus as keyof typeof statusColors]}`}>
            System: {guardianStatus}
          </span>
          <p className="text-xs text-zinc-500">Session Verifier Score: {health?.diagnostics.observability.successRate ? Math.round(health.diagnostics.observability.successRate * 100) : 0}%</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={() => setIsExportOpen(true)} disabled={!result}>
          Export Session
        </Button>
        <AppNav current="dashboard" />
        <Link href="/open-loops">
          <Button variant="secondary">Open Loops</Button>
        </Link>
      </div>
    </header>
  );
}