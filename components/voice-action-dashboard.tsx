"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { AppNav } from "@/components/app-nav";
import { Badge, Button, Card, Dialog } from "@/components/ui/primitives";
import { buildJsonExport, buildMarkdownExport, buildTextExport } from "@/lib/export";
import {
  getLocalHistoryServerSnapshot,
  getLocalHistorySnapshot,
  getLocalSessionById,
  pruneLocalSessions,
  saveLocalSession,
  subscribeLocalHistory,
  updateLocalSession,
  type StoredSession,
} from "@/lib/history";
import { normalizeLanguage, t } from "@/lib/i18n";
import { deriveTranscriptInsights } from "@/lib/intelligence";
import { DEFAULT_PRESET_ID, PRESETS, type PresetId } from "@/lib/presets";
import type { PublicConfig } from "@/lib/publicConfig";
import { safeFetchJson } from "@/lib/safeFetch";
import { defaultSessionReview, makeApprovalPayloadHash } from "@/lib/session-meta";
import {
  getUserSettingsServerSnapshot,
  getUserSettingsSnapshot,
  patchUserSettings,
  subscribeUserSettings,
} from "@/lib/userSettings";
import {
  ApiErrorSchema,
  HealthResponseSchema,
  type HealthResponse,
  type InputMode,
  type ProcessResponse,
  ProcessResponseSchema,
} from "@/lib/schema";

type RecognitionEventLike = {
  results: ArrayLike<{
    0: {
      transcript: string;
    };
  }>;
};

type RecognitionErrorLike = {
  error?: string;
};

type RecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: RecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
};

type RecognitionConstructor = new () => RecognitionInstance;

type Toast = {
  type: "success" | "error";
  message: string;
};

type SessionIdentity = {
  name: string;
  email: string;
  workspaceId: string;
  role: "owner" | "admin" | "agent" | "viewer";
};

type VoiceActionDashboardProps = {
  initialSession?: StoredSession | null;
  publicConfig?: PublicConfig;
};

const SAMPLE_SCRIPT = `Hi team, quick standup update. We finished the onboarding tooltip flow and fixed the profile save bug. Priya will ship analytics tracking by Thursday. I will prepare release notes and share them by Friday noon. Please schedule a 20-minute QA sync tomorrow morning, and send the customer success team a short status email after that meeting.`;

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return date.toLocaleString();
}

function createSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function defaultAnalysis() {
  return {
    index: {
      entities: [],
      topics: [],
      urgency: "low" as const,
      sentiment: "neutral" as const,
      openLoops: [],
      openLoopsCount: 0,
    },
    verifier: {
      ok: true,
      score: 100,
      flags: [],
      policy: "warn" as const,
    },
  };
}

function emptyStateIllustration() {
  return (
    <div className="flex items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
      <div className="w-full max-w-xs">
        <div className="mb-3 h-5 w-24 rounded bg-slate-200" />
        <div className="mb-2 h-3 w-full rounded bg-slate-200" />
        <div className="mb-4 h-3 w-10/12 rounded bg-slate-200" />
        <div className="grid grid-cols-3 gap-2">
          <div className="h-10 rounded-xl bg-cyan-200" />
          <div className="h-10 rounded-xl bg-indigo-200" />
          <div className="h-10 rounded-xl bg-emerald-200" />
        </div>
      </div>
    </div>
  );
}

function SkeletonCard({ title }: { title: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-400">
        {title}
      </h3>
      <div className="mt-3 animate-pulse space-y-2">
        <div className="h-3 w-full rounded bg-slate-200" />
        <div className="h-3 w-11/12 rounded bg-slate-200" />
        <div className="h-3 w-9/12 rounded bg-slate-200" />
      </div>
    </div>
  );
}

