import { VoiceOrb } from '@/components/features/voice/voice-orb';
import { Button } from '@/components/ui/primitives';
import { useAppStore } from '@/lib/store';

export function VoiceControlSection({ isListening, startListening, stopListening, loading }: {
  isListening: boolean;
  startListening: () => void;
  stopListening: () => void;
  loading: boolean;
}) {
  const { setInputMode } = useAppStore();

  return (
    <section className="glass-panel p-8 rounded-2xl flex flex-col items-center justify-center text-center space-y-6">
      <div className="relative">
        <VoiceOrb isListening={isListening} />
        {isListening && (
          <div className="absolute -inset-10 rounded-full bg-accent/10 blur-[80px] animate-pulse" />
        )}
      </div>
      <div>
        <h2 className="text-2xl font-semibold tracking-tighter">Voice Intelligence Capture</h2>
        <p className="text-sm text-zinc-500 mt-2">Press start to begin capturing and extracting structured actions from speech.</p>
      </div>
      <div className="flex flex-wrap gap-4 justify-center">
        <Button 
          variant={isListening ? 'danger' : 'primary'} 
          size="lg" 
          onClick={isListening ? stopListening : startListening}
          disabled={loading}
        >
          {isListening ? 'Stop Capture' : 'Start Capture'}
        </Button>
        <Button 
          variant="secondary" 
          size="lg" 
          onClick={() => setInputMode('voice')}
          disabled={isListening || loading}
        >
          Run Extraction
        </Button>
      </div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">
        Secure End-to-End Encryption Enabled
      </p>
    </section>
  );
}