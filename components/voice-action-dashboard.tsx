"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useVoiceCapture } from "@/hooks/use-voice-capture";
import { DashboardHeader } from "@/components/features/dashboard/dashboard-header";
import { ActionCenter } from "@/components/features/dashboard/action-center";
import { InputSection } from "@/components/features/dashboard/input-section";
import { ResultSection } from "@/components/features/dashboard/result-section";
import { IntelligencePanel } from "@/components/features/dashboard/intelligence-panel";
import { ApprovalCenter } from "@/components/features/dashboard/approval-center";
import { Button, Dialog, Input } from "@/components/ui/primitives";
import { useAppStore } from "@/lib/store";
import { motion, AnimatePresence } from "framer-motion";

import {
  getLocalHistoryServerSnapshot,
  getLocalHistorySnapshot,
  saveLocalSession,
  subscribeLocalHistory,
  type StoredSession,
} from "@/lib/history";
import { normalizeLanguage, t } from "@/lib/i18n";
import { DEFAULT_PRESET_ID, type PresetId } from "@/lib/presets";
import type { PublicConfig } from "@/lib/publicConfig";
import { safeFetchJson } from "@/lib/safeFetch";
import { defaultSessionReview, type SessionAnalysis } from "@/lib/session-meta";
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

function createSessionId() {
  const webCrypto = globalThis.crypto;

  if (webCrypto?.randomUUID) {
    return webCrypto.randomUUID();
  }

  if (webCrypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    webCrypto.getRandomValues(bytes);
    const token = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
    return `session-${token}`;
  }
  return `session-${Date.now().toString(36)}`;
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

export function VoiceActionDashboard({
  initialSession = null,
  publicConfig,
}: VoiceActionDashboardProps) {
  const store = useAppStore();
  // Extract stable setter references for use in effects (Zustand setters are stable)
  const storeSetLiveTranscript = store.setLiveTranscript;
  const storeSetResult = store.setResult;
  const storeSetInputMode = store.setInputMode;
  const storeSetTypedText = store.setTypedText;
  const storeSetHealth = store.setHealth;
  const storeSetErrorMessage = store.setErrorMessage;

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
    transcript: liveTranscript,
    isListening,
    error: voiceError,
    start: startVoice,
    stop: stopVoice,
    clear: clearVoice,
  } = useVoiceCapture(userSettings.language);

  // Sync live transcript to store (but we should ideally avoid this re-rendering the whole component)
  useEffect(() => {
    storeSetLiveTranscript(liveTranscript);
  }, [liveTranscript, storeSetLiveTranscript]);

  const [editableEmailDraft, setEditableEmailDraft] = useState(
    initialSession?.data.actions.emailDraft ?? "",
  );
  const [selectedPresetId, setSelectedPresetId] = useState<PresetId>(
    initialSession?.presetId ?? userSettings.defaultPreset ?? DEFAULT_PRESET_ID,
  );
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [healthError, setHealthError] = useState("");
  const [sessionIdentity, setSessionIdentity] = useState<SessionIdentity>({
    name: "Demo User",
    email: "demo@voice-action.local",
    workspaceId: initialSession?.workspaceId ?? userSettings.workspaceId,
    role: "owner",
  });
  const [review, setReview] = useState(initialSession?.review ?? defaultSessionReview());
  const [analysis, setAnalysis] = useState(initialSession?.analysis ?? defaultAnalysis());
  const [newComment, setNewComment] = useState("");

  useEffect(() => {
    if (initialSession) {
      storeSetResult(initialSession.data);
      storeSetInputMode(initialSession.data.inputMode);
      storeSetTypedText(initialSession.data.transcript);
    }
  }, [initialSession, storeSetResult, storeSetInputMode, storeSetTypedText]);

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
        storeSetHealth(parsed.data);
        setHealthError("");
      } else {
        setHealthError("Diagnostics unavailable.");
      }
    };
    loadHealth();
    return () => { cancelled = true; };
  }, [storeSetHealth]);

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
  }, [userSettings.workspaceId]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2500);
    return () => window.clearTimeout(timer);
  }, [toast, setToast]);

  useEffect(() => {
    if (voiceError && voiceError !== "unsupported") {
      storeSetErrorMessage(`Voice capture error: ${voiceError}`);
      setToast({ type: "error", message: `Mic Error: ${voiceError}` });
    }
  }, [voiceError, storeSetErrorMessage]);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
  };

  const processInput = async (mode: InputMode) => {
    const text = mode === "voice" ? liveTranscript.trim() || store.typedText.trim() : store.typedText.trim();
    if (!text) {
      showToast("error", "Transcript is empty.");
      return;
    }

    store.setLoading(true);
    store.setErrorMessage("");

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
        store.setErrorMessage(msg);
        showToast("error", msg);
        return;
      }

      const parsed = ProcessResponseSchema.safeParse(payload);
      if (!parsed.success) {
        showToast("error", "Invalid server response.");
        return;
      }

      const processed = parsed.data;
      store.setResult(processed);
      setEditableEmailDraft(processed.actions.emailDraft);
      store.setInputMode(mode);

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

      if (userSettings.storeHistory && store.health?.diagnostics.historyMode === "local") {
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
        store.setActiveLocalSessionId(sessionId);
      }
      showToast("success", "Processing completed.");
    } catch {
      showToast("error", "Network error.");
    } finally {
      store.setLoading(false);
    }
  };

  const clearAll = () => {
    store.clearAll();
    clearVoice();
    showToast("success", "Workspace cleared.");
  };

  const status = useMemo(() => {
    if (store.errorMessage) return "Error";
    if (store.loading) return "Processing";
    if (isListening) return "Listening";
    return "Idle";
  }, [store.errorMessage, isListening, store.loading]);

  const demoSafeEnabled = store.health?.diagnostics.demoSafeMode ?? publicConfig?.demoSafeMode ?? false;
  const geminiConfigured = store.health?.diagnostics.geminiKeyPresent ?? publicConfig?.geminiConfigured ?? false;
  const processingDisabled = store.loading || (!geminiConfigured && !demoSafeEnabled) || Boolean(healthError);
  const language = normalizeLanguage(userSettings.language);

  return (
    <div className="min-h-screen bg-background px-4 py-8 text-foreground md:px-12">
      <div className="mx-auto max-w-[1600px]">
        
        <DashboardHeader
          status={status}
          localizedStatus={t(language, status.toLowerCase() as Parameters<typeof t>[1])}
          sessionIdentity={sessionIdentity}
          latestSessionText={`${localHistory.length} local sessions stored`}
          demoSafeEnabled={demoSafeEnabled}
          language={language}
          processingDisabled={processingDisabled}
          onProcess={() => processInput(store.inputMode)}
          onExport={() => store.setIsExportOpen(true)}
          result={store.result}
        />

        <div className="mb-8 flex items-center justify-between px-2">
          <div className="flex gap-4">
            <Button variant="ghost" size="sm" onClick={() => setIsSettingsOpen(true)}>
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Agent Settings
              </span>
            </Button>
          </div>
        </div>

        <motion.div 
          layout
          className={`grid gap-10 transition-all duration-500 ${store.result ? 'lg:grid-cols-[450px_1fr]' : 'lg:grid-cols-1 max-w-2xl mx-auto'}`}
        >
          <InputSection
            isListening={isListening}
            transcriptPreview={liveTranscript}
            typedText={store.typedText}
            setTypedText={(val) => store.setTypedText(val)}
            selectedPresetId={selectedPresetId}
            setSelectedPresetId={setSelectedPresetId}
            onStartListening={startVoice}
            onStopListening={stopVoice}
            onProcess={processInput}
            onClear={clearAll}
            onTrySample={() => {
              store.setTypedText(SAMPLE_SCRIPT);
              showToast("success", "Sample script loaded.");
            }}
            processingDisabled={processingDisabled}
            maxInputChars={store.health?.diagnostics.maxInputChars ?? 2000}
            micPermission="granted"
            speechSupported={voiceError !== "unsupported"}
          />

          <AnimatePresence mode="wait">
            {store.result && (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-8"
              >
                <ActionCenter
                  onProcess={() => processInput(store.inputMode)}
                  onOpenLatest={() => {
                    const latest = localHistory[0];
                    if (latest) window.location.assign(`/history/${latest.id}`);
                    else showToast("error", "No local history found.");
                  }}
                  onExport={() => store.setIsExportOpen(true)}
                  onRegenerate={() => {
                    const latest = localHistory[0];
                    if (latest) window.location.assign(`/?from=${latest.id}`);
                    else showToast("error", "No session to regenerate.");
                  }}
                  result={store.result}
                  stats={{
                    processed: store.health?.diagnostics.observability.processRequests ?? 0,
                    pendingApprovals: 2,
                    openLoops: analysis.index.openLoopsCount,
                    guardianBlocks: store.health?.diagnostics.guardian.security.blockedClients ?? 0,
                    p50Latency: store.health?.diagnostics.observability.p50LatencyMs ?? 0,
                    p95Latency: store.health?.diagnostics.observability.p95LatencyMs ?? 0,
                  }}
                  guardianStatus={store.health?.diagnostics.guardian.status ?? "unknown"}
                  successRate={store.health?.diagnostics.observability.successRate ?? 0}
                />

                <ResultSection
                  result={store.result}
                  loading={store.loading}
                  editableEmailDraft={editableEmailDraft}
                  onEditEmail={setEditableEmailDraft}
                  analysis={analysis}
                  review={review}
                  onPersistReview={() => showToast("success", "Review saved.")}
                  newComment={newComment}
                  setNewComment={setNewComment}
                  onAddComment={() => {
                    if (!newComment.trim()) return;
                    setReview(prev => ({ ...prev, comments: [newComment, ...prev.comments] }));
                    setNewComment("");
                    showToast("success", "Comment added.");
                  }}
                />

                <div className="grid gap-8 xl:grid-cols-2">
                  <IntelligencePanel analysis={analysis} />
                  <ApprovalCenter
                    review={review}
                    onPersistReview={() => showToast("success", "State synchronized.")}
                    newComment={newComment}
                    setNewComment={setNewComment}
                    onAddComment={() => {
                      if (!newComment.trim()) return;
                      setReview(prev => ({ ...prev, comments: [newComment, ...prev.comments] }));
                      setNewComment("");
                    }}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      <Dialog
        open={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        title="Agent Configuration"
        description="Fine-tune your processing environment and security parameters."
      >
        <div className="grid gap-6 py-4">
          <div className="space-y-4">
            <div className="grid gap-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Workspace Context</label>
              <Input
                value={userSettings.workspaceId}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => patchUserSettings({ workspaceId: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Privacy & Security</label>
              <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-surface">
                <span className="text-sm text-muted-foreground">Redact PII before AI processing</span>
                <input
                  type="checkbox"
                  checked={userSettings.redactPii}
                  onChange={(e) => patchUserSettings({ redactPii: e.target.checked })}
                  className="w-4 h-4 rounded border-border bg-background text-primary"
                />
              </div>
            </div>
          </div>
          <div className="pt-4 border-t border-border">
            <Button variant="primary" className="w-full" onClick={() => setIsSettingsOpen(false)}>
              Save Configuration
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={store.isExportOpen}
        onClose={() => store.setIsExportOpen(false)}
        title="Export Center"
      >
        <div className="grid grid-cols-2 gap-4">
          <Button variant="secondary" onClick={() => showToast("success", "Markdown copied")}>Copy Markdown</Button>
          <Button variant="secondary" onClick={() => showToast("success", "JSON copied")}>Copy JSON</Button>
        </div>
      </Dialog>

      {toast && (
        <div className="fixed bottom-8 right-8 z-[100] animate-in slide-in-from-bottom-4 duration-500">
          <div className={`px-6 py-3 rounded-full border shadow-2xl backdrop-blur-xl flex items-center gap-3 ${
            toast.type === "success" 
              ? "bg-white text-black border-white/10" 
              : "bg-rose-500/10 border-rose-500/20 text-rose-400"
          }`}>
            <span className={`w-2 h-2 rounded-full ${toast.type === "success" ? "bg-black" : "bg-rose-400"}`} />
            <span className="text-sm font-semibold tracking-tight">{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
