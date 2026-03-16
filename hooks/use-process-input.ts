import { useAppStore } from '@/lib/store';
import { ProcessResponseSchema, type InputMode } from '@/lib/schema';

export function useProcessInput() {
  const {
    typedText,
    liveTranscript,
    setResult,
    setLoading,
    setErrorMessage,
    inputMode,
  } = useAppStore();

  const processInput = async (mode?: InputMode) => {
    const activeMode = mode || inputMode;
    const text = activeMode === 'voice' ? liveTranscript : typedText;
    
    if (!text.trim()) {
      setErrorMessage('Input is empty. Please provide voice or text input.');
      return;
    }

    setLoading(true);
    setErrorMessage('');
    
    try {
      const response = await fetch('/api/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-store-history': 'true'
        },
        body: JSON.stringify({ 
          text, 
          inputMode: activeMode,
          presetId: 'default' // Or get from store
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        setErrorMessage(data.error?.message || 'Processing failed.');
        setLoading(false);
        return;
      }

      const validated = ProcessResponseSchema.safeParse(data);
      if (validated.success) {
        setResult(validated.data);
      } else {
        setErrorMessage('Schema validation failed for model response.');
      }
    } catch {
      setErrorMessage('Network or server error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return { processInput };
}