"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { ErrorBoundary } from "@/components/error-boundary";
import { VoiceActionDashboard } from "@/components/voice-action-dashboard";
import { Button } from "@/components/ui/primitives";
import {
  getLocalHistoryServerSnapshot,
  getLocalHistorySnapshot,
  subscribeLocalHistory,
  type StoredSession,
} from "@/lib/history";
import { DEFAULT_PRESET_ID, type PresetId } from "@/lib/presets";
import { HealthResponseSchema, type HealthResponse, type ProcessResponse } from "@/lib/schema";
import { defaultSessionReview } from "@/lib/session-meta";

export default function HistoryDetailPage() {
  const params = useParams<{ id: string }>();
  const sessionId = params?.id;
  const localSessions = useSyncExternalStore(
    subscribeLocalHistory,
    getLocalHistorySnapshot,
    getLocalHistoryServerSnapshot,
  );

  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [dbSession, setDbSession] = useState<StoredSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
    if (!sessionId || health?.diagnostics.historyMode !== "db") {
      return;
    }

    let cancelled = false;

    const loadDbSession = async () => {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(`/api/history/${sessionId}`, { cache: "no-store" });
        const payload = (await response.json()) as {
          session?: {
            id: string;
            createdAt: string;
            workspaceId?: string;
            userId?: string;
            presetId?: string;
            review?: StoredSession["review"];
            analysis?: StoredSession["analysis"];
            approvalEvents?: StoredSession["approvalEvents"];
            data: ProcessResponse;
          };
          error?: { message?: string };
        };

        if (!response.ok || !payload.session) {
          throw new Error(payload.error?.message ?? "Session not found.");
        }

        if (!cancelled) {
          setDbSession({
            id: payload.session.id,
            createdAt: payload.session.createdAt,
            workspaceId: payload.session.workspaceId ?? "default-workspace",
            presetId: (payload.session.presetId ?? DEFAULT_PRESET_ID) as PresetId,
            pinned: false,
            tags: [],
            review: payload.session.review ?? defaultSessionReview(),
            analysis: payload.session.analysis ?? {
              index: { entities: [], topics: [], urgency: "low", sentiment: "neutral", openLoops: [], openLoopsCount: 0 },
              verifier: { ok: true, score: 100, flags: [], policy: "warn" },
            },
            approvalEvents: payload.session.approvalEvents ?? [],
            data: payload.session.data,
          });
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "Failed to load session.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadDbSession();

    return () => {
      cancelled = true;
    };
  }, [health?.diagnostics.historyMode, sessionId]);

  const localSession = useMemo(() => {
    if (!sessionId) {
      return null;
    }

    return localSessions.find((session) => session.id === sessionId) ?? null;
  }, [localSessions, sessionId]);

  if (!sessionId) {
    return <div className="p-12 text-zinc-500 font-medium uppercase tracking-widest text-[10px]">Missing protocol identifier.</div>;
  }

  if (health?.diagnostics.historyMode === "db") {
    if (loading) {
      return (
        <div className="min-h-screen bg-black flex items-center justify-center">
          <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-sky-400 animate-pulse">
            Retrieving Intelligence...
          </div>
        </div>
      );
    }

    if (!dbSession) {
      return (
        <div className="min-h-screen bg-black px-4 py-24">
          <div className="mx-auto max-w-xl rounded-[2.5rem] border border-white/5 bg-white/[0.02] p-12 text-center backdrop-blur-3xl">
            <h1 className="text-3xl font-bold tracking-tight text-white">Registry Miss</h1>
            <p className="mt-4 text-sm text-zinc-500 leading-relaxed">{error || "The requested intelligence sequence could not be found."}</p>
            <Link href="/history">
              <Button variant="secondary" className="mt-8 px-8">Return to Archive</Button>
            </Link>
          </div>
        </div>
      );
    }

    return (
      <ErrorBoundary>
        <VoiceActionDashboard key={dbSession.id} initialSession={dbSession} />
      </ErrorBoundary>
    );
  }

  if (!localSession) {
    return (
      <div className="min-h-screen bg-black px-4 py-24">
        <div className="mx-auto max-w-xl rounded-[2.5rem] border border-white/5 bg-white/[0.02] p-12 text-center backdrop-blur-3xl">
          <h1 className="text-3xl font-bold tracking-tight text-white">Registry Miss</h1>
          <p className="mt-4 text-sm text-zinc-500 leading-relaxed">
            This localized intelligence packet is no longer available in the browser storage registry.
          </p>
          <Link href="/history">
            <Button variant="secondary" className="mt-8 px-8">Return to Archive</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <VoiceActionDashboard key={localSession.id} initialSession={localSession} />
    </ErrorBoundary>
  );
}
