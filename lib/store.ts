import { create } from 'zustand';
import { type ProcessResponse, type InputMode, type HealthResponse } from '@/lib/schema';

interface AppState {
  inputMode: InputMode;
  typedText: string;
  liveTranscript: string;
  result: ProcessResponse | null;
  loading: boolean;
  errorMessage: string;
  health: HealthResponse | null;
  activeLocalSessionId: string | null;
  isExportOpen: boolean;

  setInputMode: (mode: InputMode) => void;
  setTypedText: (text: string) => void;
  setLiveTranscript: (text: string) => void;
  setResult: (result: ProcessResponse | null) => void;
  setLoading: (loading: boolean) => void;
  setErrorMessage: (message: string) => void;
  setHealth: (health: HealthResponse | null) => void;
  setActiveLocalSessionId: (id: string | null) => void;
  setIsExportOpen: (open: boolean) => void;
  
  clearAll: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  inputMode: 'text',
  typedText: '',
  liveTranscript: '',
  result: null,
  loading: false,
  errorMessage: '',
  health: null,
  activeLocalSessionId: null,
  isExportOpen: false,

  setInputMode: (inputMode) => set({ inputMode }),
  setTypedText: (typedText) => set({ typedText }),
  setLiveTranscript: (liveTranscript) => set({ liveTranscript }),
  setResult: (result) => set({ result }),
  setLoading: (loading) => set({ loading }),
  setErrorMessage: (errorMessage) => set({ errorMessage }),
  setHealth: (health) => set({ health }),
  setActiveLocalSessionId: (activeLocalSessionId) => set({ activeLocalSessionId }),
  setIsExportOpen: (isExportOpen) => set({ isExportOpen }),

  clearAll: () => set({ 
    typedText: '', 
    liveTranscript: '', 
    result: null, 
    errorMessage: '', 
    activeLocalSessionId: null 
  }),
}));