"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { AppNav } from "@/components/app-nav";
import { Badge, Button } from "@/components/ui/primitives";
import {
  getLocalHistoryServerSnapshot,
  getLocalHistorySnapshot,
  subscribeLocalHistory,
} from "@/lib/history";
import { HealthResponseSchema, type HealthResponse } from "@/lib/schema";

type DbLoop = {
  sessionId: string;
  summarySnippet: string;
  task: string;
  createdAt: string;
  urgency: "low" | "medium" | "high";
};

function formatTs(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function OpenLoopsPage() {
  const localSessions = useSyncExternalStore(
    subscribeLocalHistory,
    getLocalHistorySnapshot,
    getLocalHistoryServerSnapshot,
  );
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [dbLoops, setDbLoops] = useState<DbLoop[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const historyMode = health?.diagnostics.historyMode ?? "local";

  useEffect(() => {
    let cancelled = false;
    const loadHealth = async () => {
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        const payload = (await response.json()) as unknown;
        const parsed = HealthResponseSchema.safeParse(payload);
        if (!cancelled && parsed.success) setHealth(parsed.data);
      } catch {
        if (!cancelled) setHealth(null);
      }
    };
    loadHealth();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (historyMode !== "db") return;
    let cancelled = false;
    const loadLoops = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/open-loops", { cache: "no-store" });
        const payload = (await response.json()) as { loops?: DbLoop[]; error?: { message?: string } };
        if (!response.ok || !Array.isArray(payload.loops)) throw new Error(payload.error?.message ?? "Could not load open loops.");
        if (!cancelled) setDbLoops(payload.loops);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Could not load loops.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadLoops();
    return () => { cancelled = true; };
  }, [historyMode]);

  const localLoops = useMemo(() => {
    return localSessions.flatMap((session) => {
      if (session.review.executed) return [];
      return session.data.actions.taskList.map((task) => ({
        sessionId: session.id,
        summarySnippet: session.data.summary.slice(0, 140),
        task,
        createdAt: session.createdAt,
        urgency: session.analysis.index.urgency,
      }));
    });
  }, [localSessions]);

  const loops = historyMode === "db" ? dbLoops : localLoops;

  return (
    <div className="min-h-screen bg-black px-4 py-16 text-zinc-300 md:px-12">
      <div className="mx-auto max-w-[1200px]">
        <header className="mb-12 rounded-[2.5rem] border border-white/5 bg-white/[0.02] p-10 backdrop-blur-2xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-sky-400 mb-2">Protocol</p>
              <h1 className="text-5xl font-bold tracking-tight text-white">Unresolved Loops</h1>
              <p className="mt-4 text-sm text-zinc-500 font-medium max-w-xl">
                Active operational requirements and unverified task flows derived from session intelligence.
              </p>
            </div>
            <AppNav />
          </div>
          <div className="mt-8 pt-8 border-t border-white/5 flex items-center gap-4">
            <Badge tone="neutral">{loops.length} Pending Loops</Badge>
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-700">Source: {historyMode} registry</span>
          </div>
        </header>

        {error && (
          <div className="mb-8 rounded-2xl border border-rose-500/20 bg-rose-500/5 p-6 text-sm text-rose-400">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-20 text-center animate-pulse text-zinc-600 font-medium uppercase tracking-widest text-[10px]">
            Syncing operational state...
          </div>
        ) : (
          <div className="grid gap-4">
            {loops.length > 0 ? (
              loops.map((item, index) => (
                <div 
                  key={`${item.sessionId}-${index}`}
                  className="group relative rounded-[2rem] border border-white/5 bg-white/[0.01] p-8 transition-all hover:bg-white/[0.02] hover:border-white/10"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-4">
                        <Badge tone={item.urgency === "high" ? "danger" : "info"} className="text-[9px]">
                          {item.urgency}
                        </Badge>
                        <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">
                          {formatTs(item.createdAt)}
                        </span>
                      </div>
                      <h3 className="text-lg font-semibold text-zinc-200 leading-snug">
                        {item.task}
                      </h3>
                      <p className="mt-3 text-sm text-zinc-500 line-clamp-1 italic">
                        Context: {item.summarySnippet}...
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <a href={`/history/${item.sessionId}`}>
                        <Button variant="primary" size="sm" className="px-6">Open Session</Button>
                      </a>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-32 text-center border border-dashed border-white/5 rounded-[2.5rem]">
                <p className="text-zinc-600 italic">All operational loops have been resolved.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
