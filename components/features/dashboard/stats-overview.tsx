import { useAppStore } from '@/lib/store';
import { Card } from '@/components/ui/primitives';

export function StatsOverview() {
  const { health } = useAppStore();
  const obs = health?.diagnostics.observability;
  const guardian = health?.diagnostics.guardian;

  const stats = [
    { label: 'System Requests', value: obs?.processRequests ?? 0 },
    { label: 'Security Blocks', value: guardian?.security.blockedClients ?? 0 },
    { label: 'Success Rate', value: obs?.successRate ? `${Math.round(obs.successRate * 100)}%` : '0%' },
    { label: 'P50 Latency', value: obs?.p50LatencyMs ? `${obs.p50LatencyMs}ms` : '0ms' },
    { label: 'P95 Latency', value: obs?.p95LatencyMs ? `${obs.p95LatencyMs}ms` : '0ms' },
    { label: 'Guardian Score', value: guardian?.healthScore ?? 100 },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
      {stats.map((stat, idx) => (
        <Card key={idx} className="p-4 flex flex-col items-center justify-center text-center hover:border-accent/20 transition-all cursor-default group">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2 group-hover:text-accent/60 transition-colors">
            {stat.label}
          </p>
          <p className="text-2xl font-semibold tracking-tighter text-white">
            {stat.value}
          </p>
        </Card>
      ))}
    </div>
  );
}