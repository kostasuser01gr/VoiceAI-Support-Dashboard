"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { AppNav } from "@/components/app-nav";
import {
  Badge,
  Button,
  Card,
  Dropdown,
  Input,
  Tabs,
  Tooltip,
} from "@/components/ui/primitives";
import {
  getLocalHistoryServerSnapshot,
  getLocalHistorySnapshot,
  subscribeLocalHistory,
} from "@/lib/history";
import type { PresetId } from "@/lib/presets";
import { HealthResponseSchema, type HealthResponse } from "@/lib/schema";
import { toSessionSummary } from "@/lib/session";
import { defaultSessionReview } from "@/lib/session-meta";

type ReviewStatus = "pending" | "approved" | "executed";

type ActionBoardRow = {
  id: string;
  createdAt: string;
  workspaceId?: string;
  inputMode: "voice" | "text";
  summarySnippet: string;
  actionCount: number;
  presetId: PresetId;
  review: {
    emailApproved: boolean;
    tasksApproved: boolean;
    executed: boolean;
  };
  latestReviewerNote: string;
  latestEventTimestamp: string;
};

function toReviewStatus(review: ActionBoardRow["review"]): ReviewStatus {
  if (review.executed) {
    return "executed";
  }
  if (review.emailApproved && review.tasksApproved) {
    return "approved";
  }
  return "pending";
}

