"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { AppNav } from "@/components/app-nav";
import { Badge, Button, Card, Input, Select } from "@/components/ui/primitives";
import {
  clearAllLocalSessions,
  getLocalHistoryServerSnapshot,
  getLocalHistorySnapshot,
  removeLocalSession,
  subscribeLocalHistory,
  updateLocalSession,
} from "@/lib/history";
import { PRESETS } from "@/lib/presets";
import { HealthResponseSchema, type HealthResponse } from "@/lib/schema";
import { toSessionSummary, type SessionSummary } from "@/lib/session";

type DbSessionSummary = SessionSummary;

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return date.toLocaleString();
}

function presetLabel(id: string) {
  return PRESETS.find((preset) => preset.id === id)?.label ?? id;
}

export default function HistoryPage() {
  const localSessions = useSyncExternalStore(
    subscribeLocalHistory,
    getLocalHistorySnapshot,
    getLocalHistoryServerSnapshot,
  );

  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [search, setSearch] = useState("");
  const [modeFilter, setModeFilter] = useState<"all" | "voice" | "text">("all");
  const [workspaceFilter, setWorkspaceFilter] = useState("default-workspace");
  const [dbSessions, setDbSessions] = useState<DbSessionSummary[]>([]);
  const [loadingDb, setLoadingDb] = useState(false);
  const [dbError, setDbError] = useState("");

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
    if (health?.diagnostics.historyMode !== "db") {
      return;
    }

    let cancelled = false;

    const loadDbSessions = async () => {
      setLoadingDb(true);
      setDbError("");

      try {
        const query = new URLSearchParams();
        if (search.trim()) {
          query.set("search", search.trim());
        }
        query.set("mode", modeFilter);
        if (workspaceFilter.trim()) {
          query.set("workspaceId", workspaceFilter.trim());
        }

        const response = await fetch(`/api/history?${query.toString()}`, {
          cache: "no-store",
        });

        const payload = (await response.json()) as unknown;
        if (!response.ok) {
          throw new Error("Could not fetch DB history.");
        }

        const sessions = (payload as { sessions?: DbSessionSummary[] }).sessions;
        if (!cancelled) {
          setDbSessions(Array.isArray(sessions) ? sessions : []);
        }
      } catch {
        if (!cancelled) {
          setDbError("Could not fetch DB history sessions.");
        }
      } finally {
        if (!cancelled) {
          setLoadingDb(false);
        }
      }
    };

    loadDbSessions();

    return () => {
      cancelled = true;
    };
  }, [health?.diagnostics.historyMode, modeFilter, search, workspaceFilter]);

  const localRows = useMemo(() => {
    const all = localSessions.map((session) => toSessionSummary(session));

    return all.filter((session) => {
      const matchesMode = modeFilter === "all" || session.inputMode === modeFilter;
      const matchesWorkspace = !workspaceFilter || session.workspaceId === workspaceFilter;
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        session.summarySnippet.toLowerCase().includes(q) ||
        session.id.toLowerCase().includes(q);

      return matchesMode && matchesSearch && matchesWorkspace;
    });
  }, [localSessions, modeFilter, search, workspaceFilter]);

  const isDbMode = health?.diagnostics.historyMode === "db";
  const rows = (isDbMode ? dbSessions : localRows).sort(
    (a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)),
  );

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#d9f5ff_0%,#f5f9ff_35%,#f7f6ff_60%,#ffffff_100%)] px-4 py-6 text-slate-900 md:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-5 rounded-3xl border border-white/60 bg-white/80 p-5 shadow-[0_10px_40px_rgba(15,23,42,0.08)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl font-semibold">History</h1>
              <p className="text-sm text-slate-600">
                {isDbMode
                  ? "Database-backed sessions"
                  : "Local browser sessions (last 25)"}
              </p>
            </div>
            <AppNav current="history" />
          </div>

          <div className="mt-4 grid gap-2 md:grid-cols-[1fr_170px_220px]">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search summary or ID"
            />
            <Select
              value={modeFilter}
              onChange={(event) =>
                setModeFilter(event.target.value as "all" | "voice" | "text")
              }
            >
              <option value="all">All modes</option>
              <option value="voice">Voice</option>
              <option value="text">Text</option>
            </Select>
            <Input
              value={workspaceFilter}
              onChange={(event) => setWorkspaceFilter(event.target.value)}
              placeholder="Workspace ID"
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={isDbMode ? "info" : "neutral"}>
                Source: {isDbMode ? "db" : "local"}
              </Badge>
              <Badge tone="neutral">Rows: {rows.length}</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/history/compare">
                <Button variant="secondary" size="sm">
                  Compare
                </Button>
              </Link>
              <Link href="/open-loops">
                <Button variant="secondary" size="sm">
                  Open loops
                </Button>
              </Link>
            </div>
          </div>
          {!isDbMode && (
            <div className="mt-2">
              <Button variant="danger" size="sm" onClick={clearAllLocalSessions}>
                Clear local history
              </Button>
            </div>
          )}
        </header>

        {(dbError || loadingDb) && isDbMode && (
          <div className="mb-4 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700">
            {loadingDb ? "Loading DB history..." : dbError}
          </div>
        )}

        <Card className="overflow-x-auto rounded-2xl border border-white/60 bg-white/85 p-0 shadow-[0_8px_32px_rgba(15,23,42,0.08)]">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="px-4 py-3 font-semibold">Timestamp</th>
                <th className="px-4 py-3 font-semibold">Mode</th>
                <th className="px-4 py-3 font-semibold">Preset</th>
                <th className="px-4 py-3 font-semibold">Summary</th>
                <th className="px-4 py-3 font-semibold">Action Count</th>
                <th className="px-4 py-3 font-semibold">Tags</th>
                <th className="px-4 py-3 font-semibold">Open</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-200">
                    <td className="px-4 py-3">{formatTimestamp(row.createdAt)}</td>
                    <td className="px-4 py-3 uppercase">{row.inputMode}</td>
                    <td className="px-4 py-3">{presetLabel(row.presetId)}</td>
                    <td className="max-w-sm truncate px-4 py-3">{row.summarySnippet}</td>
                    <td className="px-4 py-3">{row.actionCount}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(row.tags ?? []).slice(0, 3).map((tag) => (
                          <span
                            key={`${row.id}-${tag}`}
                            className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700"
                          >
                            {tag}
                          </span>
                        ))}
                        {!(row.tags ?? []).length && (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <Link
                          href={`/history/${row.id}`}
                          className="rounded-lg border border-cyan-300 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-900"
                        >
                          View
                        </Link>
                        <Link
                          href={`/?from=${row.id}`}
                          className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-900"
                        >
                          Regenerate
                        </Link>
                        {!isDbMode && (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                updateLocalSession(row.id, { pinned: !row.pinned })
                              }
                              className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-1"
                            >
                              {row.pinned ? "Unpin" : "Pin"}
                            </button>
                            <button
                              type="button"
                              onClick={() => removeLocalSession(row.id)}
                              className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-1"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                    No sessions found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
