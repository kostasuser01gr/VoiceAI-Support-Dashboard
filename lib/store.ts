import { create } from 'zustand';
import { 
  type ProcessResponse, 
  type InputMode, 
  type HealthResponse,
} from '@/lib/schema';
import { DEFAULT_PRESET_ID, type PresetId } from '@/lib/presets';
import { defaultSessionReview, type SessionAnalysis, type SessionReview, type ApprovalEvent } from '@/lib/session-meta';

export type SessionIdentity = {
  name: string;
  email: string;
  workspaceId: string;
  role: "owner" | "admin" | "agent" | "viewer";
};

interface AppState {
  // Input State
  inputMode: InputMode;
  typedText: string;
  liveTranscript: string;
  selectedPresetId: PresetId;
  
  // Result & Processing State
  result: ProcessResponse | null;
  loading: boolean;
  errorMessage: string;
  activeLocalSessionId: string | null;
  activeServerSessionId: string | null;
  editableEmailDraft: string;
  
  // UI State
  isExportOpen: boolean;
  isSettingsOpen: boolean;
  toast: { type: "success" | "error"; message: string } | null;
  
  // Diagnostics & Identity
  health: HealthResponse | null;
  healthError: string;
  sessionIdentity: SessionIdentity;
  
  // Meta & Review State
  review: SessionReview;
  analysis: SessionAnalysis;
  approvalEvents: ApprovalEvent[];
  newComment: string;

  // Actions
  setInputMode: (mode: InputMode) => void;
  setTypedText: (text: string) => void;
  setLiveTranscript: (text: string) => void;
  setSelectedPresetId: (id: PresetId) => void;
  setResult: (result: ProcessResponse | null) => void;
  setLoading: (loading: boolean) => void;
  setErrorMessage: (message: string) => void;
  setActiveLocalSessionId: (id: string | null) => void;
  setActiveServerSessionId: (id: string | null) => void;
  setEditableEmailDraft: (draft: string) => void;
  setIsExportOpen: (open: boolean) => void;
  setIsSettingsOpen: (open: boolean) => void;
  setToast: (toast: { type: "success" | "error"; message: string } | null) => void;
  showToast: (type: "success" | "error", message: string) => void;
  setHealth: (health: HealthResponse | null) => void;
  setHealthError: (error: string) => void;
  setSessionIdentity: (identity: SessionIdentity | ((prev: SessionIdentity) => SessionIdentity)) => void;
  setReview: (review: SessionReview | ((prev: SessionReview) => SessionReview)) => void;
  setAnalysis: (analysis: SessionAnalysis) => void;
  setApprovalEvents: (events: ApprovalEvent[]) => void;
  setNewComment: (comment: string) => void;
  
  clearAll: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  inputMode: 'text',
  typedText: '',
  liveTranscript: '',
  selectedPresetId: DEFAULT_PRESET_ID,
  
  result: null,
  loading: false,
  errorMessage: '',
  activeLocalSessionId: null,
  activeServerSessionId: null,
  editableEmailDraft: '',
  
  isExportOpen: false,
  isSettingsOpen: false,
  toast: null,
  
  health: null,
  healthError: '',
  sessionIdentity: {
    name: "Demo User",
    email: "demo@voice-action.local",
    workspaceId: "default",
    role: "owner",
  },
  
  review: defaultSessionReview(),
  analysis: {
    index: {
      entities: [],
      topics: [],
      urgency: "low",
      sentiment: "neutral",
      openLoops: [],
      openLoopsCount: 0,
    },
    verifier: {
      ok: true,
      score: 100,
      flags: [],
      policy: "warn",
    },
  },
  approvalEvents: [],
  newComment: '',

  setInputMode: (inputMode) => set({ inputMode }),
  setTypedText: (typedText) => set({ typedText }),
  setLiveTranscript: (liveTranscript) => set({ liveTranscript }),
  setSelectedPresetId: (selectedPresetId) => set({ selectedPresetId }),
  setResult: (result) => set({ result }),
  setLoading: (loading) => set({ loading }),
  setErrorMessage: (errorMessage) => set({ errorMessage }),
  setActiveLocalSessionId: (activeLocalSessionId) => set({ activeLocalSessionId }),
  setActiveServerSessionId: (activeServerSessionId) => set({ activeServerSessionId }),
  setEditableEmailDraft: (editableEmailDraft) => set({ editableEmailDraft }),
  setIsExportOpen: (isExportOpen) => set({ isExportOpen }),
  setIsSettingsOpen: (isSettingsOpen) => set({ isSettingsOpen }),
  setToast: (toast) => set({ toast }),
  showToast: (type, message) => set({ toast: { type, message } }),
  setHealth: (health) => set({ health }),
  setHealthError: (healthError) => set({ healthError }),
  setSessionIdentity: (identity) => set((state) => ({ 
    sessionIdentity: typeof identity === 'function' ? identity(state.sessionIdentity) : identity 
  })),
  setReview: (review) => set((state) => ({ 
    review: typeof review === 'function' ? review(state.review) : review 
  })),
  setAnalysis: (analysis) => set({ analysis }),
  setApprovalEvents: (approvalEvents) => set({ approvalEvents }),
  setNewComment: (newComment) => set({ newComment }),

  clearAll: () => set({ 
    typedText: '', 
    liveTranscript: '', 
    result: null, 
    errorMessage: '', 
    activeLocalSessionId: null,
    activeServerSessionId: null,
    editableEmailDraft: '',
    review: defaultSessionReview(),
  }),
}));