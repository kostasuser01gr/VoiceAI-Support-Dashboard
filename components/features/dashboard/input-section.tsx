"use client";

import dynamic from "next/dynamic";
import { Button, Card, Select, Textarea } from "@/components/ui/primitives";
import { PRESETS, type PresetId } from "@/lib/presets";

const VoiceOrb = dynamic(
  () => import("@/components/features/voice/voice-orb").then((mod) => mod.VoiceOrb),
  {
    ssr: false,
    loading: () => (
      <div className="w-48 h-48 rounded-full bg-white/5 animate-pulse mx-auto" />
    ),
  }
);

type InputSectionProps = {
  isListening: boolean;
  typedText: string;
  setTypedText: (text: string) => void;
  selectedPresetId: PresetId;
  setSelectedPresetId: (id: PresetId) => void;
  onStartListening: () => void;
  onStopListening: () => void;
  onProcess: (mode: "voice" | "text") => void;
  onClear: () => void;
  onTrySample: () => void;
  processingDisabled: boolean;
  maxInputChars: number;
  micPermission: string;
  speechSupported: boolean;
};

export function InputSection({
  isListening,
  typedText,
  setTypedText,
  selectedPresetId,
  setSelectedPresetId,
  onStartListening,
  onStopListening,
  onProcess,
  onClear,
  onTrySample,
  processingDisabled,
  maxInputChars,
  micPermission,
  speechSupported,
}: InputSectionProps) {
  return (
    <section className="space-y-6">
      <Card className="border-white/5 bg-white/[0.02] p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-zinc-500">
            Voice Capture
          </h3>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onTrySample}>
              Sample
            </Button>
            <Button variant="ghost" size="sm" onClick={onClear}>
              Clear
            </Button>
          </div>
        </div>

        <div className="py-8">
          <VoiceOrb isListening={isListening} />
          <div className="mt-8 text-center">
            <p className="text-xs text-zinc-500 mb-4">
              Mic status: <span className="text-zinc-300 font-medium">{micPermission}</span>
              {!speechSupported && " (unsupported)"}
            </p>
            <div className="flex justify-center gap-3">
              {!isListening ? (
                <Button
                  variant="primary"
                  onClick={onStartListening}
                  disabled={!speechSupported || processingDisabled}
                  className="px-8"
                >
                  Start listening
                </Button>
              ) : (
                <Button
                  variant="danger"
                  onClick={onStopListening}
                  className="px-8"
                >
                  Stop capture
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-6">
        <div className="glass-card">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-3">
            Preset Template
          </label>
          <Select
            value={selectedPresetId}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedPresetId(e.target.value as PresetId)}
          >
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="glass-card">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-3">
            Transcript Context
          </label>
          <Textarea
            value={typedText}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setTypedText(e.target.value)}
            placeholder="Voice transcript or manual input appears here..."
            className="h-48"
          />
          <div className="mt-3 flex items-center justify-between">
            <span className={`text-[10px] font-bold tracking-widest ${typedText.length > maxInputChars * 0.9 ? 'text-rose-500' : 'text-zinc-600'}`}>
              {typedText.length} / {maxInputChars}
            </span>
            <Button
              variant="primary"
              size="sm"
              onClick={() => onProcess("text")}
              disabled={processingDisabled || !typedText.trim()}
            >
              Process Input
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
