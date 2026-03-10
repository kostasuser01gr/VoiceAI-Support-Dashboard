"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { AppNav } from "@/components/app-nav";
import { Badge, Card } from "@/components/ui/primitives";
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
  if (Number.isNaN(date.getTime())) {
    return value;
  }

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
        if (!cancelled && parsed.success) {
          setHealth(parsed.data);
        }
      } catch {
        if (!cancelled) {
          setHealth(null);
        }
      }
    };

    loadHealth();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (historyMode !== "db") {
      return;
    }

    let cancelled = false;
    const loadLoops = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/open-loops", { cache: "no-store" });
        const payload = (await response.json()) as {
          loops?: DbLoop[];
          error?: { message?: string };
        };
        if (!response.ok || !Array.isArray(payload.loops)) {
          throw new Error(payload.error?.message ?? "Could not load open loops.");
        }
        if (!cancelled) {
          setDbLoops(payload.loops);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Could not load loops.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadLoops();
    return () => {
      cancelled = true;
    };
  }, [historyMode]);

  const localLoops = useMemo(() => {
    return localSessions.flatMap((session) => {
      if (session.review.executed) {
        return [];
      }

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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#d9f5ff_0%,#f5f9ff_35%,#f7f6ff_60%,#ffffff_100%)] px-4 py-6 text-slate-900 md:px-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="rounded-3xl border border-white/60 bg-white/80 p-5 shadow-[0_10px_40px_rgba(15,23,42,0.08)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl font-semibold">Open Loops</h1>
              <p className="text-sm text-slate-600">
                Unresolved task loops derived from session history.
              </p>
            </div>
            <AppNav />
          </div>
          <div className="mt-3">
            <Badge tone="neutral">Loops: {loops.length}</Badge>
          </div>
        </header>

        {error && (
          <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-xl border border-slate-300 bg-white px-4 py-4 text-sm text-slate-600">
            Loading open loops...
          </div>
        ) : (
          <Card className="overflow-x-auto rounded-2xl border border-white/60 bg-white/85 p-0 shadow-[0_8px_32px_rgba(15,23,42,0.08)]">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <th className="px-4 py-3 font-semibold">Created</th>
                  <th className="px-4 py-3 font-semibold">Urgency</th>
                  <th className="px-4 py-3 font-semibold">Task</th>
                  <th className="px-4 py-3 font-semibold">Session</th>
                </tr>
              </thead>
              <tbody>
                {loops.length ? (
                  loops.map((item, index) => (
                    <tr
                      key={`${item.sessionId}-${index}`}
                      className="border-t border-slate-200"
                    >
                      <td className="px-4 py-3">{formatTs(item.createdAt)}</td>
                      <td className="px-4 py-3 uppercase">{item.urgency}</td>
                      <td className="max-w-xl truncate px-4 py-3">{item.task}</td>
                      <td className="px-4 py-3">
                        <a
                          href={`/history/${item.sessionId}`}
                          className="rounded-lg border border-cyan-300 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-900"
                        >
                          Open
                        </a>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                      No open loops found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}
