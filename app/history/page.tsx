"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { AppNav } from "@/components/app-nav";
import { Badge, Button, Input, Select } from "@/components/ui/primitives";
import {
  clearAllLocalSessions,
  getLocalHistoryServerSnapshot,
  getLocalHistorySnapshot,
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
        if (!cancelled) setHealth(null);
      }
    };
    loadHealth();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (health?.diagnostics.historyMode !== "db") return;
    let cancelled = false;
    const loadDbSessions = async () => {
      setLoadingDb(true);
      try {
        const query = new URLSearchParams();
        if (search.trim()) query.set("search", search.trim());
        query.set("mode", modeFilter);
        if (workspaceFilter.trim()) query.set("workspaceId", workspaceFilter.trim());

        const response = await fetch(`/api/history?${query.toString()}`, { cache: "no-store" });
        const payload = (await response.json()) as unknown;
        if (!response.ok) throw new Error("Could not fetch DB history.");
        const sessions = (payload as { sessions?: DbSessionSummary[] }).sessions;
        if (!cancelled) setDbSessions(Array.isArray(sessions) ? sessions : []);
      } catch {
        // Error is ignored as per task instruction to remove unused dbError
      } finally {
        if (!cancelled) setLoadingDb(false);
      }
    };
    loadDbSessions();
    return () => { cancelled = true; };
  }, [health?.diagnostics.historyMode, modeFilter, search, workspaceFilter]);

  const localRows = useMemo(() => {
    const all = localSessions.map((session) => toSessionSummary(session));
    return all.filter((session) => {
      const matchesMode = modeFilter === "all" || session.inputMode === modeFilter;
      const matchesWorkspace = !workspaceFilter || session.workspaceId === workspaceFilter;
      const q = search.trim().toLowerCase();
      const matchesSearch = !q || session.summarySnippet.toLowerCase().includes(q) || session.id.toLowerCase().includes(q);
      return matchesMode && matchesSearch && matchesWorkspace;
    });
  }, [localSessions, modeFilter, search, workspaceFilter]);

  const isDbMode = health?.diagnostics.historyMode === "db";
  const rows = (isDbMode ? dbSessions : localRows).sort(
    (a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)),
  );

  return (
    <div className="min-h-screen bg-black px-4 py-12 text-zinc-300 md:px-12">
      <div className="mx-auto max-w-[1400px]">
        <header className="mb-10 rounded-[2.5rem] border border-white/5 bg-white/[0.02] p-10 backdrop-blur-2xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-sky-400 mb-2">Archive</p>
              <h1 className="text-5xl font-bold tracking-tight text-white">Intelligence History</h1>
              <p className="mt-4 text-sm text-zinc-500 font-medium">
                {isDbMode ? "Cloud-synchronized session records" : "Local session archive (last 25 events)"}
              </p>
            </div>
            <AppNav current="history" />
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-[1fr_200px_250px]">
            <div className="relative group">
              <Input
                value={search}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                placeholder="Search summaries or session IDs..."
              />
            </div>
            <Select
              value={modeFilter}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setModeFilter(e.target.value as "all" | "voice" | "text")}
            >
              <option value="all">All Modes</option>
              <option value="voice">Voice</option>
              <option value="text">Text</option>
            </Select>
            <Input
              value={workspaceFilter}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWorkspaceFilter(e.target.value)}
              placeholder="Workspace ID"
            />
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 pt-8 border-t border-white/5">
            <div className="flex items-center gap-3">
              <Badge tone={isDbMode ? "info" : "neutral"}>Source: {isDbMode ? "db" : "local"}</Badge>
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">{rows.length} sessions detected</span>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/open-loops">
                <Button variant="secondary" size="sm">Review Open Loops</Button>
              </Link>
              {!isDbMode && (
                <Button variant="danger" size="sm" onClick={clearAllLocalSessions}>Purge Local Archive</Button>
              )}
            </div>
          </div>
        </header>

        {loadingDb && (
          <div className="text-center py-20 animate-pulse text-zinc-500">Retrieving intelligence from cloud...</div>
        )}

        <div className="rounded-[2.5rem] border border-white/5 bg-white/[0.01] overflow-hidden shadow-2xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.02]">
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Timestamp</th>
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Context</th>
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Insights</th>
                <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03]">
              {rows.length ? (
                rows.map((row) => (
                  <tr key={row.id} className="group hover:bg-white/[0.01] transition-colors">
                    <td className="px-8 py-6">
                      <p className="text-sm font-semibold text-zinc-300">{formatTimestamp(row.createdAt)}</p>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mt-1">{row.id.slice(0,8)}</p>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge tone="neutral" className="text-[9px]">{row.inputMode}</Badge>
                        <span className="text-[10px] text-zinc-500 font-medium">{presetLabel(row.presetId)}</span>
                      </div>
                      <p className="max-w-md text-sm text-zinc-400 line-clamp-2 leading-relaxed italic">
                        &quot;{row.summarySnippet}&quot;
                      </p>
                    </td>
                    <td className="px-8 py-6 text-center">
                      <span className="text-2xl font-bold tracking-tight text-white">{row.actionCount}</span>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-600 mt-1">Items</p>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link href={`/history/${row.id}`}>
                          <Button variant="primary" size="sm">Inspect</Button>
                        </Link>
                        {!isDbMode && (
                          <Button 
                            variant="secondary" 
                            size="sm" 
                            onClick={() => updateLocalSession(row.id, { pinned: !row.pinned })}
                          >
                            {row.pinned ? "Unpin" : "Pin"}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-8 py-32 text-center text-zinc-600 italic">
                    No intelligence records found in this environment.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
