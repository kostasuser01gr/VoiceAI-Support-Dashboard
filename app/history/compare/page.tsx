"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { AppNav } from "@/components/app-nav";
import { Badge, Button, Card, Input, Toast } from "@/components/ui/primitives";
import {
  getLocalHistoryServerSnapshot,
  getLocalHistorySnapshot,
  subscribeLocalHistory,
} from "@/lib/history";
import { HealthResponseSchema, type HealthResponse } from "@/lib/schema";

type CompareResult = {
  summaryChanged: boolean;
  actionCountDelta: number;
  topicsA: string[];
  topicsB: string[];
  urgencyA: "low" | "medium" | "high";
  urgencyB: "low" | "medium" | "high";
  verifierScoreA: number | null;
  verifierScoreB: number | null;
};

export default function HistoryComparePage() {
  const localSessions = useSyncExternalStore(
    subscribeLocalHistory,
    getLocalHistorySnapshot,
    getLocalHistoryServerSnapshot,
  );
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [idA, setIdA] = useState("");
  const [idB, setIdB] = useState("");
  const [result, setResult] = useState<CompareResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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

  const localComparison = useMemo(() => {
    if (!idA || !idB) {
      return null;
    }

    const a = localSessions.find((session) => session.id === idA);
    const b = localSessions.find((session) => session.id === idB);
    if (!a || !b) {
      return null;
    }

    return {
      summaryChanged: a.data.summary !== b.data.summary,
      actionCountDelta:
        b.data.actions.taskList.length - a.data.actions.taskList.length,
      topicsA: a.analysis.index.topics,
      topicsB: b.analysis.index.topics,
      urgencyA: a.analysis.index.urgency,
      urgencyB: b.analysis.index.urgency,
      verifierScoreA: a.analysis.verifier.score,
      verifierScoreB: b.analysis.verifier.score,
    } satisfies CompareResult;
  }, [idA, idB, localSessions]);

  const runCompare = async () => {
    setError("");
    setResult(null);

    if (!idA.trim() || !idB.trim()) {
      setError("Provide both session IDs.");
      return;
    }

    if (historyMode !== "db") {
      if (!localComparison) {
        setError("Local sessions not found for selected IDs.");
        return;
      }
      setResult(localComparison);
      return;
    }

    setLoading(true);
    try {
      const query = new URLSearchParams({
        idA: idA.trim(),
        idB: idB.trim(),
      });
      const response = await fetch(`/api/history/compare?${query.toString()}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        comparison?: CompareResult;
        error?: { message?: string };
      };
      if (!response.ok || !payload.comparison) {
        throw new Error(payload.error?.message ?? "Compare request failed.");
      }
      setResult(payload.comparison);
    } catch (compareError) {
      setError(compareError instanceof Error ? compareError.message : "Compare failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#d9f5ff_0%,#f5f9ff_35%,#f7f6ff_60%,#ffffff_100%)] px-4 py-6 text-slate-900 md:px-8">
      <div className="mx-auto max-w-4xl space-y-5">
        <header className="rounded-3xl border border-white/60 bg-white/80 p-5 shadow-[0_10px_40px_rgba(15,23,42,0.08)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl font-semibold">History Compare</h1>
              <p className="text-sm text-slate-600">
                Compare two sessions for summary, action, topic, urgency, and verifier deltas.
              </p>
            </div>
            <AppNav current="history" />
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
            <Input
              value={idA}
              onChange={(event) => setIdA(event.target.value)}
              placeholder="Session ID A"
            />
            <Input
              value={idB}
              onChange={(event) => setIdB(event.target.value)}
              placeholder="Session ID B"
            />
            <Button
              variant="primary"
              onClick={runCompare}
              disabled={loading}
            >
              Compare
            </Button>
          </div>
          <div className="mt-3">
            <Badge tone="neutral">Mode: {historyMode}</Badge>
          </div>
        </header>

        {error && (
          <Toast tone="danger">
            {error}
          </Toast>
        )}

        {result && (
          <Card className="rounded-2xl border border-white/60 bg-white/85 p-5 shadow-[0_8px_32px_rgba(15,23,42,0.08)]">
            <h2 className="text-lg font-semibold">Comparison Result</h2>
            <dl className="mt-3 grid gap-2 text-sm md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <dt className="font-semibold text-slate-700">Summary Changed</dt>
                <dd>{result.summaryChanged ? "Yes" : "No"}</dd>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <dt className="font-semibold text-slate-700">Action Count Delta</dt>
                <dd>{result.actionCountDelta}</dd>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <dt className="font-semibold text-slate-700">Topics A</dt>
                <dd>{result.topicsA.length ? result.topicsA.join(", ") : "none"}</dd>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <dt className="font-semibold text-slate-700">Topics B</dt>
                <dd>{result.topicsB.length ? result.topicsB.join(", ") : "none"}</dd>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <dt className="font-semibold text-slate-700">Urgency A / B</dt>
                <dd>
                  {result.urgencyA} / {result.urgencyB}
                </dd>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <dt className="font-semibold text-slate-700">Verifier Scores A / B</dt>
                <dd>
                  {result.verifierScoreA ?? "-"} / {result.verifierScoreB ?? "-"}
                </dd>
              </div>
            </dl>
          </Card>
        )}
      </div>
    </div>
  );
}
