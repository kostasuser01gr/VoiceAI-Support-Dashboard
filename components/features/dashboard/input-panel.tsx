"use client";

import { useAppStore } from '@/lib/store';
import { Card, Button } from '@/components/ui/primitives';
import { PRESETS } from '@/lib/presets';

export function InputPanel() {
  const { typedText, setTypedText, setInputMode, health, clearAll } = useAppStore();

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setTypedText(e.target.value);
    setInputMode('text');
  };

  return (
    <Card className="space-y-6 flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-2">
        <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-accent/80">
          Text Configuration
        </h3>
        <Button variant="ghost" size="sm" onClick={clearAll}>
          Reset Input
        </Button>
      </div>
      <div className="space-y-4 flex-grow">
        <label className="block space-y-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
            Preset Schema Template
          </span>
          <select 
            className="w-full rounded-lg bg-black/40 border border-white/10 p-3 text-sm text-zinc-300 focus:outline-none focus:border-accent/40 transition-colors"
          >
            {PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>{preset.label}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
            Manual Text Entry
          </span>
          <textarea 
            className="w-full flex-grow rounded-lg bg-black/40 border border-white/10 p-4 text-sm text-zinc-300 focus:outline-none focus:border-accent/40 transition-colors resize-none h-[200px]"
            value={typedText}
            onChange={handleTextChange}
            placeholder="Paste or type your transcript context here..."
          />
        </label>
      </div>
      <div className="flex items-center justify-between mt-auto pt-4 border-t border-white/5">
        <p className="text-xs text-zinc-600 tracking-tighter">{typedText.length} / {health?.diagnostics.maxInputChars ?? 2000} characters</p>
        <Button variant="primary" size="md">
          Execute Processing
        </Button>
      </div>
    </Card>
  );
}