function formatTs(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

export default function ActionsPage() {
  const localSessions = useSyncExternalStore(
    subscribeLocalHistory,
    getLocalHistorySnapshot,
    getLocalHistoryServerSnapshot,
  );
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ReviewStatus | "all">("pending");
  const [rows, setRows] = useState<ActionBoardRow[]>([]);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

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
    const loadRows = async () => {
      setError("");
      try {
        const response = await fetch("/api/history?mode=all", { cache: "no-store" });
        const payload = (await response.json()) as {
          sessions?: Array<{
            id: string;
            createdAt: string;
            workspaceId?: string;
            summarySnippet: string;
            actionCount: number;
            inputMode: "voice" | "text";
            presetId: string;
            review?: {
              emailApproved: boolean;
              tasksApproved: boolean;
              executed?: boolean;
            };
            approvalEvents?: Array<{
              timestamp: string;
              note?: string;
            }>;
          }>;
          error?: { message?: string };
        };

        if (!response.ok || !Array.isArray(payload.sessions)) {
          throw new Error(payload.error?.message ?? "Failed to load actions.");
        }

        if (!cancelled) {
          setRows(
            payload.sessions.map((session) => {
              const latestEvent = Array.isArray(session.approvalEvents)
                ? [...session.approvalEvents]
                    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
                    .at(0)
                : undefined;

              return {
                id: session.id,
                createdAt: session.createdAt,
                workspaceId: session.workspaceId,
                inputMode: session.inputMode,
                summarySnippet: session.summarySnippet,
                actionCount: session.actionCount,
                presetId: session.presetId as ActionBoardRow["presetId"],
                review: {
                  emailApproved: Boolean(session.review?.emailApproved),
                  tasksApproved: Boolean(session.review?.tasksApproved),
                  executed: Boolean(session.review?.executed),
                },
                latestReviewerNote: latestEvent?.note?.trim() || "",
                latestEventTimestamp: latestEvent?.timestamp ?? session.createdAt,
              };
            }),
          );
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Could not load actions.");
        }
      }
    };

    loadRows();
    return () => {
      cancelled = true;
    };
  }, [historyMode]);

  const localRows = useMemo(
    () =>
      localSessions.map((session) => {
        const summary = toSessionSummary(session);
        const review = session.review ?? defaultSessionReview();
        return {
          ...summary,
          review: {
            emailApproved: review.emailApproved,
            tasksApproved: review.tasksApproved,
            executed: review.executed,
          },
          latestReviewerNote: review.comments[0] ?? "",
          latestEventTimestamp: session.approvalEvents[0]?.timestamp ?? session.createdAt,
        } satisfies ActionBoardRow;
      }),
    [localSessions],
  );

  const sourceRows = historyMode === "db" ? rows : localRows;

  const filteredRows = sourceRows.filter((row) => {
    const status = toReviewStatus(row.review);
    const matchStatus = statusFilter === "all" || status === statusFilter;
    const q = search.trim().toLowerCase();
    const matchSearch =
      !q ||
      row.summarySnippet.toLowerCase().includes(q) ||
      row.id.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  useEffect(() => {
    setSelectedIds((current) =>
      current.filter((id) => filteredRows.some((row) => row.id === id)),
    );
  }, [filteredRows]);

  const groupedCounts = useMemo(() => {
    return filteredRows.reduce(
      (acc, row) => {
        const status = toReviewStatus(row.review);
        acc[status] += 1;
        return acc;
      },
      {
        pending: 0,
        approved: 0,
        executed: 0,
      } as Record<ReviewStatus, number>,
    );
  }, [filteredRows]);

  const allVisibleSelected =
    filteredRows.length > 0 &&
    filteredRows.every((row) => selectedIds.includes(row.id));

  const selectedRows = filteredRows.filter((row) => selectedIds.includes(row.id));

  const toggleSelection = (id: string, next: boolean) => {
    setSelectedIds((current) => {
      if (next) {
        return [...new Set([...current, id])];
      }
      return current.filter((item) => item !== id);
    });
  };

  const toggleSelectAll = (next: boolean) => {
    if (!next) {
      setSelectedIds((current) =>
        current.filter((id) => !filteredRows.some((row) => row.id === id)),
      );
      return;
    }
    setSelectedIds((current) => [
      ...new Set([...current, ...filteredRows.map((row) => row.id)]),
    ]);
  };

  const copySelection = async () => {
    if (!selectedRows.length || typeof window === "undefined") {
      return;
    }

    const payload = selectedRows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      status: toReviewStatus(row.review),
      actionCount: row.actionCount,
      summarySnippet: row.summarySnippet,
    }));
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#d9f5ff_0%,#f5f9ff_35%,#f7f6ff_60%,#ffffff_100%)] px-4 py-6 text-slate-900 md:px-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="rounded-3xl border border-white/60 bg-white/80 p-5 shadow-[0_10px_40px_rgba(15,23,42,0.08)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl font-semibold">Action Board</h1>
              <p className="text-sm text-slate-600">
                Execution is blocked until tasks + email are approved.
              </p>
            </div>
            <AppNav current="actions" />
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-[1fr_180px]">
            <Input
              value={search}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)}
              placeholder="Search by summary or id"
            />
            <Dropdown
              value={statusFilter}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setStatusFilter(e.target.value as ReviewStatus | "all")}
              options={[
                { value: "pending", label: "Pending" },
                { value: "approved", label: "Approved" },
                { value: "executed", label: "Executed" },
                { value: "all", label: "All" },
              ]}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <Tabs
              activeTab={statusFilter}
              onChange={(value: string) =>
                setStatusFilter(value as ReviewStatus | "all")
              }
              tabs={[
                { value: "pending", label: "Pending", count: groupedCounts.pending },
                { value: "approved", label: "Approved", count: groupedCounts.approved },
                { value: "executed", label: "Executed", count: groupedCounts.executed },
                { value: "all", label: "All", count: filteredRows.length },
              ]}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Tooltip label="Copy selected rows JSON for external review">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!selectedRows.length}
                  onClick={copySelection}
                >
                  Bulk export
                </Button>
              </Tooltip>
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
        </header>

        {error && (
          <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}

        <Card className="space-y-3 p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 text-xs text-slate-600">
            <p>
              Grouped by review status with timestamped reviewer events and bulk export.
            </p>
            <Badge tone={selectedRows.length ? "info" : "neutral"}>
              Selected: {selectedRows.length}
            </Badge>
          </div>
          <div className="overflow-x-auto rounded-b-2xl">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="px-4 py-3 font-semibold">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={(event) => toggleSelectAll(event.target.checked)}
                    aria-label="Select all visible sessions"
                  />
                </th>
                <th className="px-4 py-3 font-semibold">Timestamp</th>
                <th className="px-4 py-3 font-semibold">Mode</th>
                <th className="px-4 py-3 font-semibold">Summary</th>
                <th className="px-4 py-3 font-semibold">Tasks</th>
                <th className="px-4 py-3 font-semibold">Approval</th>
                <th className="px-4 py-3 font-semibold">Latest Note</th>
                <th className="px-4 py-3 font-semibold">Last Event</th>
                <th className="px-4 py-3 font-semibold">Open</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length ? (
                filteredRows.map((row) => {
                  const status = toReviewStatus(row.review);
                  return (
                    <tr key={row.id} className="border-t border-slate-200">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(row.id)}
                          onChange={(event) => toggleSelection(row.id, event.target.checked)}
                          aria-label={`Select ${row.id}`}
                        />
                      </td>
                      <td className="px-4 py-3">{formatTs(row.createdAt)}</td>
                      <td className="px-4 py-3 uppercase">{row.inputMode}</td>
                      <td className="max-w-md truncate px-4 py-3">{row.summarySnippet}</td>
                      <td className="px-4 py-3">{row.actionCount}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-2">
                          <span className="text-xs text-slate-500">group:</span>
                          <Badge
                            tone={
                              status === "executed"
                                ? "neutral"
                                : status === "approved"
                                  ? "success"
                                  : "warning"
                            }
                          >
                          {status}
                          </Badge>
                        </span>
                      </td>
                      <td className="max-w-xs truncate px-4 py-3 text-xs text-slate-600">
                        {row.latestReviewerNote || "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {formatTs(row.latestEventTimestamp)}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/history/${row.id}`}
                          className="rounded-lg border border-cyan-300 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-900"
                        >
                          Open session
                        </Link>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                    No action rows found for this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </Card>
      </div>
    </div>
  );
}