export function VoiceActionDashboard({
  initialSession = null,
  publicConfig,
}: VoiceActionDashboardProps) {
  const recognitionRef = useRef<RecognitionInstance | null>(null);
  const localHistory = useSyncExternalStore(
    subscribeLocalHistory,
    getLocalHistorySnapshot,
    getLocalHistoryServerSnapshot,
  );
  const userSettings = useSyncExternalStore(
    subscribeUserSettings,
    getUserSettingsSnapshot,
    getUserSettingsServerSnapshot,
  );

  const [inputMode, setInputMode] = useState<InputMode>(
    initialSession?.data.inputMode ?? "text",
  );
  const [typedText, setTypedText] = useState(initialSession?.data.transcript ?? "");
  const [liveTranscript, setLiveTranscript] = useState(
    initialSession?.data.transcript ?? "",
  );
  const [result, setResult] = useState<ProcessResponse | null>(
    initialSession?.data ?? null,
  );
  const [editableEmailDraft, setEditableEmailDraft] = useState(
    initialSession?.data.actions.emailDraft ?? "",
  );
  const [selectedPresetId, setSelectedPresetId] = useState<PresetId>(
    initialSession?.presetId ?? userSettings.defaultPreset ?? DEFAULT_PRESET_ID,
  );
  const [speechSupported, setSpeechSupported] = useState(false);
  const [micPermission, setMicPermission] = useState<
    "unknown" | "granted" | "denied" | "prompt" | "unsupported"
  >("unknown");
  const [isListening, setIsListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [errorAuditTrail, setErrorAuditTrail] = useState<ProcessResponse["auditTrail"]>(
    [],
  );
  const [toast, setToast] = useState<Toast | null>(null);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState("");
  const [sessionIdentity, setSessionIdentity] = useState<SessionIdentity>({
    name: "Demo User",
    email: "demo@voice-action.local",
    workspaceId: initialSession?.workspaceId ?? userSettings.workspaceId,
    role: "owner",
  });
  const [review, setReview] = useState(initialSession?.review ?? defaultSessionReview());
  const [analysis, setAnalysis] = useState(initialSession?.analysis ?? defaultAnalysis());
  const [approvalEvents, setApprovalEvents] = useState(
    initialSession?.approvalEvents ?? [],
  );
  const [activeLocalSessionId, setActiveLocalSessionId] = useState<string | null>(
    initialSession?.id ?? null,
  );
  const [activeServerSessionId, setActiveServerSessionId] = useState<string | null>(
    initialSession?.id ?? null,
  );
  const [newComment, setNewComment] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookStatus, setWebhookStatus] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadHealth = async () => {
      const response = await safeFetchJson<unknown>("/api/health", {
        cache: "no-store",
        timeoutMs: 10000,
      });
      if (cancelled) {
        return;
      }

      if (!response.ok) {
        setHealthError("Could not load diagnostics.");
        return;
      }

      const parsed = HealthResponseSchema.safeParse(response.data);
      if (parsed.success) {
        setHealth(parsed.data);
        setHealthError("");
      } else {
        setHealthError("Diagnostics unavailable.");
      }
    };

    loadHealth();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadSessionIdentity = async () => {
      const response = await safeFetchJson<{ session?: SessionIdentity }>("/api/me", {
        cache: "no-store",
        timeoutMs: 10000,
      });
      if (cancelled) {
        return;
      }

      if (response.ok && response.data.session) {
        setSessionIdentity(response.data.session);
        return;
      }

      setSessionIdentity((previous) => ({
        ...previous,
        workspaceId: userSettings.workspaceId,
      }));
    };

    loadSessionIdentity();

    return () => {
      cancelled = true;
    };
  }, [userSettings.workspaceId]);

  useEffect(() => {
    if (initialSession) {
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    const from = new URLSearchParams(window.location.search).get("from");
    if (!from) {
      return;
    }

    const source = getLocalSessionById(from);
    if (!source) {
      return;
    }

    setResult(source.data);
    setEditableEmailDraft(source.data.actions.emailDraft);
    setLiveTranscript(source.data.transcript);
    setTypedText(source.data.transcript);
    setSelectedPresetId(source.presetId);
    setReview(source.review);
    setAnalysis(source.analysis);
    setApprovalEvents(source.approvalEvents);
    setActiveLocalSessionId(source.id);
    setActiveServerSessionId(source.id);
    setToast({ type: "success", message: "Loaded session for regeneration." });
  }, [initialSession]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const speechWindow = window as Window & {
      SpeechRecognition?: RecognitionConstructor;
      webkitSpeechRecognition?: RecognitionConstructor;
    };

    const Constructor =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;

    if (!Constructor) {
      setSpeechSupported(false);
      setMicPermission("unsupported");
      setInputMode("text");
      return;
    }

    setSpeechSupported(true);

    const recognition = new Constructor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = userSettings.language || "en-US";

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((entry) => entry[0]?.transcript ?? "")
        .join(" ")
        .trim();

      setLiveTranscript(transcript);
      setTypedText(transcript);
    };

    recognition.onerror = (event) => {
      const message = event.error
        ? `Voice capture error (${event.error}). Switched to text fallback.`
        : "Voice capture error. Switched to text fallback.";
      setErrorMessage(message);
      setInputMode("text");
      setIsListening(false);
      setToast({ type: "error", message });
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    if (typeof navigator !== "undefined" && "permissions" in navigator) {
      navigator.permissions
        .query({ name: "microphone" as PermissionName })
        .then((status) => {
          setMicPermission(status.state);
          status.onchange = () => setMicPermission(status.state);
        })
        .catch(() => setMicPermission("unknown"));
    }

    return () => {
      recognition.stop();
      recognitionRef.current = null;
    };
  }, [userSettings.language]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    pruneLocalSessions(userSettings.retentionDays);
  }, [userSettings.retentionDays]);

  const transcriptPreview = useMemo(() => {
    if (result?.transcript) {
      return result.transcript;
    }

    return liveTranscript;
  }, [liveTranscript, result?.transcript]);

  const outputAuditTrail = result?.auditTrail?.length ? result.auditTrail : errorAuditTrail;
  const language = normalizeLanguage(userSettings.language);
  const insights = useMemo(
    () =>
      deriveTranscriptInsights(
        result?.transcript ?? typedText,
        result?.actions.taskList ?? [],
      ),
    [result?.actions.taskList, result?.transcript, typedText],
  );

  const status = useMemo(() => {
    if (errorMessage) {
      return "Error";
    }

    if (loading) {
      return "Processing";
    }

    if (isListening) {
      return "Listening";
    }

    return "Idle";
  }, [errorMessage, isListening, loading]);

  const statusPillClass =
    status === "Listening"
      ? "bg-emerald-100 text-emerald-700"
      : status === "Processing"
        ? "bg-cyan-100 text-cyan-700"
        : status === "Error"
          ? "bg-rose-100 text-rose-700"
          : "bg-slate-100 text-slate-700";

  const demoSafeEnabled =
    health?.diagnostics.demoSafeMode ?? publicConfig?.demoSafeMode ?? false;
  const geminiConfigured =
    health?.diagnostics.geminiKeyPresent ?? publicConfig?.geminiConfigured ?? false;
  const processingDisabled = loading || (!geminiConfigured && !demoSafeEnabled) || Boolean(healthError);
  const localizedStatus =
    status === "Listening"
      ? t(language, "listening")
      : status === "Processing"
        ? t(language, "processing")
        : status === "Error"
          ? t(language, "error")
          : t(language, "idle");

  const markdownExport = result ? buildMarkdownExport(result) : "";
  const jsonExport = result ? buildJsonExport(result) : "";
  const textExport = result ? buildTextExport(result) : "";

  const showToast = (type: Toast["type"], message: string) => {
    setToast({ type, message });
  };

  const startListening = () => {
    if (!recognitionRef.current) {
      setInputMode("text");
      setErrorMessage("Web Speech API is unavailable. Using text fallback.");
      showToast("error", "Web Speech API unavailable.");
      return;
    }

    setInputMode("voice");
    setErrorMessage("");
    setErrorAuditTrail([]);
    recognitionRef.current.start();
    setIsListening(true);
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setIsListening(false);
  };

  const clearAll = () => {
    setTypedText("");
    setLiveTranscript("");
    setResult(null);
    setEditableEmailDraft("");
    setShareUrl("");
    setWebhookStatus("");
    setErrorMessage("");
    setErrorAuditTrail([]);
    setActiveLocalSessionId(null);
    setActiveServerSessionId(null);
    setReview(defaultSessionReview());
    setAnalysis(defaultAnalysis());
    setApprovalEvents([]);
  };

  const copyText = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast("success", `${label} copied.`);
    } catch {
      showToast("error", `Failed to copy ${label.toLowerCase()}.`);
    }
  };

  const downloadFile = (filename: string, content: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const openPrintView = () => {
    window.print();
  };

  const generateShareLink = async () => {
    if (!result) {
      return;
    }

    const sessionPayload: StoredSession = {
      id: createSessionId(),
      createdAt: new Date().toISOString(),
      workspaceId: sessionIdentity.workspaceId,
      presetId: selectedPresetId,
      pinned: false,
      tags: [],
      review,
      analysis,
      approvalEvents,
      data: result,
    };

    try {
      const response = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sessionPayload),
      });
      const payload = (await response.json()) as { token?: string };
      if (!response.ok || !payload.token) {
        throw new Error("Could not generate share link.");
      }

      const base = window.location.origin;
      const nextUrl = `${base}/share/${payload.token}`;
      setShareUrl(nextUrl);
      await navigator.clipboard.writeText(nextUrl);
      showToast("success", "Share link generated and copied.");
    } catch {
      showToast("error", "Failed to generate share link.");
    }
  };

  const sendWebhook = async () => {
    if (!result || !webhookUrl.trim()) {
      setWebhookStatus("Enter a public HTTPS webhook URL first.");
      return;
    }

    setWebhookStatus("Sending webhook...");
    try {
      const response = await fetch("/api/export/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: webhookUrl.trim(),
          session: result,
        }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        status?: number;
        error?: { message?: string };
      };

      if (!response.ok) {
        setWebhookStatus(payload.error?.message ?? "Webhook send failed.");
        return;
      }

      setWebhookStatus(`Webhook delivered with status ${payload.status ?? "unknown"}.`);
      showToast("success", "Webhook delivered.");
    } catch {
      setWebhookStatus("Webhook send failed due to network error.");
    }
  };

  const processInput = async (mode: InputMode) => {
    const text =
      mode === "voice" ? liveTranscript.trim() || typedText.trim() : typedText.trim();

    if (!text) {
      setErrorMessage("Transcript is empty. Add text or capture voice first.");
      showToast("error", "Transcript is empty.");
      return;
    }

    if (!geminiConfigured && !demoSafeEnabled) {
      const message = "GEMINI_API_KEY is missing. Processing is disabled.";
      setErrorMessage(message);
      showToast("error", message);
      return;
    }

    setLoading(true);
    setErrorMessage("");
    setErrorAuditTrail([]);

    try {
      const response = await fetch("/api/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-store-history": userSettings.storeHistory ? "true" : "false",
          "x-redact-pii": userSettings.redactPii ? "true" : "false",
        },
        body: JSON.stringify({
          inputMode: mode,
          text,
          presetId: selectedPresetId,
        }),
      });

      const payload = (await response.json()) as unknown;

      if (!response.ok) {
        const parsedError = ApiErrorSchema.safeParse(payload);
        if (parsedError.success) {
          setErrorMessage(parsedError.data.error.message);
          setErrorAuditTrail(parsedError.data.auditTrail ?? []);

          if (parsedError.data.meta?.latencyMs != null) {
            patchUserSettings({
              lastLatencyMs: parsedError.data.meta.latencyMs,
              lastValidation: parsedError.data.meta.validation ?? "failed",
            });
          }

          showToast("error", parsedError.data.error.message);
        } else {
          setErrorMessage("Request failed with unknown error format.");
          showToast("error", "Unknown request error.");
        }

        return;
      }

      const parsed = ProcessResponseSchema.safeParse(payload);
      if (!parsed.success) {
        setErrorMessage("Server response did not match expected schema.");
        showToast("error", "Invalid server response schema.");
        return;
      }

      const processed = parsed.data;
      setResult(processed);
      setEditableEmailDraft(processed.actions.emailDraft);
      setShareUrl("");
      setWebhookStatus("");
      setInputMode(mode);
      const nextReview = defaultSessionReview();
      setReview(nextReview);
      setApprovalEvents([]);
      setActiveServerSessionId(processed.meta.requestId);

      const verifierScore = Number(response.headers.get("x-verifier-score") ?? "100");
      const verifierOk = response.headers.get("x-verifier-ok") !== "false";
      const verifierFlags = (response.headers.get("x-verifier-flags") ?? "")
        .split(",")
        .map((flag) => flag.trim())
        .filter(Boolean);
      const topics = (response.headers.get("x-session-topics") ?? "")
        .split(",")
        .map((topic) => topic.trim())
        .filter(Boolean);
      const urgencyRaw = response.headers.get("x-session-urgency");
      const sentimentRaw = response.headers.get("x-session-sentiment");
      const insightsFromTranscript = deriveTranscriptInsights(processed.transcript, processed.actions.taskList);
      const nextAnalysis: StoredSession["analysis"] = {
        index: {
          entities: insightsFromTranscript.entities,
          topics: topics.length ? topics : insightsFromTranscript.topics,
          urgency:
            urgencyRaw === "high" || urgencyRaw === "medium" || urgencyRaw === "low"
              ? urgencyRaw
              : "low",
          sentiment:
            sentimentRaw === "positive" || sentimentRaw === "negative" || sentimentRaw === "neutral"
              ? sentimentRaw
              : "neutral",
          openLoops: insightsFromTranscript.openLoops,
          openLoopsCount: insightsFromTranscript.openLoops.length,
        },
        verifier: {
          ok: verifierOk,
          score: Number.isFinite(verifierScore) ? verifierScore : 100,
          flags: verifierFlags,
          policy: "warn",
        },
      };
      setAnalysis(nextAnalysis);

      patchUserSettings({
        lastLatencyMs: processed.meta.latencyMs,
        lastValidation: processed.meta.validation,
      });

      if (userSettings.storeHistory && health?.diagnostics.historyMode === "local") {
        const sessionId = createSessionId();
        saveLocalSession({
          id: sessionId,
          createdAt: new Date().toISOString(),
          workspaceId: sessionIdentity.workspaceId,
          presetId: selectedPresetId,
          pinned: false,
          tags: [],
          review: nextReview,
          analysis: nextAnalysis,
          approvalEvents: [],
          data: processed,
        });
        setActiveLocalSessionId(sessionId);
      }

      showToast("success", "Processing completed.");
    } catch {
      setErrorMessage("Network error while contacting /api/process.");
      showToast("error", "Network error while processing.");
    } finally {
      setLoading(false);
    }
  };

  const pushApprovalEvent = (
    action: "approve_email" | "approve_tasks" | "comment" | "execute",
    note?: string,
  ) => {
    const timestamp = new Date().toISOString();
    const sessionId = activeServerSessionId ?? activeLocalSessionId ?? "local-session";
    const event = {
      id: createSessionId(),
      sessionId,
      action,
      actorId: sessionIdentity.email || "demo-user",
      actorRole: sessionIdentity.role,
      timestamp,
      note,
      payloadHash: makeApprovalPayloadHash({
        sessionId,
        actorId: sessionIdentity.email || "demo-user",
        actorRole: sessionIdentity.role,
        action,
        note,
        timestamp,
      }),
    };

    setApprovalEvents((previous) => [event, ...previous].slice(0, 40));
  };

  const persistReview = async () => {
    if (!result) {
      return;
    }

    if (health?.diagnostics.historyMode === "db" && activeServerSessionId) {
      try {
        if (review.tasksApproved) {
          const response = await fetch(`/api/sessions/${activeServerSessionId}/approve-tasks`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ note: "Approved from dashboard action board." }),
          });
          if (response.ok) {
            pushApprovalEvent("approve_tasks", "Approved tasks.");
          }
        }
        if (review.emailApproved) {
          const response = await fetch(`/api/sessions/${activeServerSessionId}/approve-email`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ note: "Approved from dashboard action board." }),
          });
          if (response.ok) {
            pushApprovalEvent("approve_email", "Approved email draft.");
          }
        }
        showToast("success", "Approvals submitted.");
      } catch {
        showToast("error", "Failed to submit approval actions.");
      }
      return;
    }

    if (!activeLocalSessionId) {
      showToast("error", "No local session selected.");
      return;
    }

    updateLocalSession(activeLocalSessionId, {
      review,
      analysis,
      approvalEvents,
    });
    showToast("success", "Approval notes saved.");
  };

  const addComment = async () => {
    const trimmed = newComment.trim();
    if (!trimmed) {
      return;
    }

    setReview((previous) => ({
      ...previous,
      comments: [trimmed, ...previous.comments].slice(0, 8),
    }));
    setNewComment("");

    if (health?.diagnostics.historyMode === "db" && activeServerSessionId) {
      try {
        const response = await fetch(`/api/sessions/${activeServerSessionId}/comments`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ note: trimmed }),
        });
        if (!response.ok) {
          throw new Error("comment failed");
        }
        pushApprovalEvent("comment", trimmed);
      } catch {
        showToast("error", "Could not sync comment to server.");
      }
      return;
    }

    pushApprovalEvent("comment", trimmed);
    if (activeLocalSessionId) {
      updateLocalSession(activeLocalSessionId, {
        review: {
          ...review,
          comments: [trimmed, ...review.comments].slice(0, 8),
        },
      });
    }
  };

  const latestSessionText =
    localHistory.length > 0
      ? `${localHistory.length} local session${localHistory.length > 1 ? "s" : ""} in ${userSettings.workspaceId}`
      : "No local sessions yet";

  const observability = health?.diagnostics.observability;
  const guardian = health?.diagnostics.guardian;
  const pendingApprovals =
    Number(!review.emailApproved) + Number(!review.tasksApproved);
  const openLoopsCount = analysis.index.openLoopsCount;
  const latestSessionId = localHistory[0]?.id;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#d9f5ff_0%,#f5f9ff_35%,#f7f6ff_60%,#ffffff_100%)] px-4 py-6 text-slate-900 md:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 rounded-3xl border border-white/60 bg-white/80 p-5 shadow-[0_10px_40px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-700">
                Voice to Action Agent
              </p>
              <h1 className="mt-1 text-3xl font-semibold">Command Center</h1>
              <p className="mt-1 text-sm text-slate-600">{latestSessionText}</p>
              <p className="mt-1 text-xs text-slate-500">
                {sessionIdentity.name} ({sessionIdentity.role}) · {sessionIdentity.email}
              </p>
              {demoSafeEnabled && (
                <p className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                  Demo-safe mode enabled
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${statusPillClass}`}
              >
                {localizedStatus}
              </span>
              <Button
                id="command-run"
                variant="primary"
                onClick={() => processInput(inputMode)}
                disabled={processingDisabled}
              >
                {t(language, "process")}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setIsExportOpen(true)}
                disabled={!result}
              >
                {t(language, "export")}
              </Button>
              <AppNav current="dashboard" />
              <Link href="/open-loops">
                <Button variant="secondary" size="sm">
                  Open Loops
                </Button>
              </Link>
            </div>
          </div>
        </header>

        {((!geminiConfigured && !demoSafeEnabled) || healthError) && (
          <div className="mb-4 rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {healthError ||
              "GEMINI_API_KEY is missing. Processing is disabled until configured."}
          </div>
        )}

        {demoSafeEnabled && !healthError && (
          <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Demo-safe mode is active. Outputs are generated with deterministic local fallback when Gemini is unavailable.
          </div>
        )}

        {errorMessage && (
          <div className="mb-4 rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {errorMessage}
          </div>
        )}

        <Card className="mb-5 rounded-3xl border border-white/60 bg-white/80 p-5 shadow-[0_8px_32px_rgba(15,23,42,0.08)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Quick Actions</h2>
              <p className="text-sm text-slate-600">
                Fast path for processing, comparison, export, and regeneration.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => processInput(inputMode)}>
                Run process
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  if (!latestSessionId) {
                    showToast("error", "No local session available.");
                    return;
                  }
                  window.location.assign(`/history/${latestSessionId}`);
                }}
              >
                Open latest session
              </Button>
              <Button variant="secondary" onClick={() => setIsExportOpen(true)} disabled={!result}>
                Export
              </Button>
              <Link href="/history/compare">
                <Button variant="secondary">Compare</Button>
              </Link>
              <Button
                variant="secondary"
                onClick={() => {
                  if (!latestSessionId) {
                    showToast("error", "No local session to regenerate.");
                    return;
                  }
                  window.location.assign(`/?from=${latestSessionId}`);
                }}
              >
                Regenerate
              </Button>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Sessions processed</p>
              <p className="text-xl font-semibold text-slate-900">
                {observability?.processRequests ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Pending approvals</p>
              <p className="text-xl font-semibold text-slate-900">{pendingApprovals}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Open loops</p>
              <p className="text-xl font-semibold text-slate-900">{openLoopsCount}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Guardian blocks</p>
              <p className="text-xl font-semibold text-slate-900">
                {guardian?.security.blockedClients ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">P50 latency</p>
              <p className="text-xl font-semibold text-slate-900">
                {observability?.p50LatencyMs ?? 0}ms
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">P95 latency</p>
              <p className="text-xl font-semibold text-slate-900">
                {observability?.p95LatencyMs ?? 0}ms
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone={guardian?.status === "critical" ? "danger" : guardian?.status === "degraded" ? "warning" : "success"}>
              Guardian: {guardian?.status ?? "unknown"}
            </Badge>
            <Badge tone="neutral">
              Success rate: {Math.round((observability?.successRate ?? 0) * 100)}%
            </Badge>
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[1.08fr_1fr]">
          <section className="space-y-4 rounded-3xl border border-white/60 bg-white/80 p-5 shadow-[0_8px_32px_rgba(15,23,42,0.08)] backdrop-blur">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">Input Controls</h2>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTypedText(SAMPLE_SCRIPT);
                      setLiveTranscript(SAMPLE_SCRIPT);
                      setInputMode("text");
                    }}
                    className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-800"
                  >
                    Try sample script
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setInputMode("voice");
                      setLiveTranscript(SAMPLE_SCRIPT);
                      setTypedText(SAMPLE_SCRIPT);
                      showToast("success", "Simulated voice transcript loaded.");
                    }}
                    className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800"
                  >
                    Simulated voice mode
                  </button>
                  <button
                    type="button"
                    onClick={clearAll}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <label
                htmlFor="preset"
                className="mb-1 block text-sm font-semibold text-slate-700"
              >
                Preset Template
              </label>
              <select
                id="preset"
                value={selectedPresetId}
                onChange={(event) => setSelectedPresetId(event.target.value as PresetId)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-400"
              >
                {PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <label className="text-xs text-slate-600">
                  Workspace ID
                  <input
                    value={userSettings.workspaceId}
                    onChange={(event) =>
                      patchUserSettings({ workspaceId: event.target.value.trim() || "default-workspace" })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs"
                  />
                </label>
                <label className="text-xs text-slate-600">
                  User ID
                  <input
                    value={userSettings.userId}
                    onChange={(event) =>
                      patchUserSettings({ userId: event.target.value.trim() || "demo-user" })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs"
                  />
                </label>
              </div>
              <label className="mt-2 flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={userSettings.redactPii}
                  onChange={(event) => patchUserSettings({ redactPii: event.target.checked })}
                />
                Redact PII before model call
              </label>
              <p className="mt-1 text-[11px] text-slate-500">
                Prompt version: {health?.diagnostics.promptVersion ?? "unknown"}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-700">Voice controls</p>
              <p className="mt-1 text-xs text-slate-500">
                Mic permission: {micPermission} {speechSupported ? "" : "(unsupported)"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!speechSupported || isListening || loading || processingDisabled}
                  onClick={startListening}
                  className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-cyan-300"
                >
                  Start
                </button>
                <button
                  type="button"
                  disabled={!isListening || loading}
                  onClick={stopListening}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  Stop
                </button>
                <button
                  type="button"
                  onClick={() => processInput("voice")}
                  disabled={processingDisabled}
                  className="rounded-xl border border-cyan-300 bg-white px-4 py-2 text-sm font-semibold text-cyan-900 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400"
                >
                  Run voice transcript
                </button>
                <a
                  href="#text-fallback"
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
                >
                  Use text fallback
                </a>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <label
                htmlFor="transcript-preview"
                className="mb-1 block text-sm font-semibold text-slate-700"
              >
                Transcript
              </label>
              <textarea
                id="transcript-preview"
                readOnly
                value={transcriptPreview}
                placeholder="Transcript appears here..."
                className="h-40 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none"
              />
            </div>

            <div id="text-fallback" className="rounded-2xl border border-slate-200 bg-white p-4">
              <label
                htmlFor="text-input"
                className="mb-1 block text-sm font-semibold text-slate-700"
              >
                Text fallback
              </label>
              <textarea
                id="text-input"
                value={typedText}
                onChange={(event) => {
                  setTypedText(event.target.value);
                  setInputMode("text");
                }}
                maxLength={health?.diagnostics.maxInputChars ?? 2000}
                placeholder="Type or paste transcript text..."
                className="h-44 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-cyan-400"
              />
              <div className="mt-2 flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  {typedText.length}/{health?.diagnostics.maxInputChars ?? 2000}
                </p>
                <button
                  type="button"
                  onClick={() => processInput("text")}
                  disabled={processingDisabled}
                  className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  Run
                </button>
              </div>
            </div>

            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
              Do not send automatically. Always review extracted actions and draft content before sending.
            </p>
          </section>

          <section className="space-y-4 rounded-3xl border border-white/60 bg-white/80 p-5 shadow-[0_8px_32px_rgba(15,23,42,0.08)] backdrop-blur">
            {loading ? (
              <>
                <SkeletonCard title="Summary" />
                <SkeletonCard title="Tasks" />
                <SkeletonCard title="Email Draft" />
                <SkeletonCard title="Audit Trail" />
              </>
            ) : !result ? (
              <>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-500">
                    Summary
                  </h3>
                  <p className="mt-2 text-sm text-slate-500">
                    No processed output yet.
                  </p>
                </div>
                {emptyStateIllustration()}
              </>
            ) : (
              <>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-500">
                    Summary
                  </h3>
                  <p className="mt-2 text-xs text-slate-500">
                    Model source: {result.meta.model}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                    {result.summary}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-500">
                      Tasks
                    </h3>
                    <button
                      type="button"
                      onClick={() =>
                        copyText(
                          "Tasks",
                          result.actions.taskList.map((task) => `- ${task}`).join("\n"),
                        )
                      }
                      className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700"
                    >
                      Copy tasks
                    </button>
                  </div>
                  <ul className="mt-3 space-y-2 text-sm text-slate-800">
                    {result.actions.taskList.map((task, index) => (
                      <li key={`${task}-${index}`} className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={review.tasksApproved}
                          onChange={(event) =>
                            setReview((previous) => ({
                              ...previous,
                              tasksApproved: event.target.checked,
                            }))
                          }
                          className="mt-0.5 h-4 w-4"
                        />
                        <div className="w-full">
                          <span>{task}</span>
                          <input
                            value={review.taskOwners[String(index)] ?? ""}
                            onChange={(event) =>
                              setReview((previous) => ({
                                ...previous,
                                taskOwners: {
                                  ...previous.taskOwners,
                                  [String(index)]: event.target.value,
                                },
                              }))
                            }
                            placeholder="Owner (collab)"
                            className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs"
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-500">
                      Email Draft
                    </h3>
                    <button
                      type="button"
                      onClick={() => copyText("Email Draft", editableEmailDraft)}
                      className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700"
                    >
                      Copy
                    </button>
                  </div>
                  <textarea
                    value={editableEmailDraft}
                    onChange={(event) => setEditableEmailDraft(event.target.value)}
                    className="mt-3 h-52 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm"
                  />
                  <label className="mt-2 flex items-center gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={review.emailApproved}
                      onChange={(event) =>
                        setReview((previous) => ({
                          ...previous,
                          emailApproved: event.target.checked,
                        }))
                      }
                    />
                    Approved for manual sending
                  </label>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-500">
                    Audit Trail
                  </h3>
                  <ol className="mt-3 space-y-2">
                    {outputAuditTrail.map((item, index) => (
                      <li
                        key={`${item.step}-${item.timestamp}-${index}`}
                        className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                      >
                        <p className="text-sm font-semibold text-slate-800">{item.step}</p>
                        <p className="text-xs text-slate-500">
                          {formatTimestamp(item.timestamp)}
                        </p>
                        <p className="mt-1 text-sm text-slate-700">{item.details}</p>
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-500">
                    Session Intelligence
                  </h3>
                  <p className="mt-2 text-xs text-slate-600">
                    Topics: {insights.topics.length ? insights.topics.join(", ") : "none"}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    Entities: {insights.entities.length ? insights.entities.join(", ") : "none"}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    Open loops:{" "}
                    {insights.openLoops.length ? insights.openLoops.join(" | ") : "none"}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    Verifier: {analysis.verifier.score}/100 (
                    {analysis.verifier.ok ? "pass" : "flagged"})
                  </p>
                  {analysis.verifier.flags.length > 0 && (
                    <p className="mt-1 text-xs text-amber-700">
                      Flags: {analysis.verifier.flags.join(", ")}
                    </p>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-500">
                      Approval Center
                    </h3>
                    <button
                      type="button"
                      onClick={persistReview}
                      className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700"
                    >
                      Save approvals
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-700">
                    <p>
                      Tasks:{" "}
                      <span className={review.tasksApproved ? "text-emerald-700" : "text-amber-700"}>
                        {review.tasksApproved ? "approved" : "pending"}
                      </span>
                    </p>
                    <p>
                      Email:{" "}
                      <span className={review.emailApproved ? "text-emerald-700" : "text-amber-700"}>
                        {review.emailApproved ? "approved" : "pending"}
                      </span>
                    </p>
                  </div>
                  <div className="mt-2">
                    <textarea
                      value={newComment}
                      onChange={(event) => setNewComment(event.target.value)}
                      placeholder="Add reviewer note..."
                      className="h-20 w-full rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs"
                    />
                    <button
                      type="button"
                      onClick={addComment}
                      className="mt-2 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800"
                    >
                      Add comment
                    </button>
                    <ul className="mt-2 space-y-1 text-xs text-slate-600">
                      {review.comments.map((comment, index) => (
                        <li key={`${comment}-${index}`} className="rounded bg-slate-100 px-2 py-1">
                          {comment}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </div>

      <Dialog
        open={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        title="Export Center"
        description="Export data from the latest processed session. Sensitive secrets are never included."
      >
        <div className="grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            disabled={!result}
            onClick={() => copyText("Markdown", markdownExport)}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:text-slate-400"
          >
            Copy Markdown
          </button>
          <button
            type="button"
            disabled={!result}
            onClick={() => copyText("JSON", jsonExport)}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:text-slate-400"
          >
            Copy JSON
          </button>
          <button
            type="button"
            disabled={!result}
            onClick={() => copyText("Text", textExport)}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:text-slate-400"
          >
            Copy Text
          </button>
          <button
            type="button"
            disabled={!result}
            onClick={() =>
              downloadFile("voice-to-action-export.md", markdownExport, "text/markdown")
            }
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:text-slate-400"
          >
            Download .md
          </button>
          <button
            type="button"
            disabled={!result}
            onClick={() =>
              downloadFile(
                "voice-to-action-export.json",
                jsonExport,
                "application/json",
              )
            }
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:text-slate-400"
          >
            Download .json
          </button>
          <button
            type="button"
            disabled={!result}
            onClick={() => downloadFile("voice-to-action-export.txt", textExport, "text/plain")}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:text-slate-400"
          >
            Download .txt
          </button>
          <button
            type="button"
            disabled={!result}
            onClick={openPrintView}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:text-slate-400"
          >
            Print to PDF
          </button>
          <button
            type="button"
            disabled={!result}
            onClick={generateShareLink}
            className="rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-900 disabled:cursor-not-allowed disabled:text-slate-400"
          >
            Generate share link
          </button>
        </div>
        <div className="mt-3 space-y-2">
          <p className="text-xs text-slate-500">
            Signed share links are demo-safe and do not include secrets.
          </p>
          <input
            value={shareUrl}
            readOnly
            placeholder="Share URL appears here"
            className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs"
          />
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <input
              value={webhookUrl}
              onChange={(event) => setWebhookUrl(event.target.value)}
              placeholder="https://example.com/webhook"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs"
            />
            <button
              type="button"
              disabled={!result}
              onClick={sendWebhook}
              className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-900 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              Send webhook
            </button>
          </div>
          {webhookStatus && (
            <p className="text-xs text-slate-600">{webhookStatus}</p>
          )}
        </div>
      </Dialog>

      {toast && (
        <div className="fixed bottom-5 right-5 z-50">
          <div
            className={`rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-lg ${
              toast.type === "success" ? "bg-emerald-600" : "bg-rose-600"
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
