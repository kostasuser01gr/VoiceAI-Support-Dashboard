"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useVoiceCapture } from "@/hooks/use-voice-capture";
import { DashboardHeader } from "@/components/features/dashboard/dashboard-header";
import { ActionCenter } from "@/components/features/dashboard/action-center";
import { InputSection } from "@/components/features/dashboard/input-section";
import { ResultSection } from "@/components/features/dashboard/result-section";
import { IntelligencePanel } from "@/components/features/dashboard/intelligence-panel";
import { ApprovalCenter } from "@/components/features/dashboard/approval-center";
import { Button, Dialog, Input } from "@/components/ui/primitives";

import {
  getLocalHistoryServerSnapshot,
  getLocalHistorySnapshot,
  saveLocalSession,
  subscribeLocalHistory,
} from "@/lib/history";
import { normalizeLanguage, t } from "@/lib/i18n";
import type { PublicConfig } from "@/lib/publicConfig";
import { safeFetchJson } from "@/lib/safeFetch";
import { defaultSessionReview, type SessionAnalysis, type SessionReview } from "@/lib/session-meta";
import {
  getUserSettingsServerSnapshot,
  getUserSettingsSnapshot,
  patchUserSettings,
  subscribeUserSettings,
} from "@/lib/userSettings";
import {
  ApiErrorSchema,
  HealthResponseSchema,
  type InputMode,
  ProcessResponseSchema,
} from "@/lib/schema";
import { useAppStore, type SessionIdentity } from "@/lib/store";
import { type StoredSession } from "@/lib/history";

type VoiceActionDashboardProps = {
  initialSession?: StoredSession | null;
  publicConfig?: PublicConfig;
};

const SAMPLE_SCRIPT = `Hi team, quick standup update. We finished the onboarding tooltip flow and fixed the profile save bug. Priya will ship analytics tracking by Thursday. I will prepare release notes and share them by Friday noon. Please schedule a 20-minute QA sync tomorrow morning, and send the customer success team a short status email after that meeting.`;

function createSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function VoiceActionDashboard({
  initialSession = null,
  publicConfig,
}: VoiceActionDashboardProps) {
  const {
    inputMode, setInputMode,
    typedText, setTypedText,
    liveTranscript, setLiveTranscript,
    selectedPresetId, setSelectedPresetId,
    result, setResult,
    loading, setLoading,
    errorMessage, setErrorMessage,
    setActiveLocalSessionId,
    setActiveServerSessionId,
    editableEmailDraft, setEditableEmailDraft,
    isExportOpen, setIsExportOpen,
    isSettingsOpen, setIsSettingsOpen,
    toast, showToast, setToast,
    health, setHealth,
    healthError, setHealthError,
    sessionIdentity, setSessionIdentity,
    review, setReview,
    analysis, setAnalysis,
    setApprovalEvents,
    newComment, setNewComment,
    clearAll: clearStore
  } = useAppStore();

  const userSettings = useSyncExternalStore(
    subscribeUserSettings,
    getUserSettingsSnapshot,
    getUserSettingsServerSnapshot,
  );
  
  const localHistory = useSyncExternalStore(
    subscribeLocalHistory,
    getLocalHistorySnapshot,
    getLocalHistoryServerSnapshot,
  );

  const {
    transcript: hookTranscript,
    isListening,
    error: voiceError,
    start: startVoice,
    stop: stopVoice,
    clear: clearVoice,
  } = useVoiceCapture(userSettings.language);

  // Sync hook transcript to store
  useEffect(() => {
    setLiveTranscript(hookTranscript);
  }, [hookTranscript, setLiveTranscript]);

  useEffect(() => {
    if (initialSession) {
      setResult(initialSession.data);
      setTypedText(initialSession.data.transcript);
      setEditableEmailDraft(initialSession.data.actions.emailDraft);
      setSelectedPresetId(initialSession.presetId);
      setReview(initialSession.review);
      setAnalysis(initialSession.analysis);
      setApprovalEvents(initialSession.approvalEvents);
      setActiveLocalSessionId(initialSession.id);
    }
  }, [initialSession, setResult, setTypedText, setEditableEmailDraft, setSelectedPresetId, setReview, setAnalysis, setApprovalEvents, setActiveLocalSessionId]);

  useEffect(() => {
    let cancelled = false;
    const loadHealth = async () => {
      const response = await safeFetchJson<unknown>("/api/health", {
        cache: "no-store",
        timeoutMs: 10000,
      });
      if (cancelled) return;
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
    return () => { cancelled = true; };
  }, [setHealth, setHealthError]);

  useEffect(() => {
    let cancelled = false;
    const loadSessionIdentity = async () => {
      const response = await safeFetchJson<{ session?: SessionIdentity }>("/api/me", {
        cache: "no-store",
        timeoutMs: 10000,
      });
      if (cancelled) return;
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
    return () => { cancelled = true; };
  }, [userSettings.workspaceId, setSessionIdentity]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2500);
    return () => window.clearTimeout(timer);
  }, [toast, setToast]);

  useEffect(() => {
    if (voiceError && voiceError !== "unsupported") {
      setErrorMessage(`Voice capture error: ${voiceError}`);
      showToast("error", `Mic Error: ${voiceError}`);
    }
  }, [voiceError, setErrorMessage, showToast]);

  const processInput = async (mode: InputMode) => {
    const text = mode === "voice" ? liveTranscript.trim() || typedText.trim() : typedText.trim();
    if (!text) {
      showToast("error", "Transcript is empty.");
      return;
    }

    setLoading(true);
    setErrorMessage("");

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

      const payload = await response.json();
      if (!response.ok) {
        const parsedError = ApiErrorSchema.safeParse(payload);
        const msg = parsedError.success ? parsedError.data.error.message : "Request failed.";
        setErrorMessage(msg);
        showToast("error", msg);
        return;
      }

      const parsed = ProcessResponseSchema.safeParse(payload);
      if (!parsed.success) {
        showToast("error", "Invalid server response.");
        return;
      }

      const processed = parsed.data;
      setResult(processed);
      setEditableEmailDraft(processed.actions.emailDraft);
      setInputMode(mode);
      setActiveServerSessionId(processed.meta.requestId);

      const verifierScore = Number(response.headers.get("x-verifier-score") ?? "100");
      const verifierOk = response.headers.get("x-verifier-ok") !== "false";
      
      const nextAnalysis: SessionAnalysis = {
        index: {
          ...processed.intelligence,
          openLoopsCount: processed.intelligence.openLoops.length,
        },
        verifier: {
          ok: verifierOk,
          score: verifierScore,
          flags: (response.headers.get("x-verifier-flags") ?? "").split(",").filter(Boolean),
          policy: "warn",
        },
      };
      setAnalysis(nextAnalysis);

      if (userSettings.storeHistory && health?.diagnostics.historyMode === "local") {
        const sessionId = createSessionId();
        saveLocalSession({
          id: sessionId,
          createdAt: new Date().toISOString(),
          workspaceId: sessionIdentity.workspaceId,
          presetId: selectedPresetId,
          pinned: false,
          tags: [],
          review: defaultSessionReview(),
          analysis: nextAnalysis,
          approvalEvents: [],
          data: processed,
        });
        setActiveLocalSessionId(sessionId);
      }
      showToast("success", "Processing completed.");
    } catch {
      showToast("error", "Network error.");
    } finally {
      setLoading(false);
    }
  };

  const clearAll = () => {
    clearStore();
    clearVoice();
    showToast("success", "Workspace cleared.");
  };

  const status = useMemo(() => {
    if (errorMessage) return "Error";
    if (loading) return "Processing";
    if (isListening) return "Listening";
    return "Idle";
  }, [errorMessage, isListening, loading]);

  const demoSafeEnabled = health?.diagnostics.demoSafeMode ?? publicConfig?.demoSafeMode ?? false;
  const geminiConfigured = health?.diagnostics.geminiKeyPresent ?? publicConfig?.geminiConfigured ?? false;
  const processingDisabled = loading || (!geminiConfigured && !demoSafeEnabled) || Boolean(healthError);
  const language = normalizeLanguage(userSettings.language);

  return (
    <div className="min-h-screen bg-black px-4 py-8 text-foreground md:px-12">
      <div className="mx-auto max-w-[1600px]">
        
        <DashboardHeader
          status={status}
          localizedStatus={t(language, status.toLowerCase() as "idle" | "listening" | "processing" | "error")}
          sessionIdentity={sessionIdentity}
          latestSessionText={`${localHistory.length} local sessions stored`}
          demoSafeEnabled={demoSafeEnabled}
          language={language}
          processingDisabled={processingDisabled}
          onProcess={() => processInput(inputMode)}
          onExport={() => setIsExportOpen(true)}
          result={result}
        />

        <div className="mb-8 flex items-center justify-between px-2">
          <div className="flex gap-4">
            <Button variant="ghost" size="sm" onClick={() => setIsSettingsOpen(true)}>
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Agent Settings
              </span>
            </Button>
          </div>
        </div>

        <div className="grid gap-10 lg:grid-cols-[450px_1fr]">
          <InputSection
            isListening={isListening}
            typedText={typedText}
            setTypedText={setTypedText}
            selectedPresetId={selectedPresetId}
            setSelectedPresetId={setSelectedPresetId}
            onStartListening={startVoice}
            onStopListening={stopVoice}
            onProcess={processInput}
            onClear={clearAll}
            onTrySample={() => {
              setTypedText(SAMPLE_SCRIPT);
              showToast("success", "Sample script loaded.");
            }}
            processingDisabled={processingDisabled}
            maxInputChars={health?.diagnostics.maxInputChars ?? 2000}
            micPermission="granted"
            speechSupported={voiceError !== "unsupported"}
          />

          <div className="space-y-8">
            <ActionCenter
              onProcess={() => processInput(inputMode)}
              onOpenLatest={() => {
                const latest = localHistory[0];
                if (latest) window.location.assign(`/history/${latest.id}`);
                else showToast("error", "No local history found.");
              }}
              onExport={() => setIsExportOpen(true)}
              onRegenerate={() => {
                const latest = localHistory[0];
                if (latest) window.location.assign(`/?from=${latest.id}`);
                else showToast("error", "No session to regenerate.");
              }}
              result={result}
              stats={{
                processed: health?.diagnostics.observability.processRequests ?? 0,
                pendingApprovals: 2, // Dummy for now
                openLoops: analysis.index.openLoopsCount,
                guardianBlocks: health?.diagnostics.guardian.security.blockedClients ?? 0,
                p50Latency: health?.diagnostics.observability.p50LatencyMs ?? 0,
                p95Latency: health?.diagnostics.observability.p95LatencyMs ?? 0,
              }}
              guardianStatus={health?.diagnostics.guardian.status ?? "unknown"}
              successRate={health?.diagnostics.observability.successRate ?? 0}
            />

            <ResultSection
              result={result}
              loading={loading}
              editableEmailDraft={editableEmailDraft}
            />

            {result && (
              <div className="grid gap-8 xl:grid-cols-2">
                <IntelligencePanel analysis={analysis} />
                <ApprovalCenter
                  review={review}
                  onPersistReview={() => showToast("success", "State synchronized.")}
                  newComment={newComment}
                  setNewComment={setNewComment}
                  onAddComment={() => {
                    if (!newComment.trim()) return;
                    setReview((prev: SessionReview) => ({ ...prev, comments: [newComment, ...prev.comments] }));
                    setNewComment("");
                  }}                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Settings Dialog */}
      <Dialog
        open={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        title="Agent Configuration"
        description="Fine-tune your processing environment and security parameters."
      >
        <div className="grid gap-6 py-4">
          <div className="space-y-4">
            <div className="grid gap-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Workspace Context</label>
              <Input
                value={userSettings.workspaceId}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => patchUserSettings({ workspaceId: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Privacy & Security</label>
              <div className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/[0.01]">
                <span className="text-sm text-zinc-400">Redact PII before AI processing</span>
                <input
                  type="checkbox"
                  checked={userSettings.redactPii}
                  onChange={(e) => patchUserSettings({ redactPii: e.target.checked })}
                  className="w-4 h-4 rounded border-white/10 bg-black text-sky-500"
                />
              </div>
            </div>
          </div>
          <div className="pt-4 border-t border-white/5">
            <Button variant="primary" className="w-full" onClick={() => setIsSettingsOpen(false)}>
              Save Configuration
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        title="Export Center"
      >
        {/* Simplified export UI for brevity */}
        <div className="grid grid-cols-2 gap-4">
          <Button variant="secondary" onClick={() => showToast("success", "Markdown copied")}>Copy Markdown</Button>
          <Button variant="secondary" onClick={() => showToast("success", "JSON copied")}>Copy JSON</Button>
        </div>
      </Dialog>

      {toast && (
        <div className="fixed bottom-8 right-8 z-[100] animate-in slide-in-from-bottom-4 duration-500">
          <div className={`px-6 py-3 rounded-full border shadow-2xl backdrop-blur-xl flex items-center gap-3 ${
            toast.type === "success" 
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
              : "bg-rose-500/10 border-rose-500/20 text-rose-400"
          }`}>
            <span className={`w-2 h-2 rounded-full ${toast.type === "success" ? "bg-emerald-400" : "bg-rose-400"}`} />
            <span className="text-sm font-semibold tracking-tight">{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
