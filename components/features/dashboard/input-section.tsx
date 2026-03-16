"use client";

import React from "react";
import dynamic from "next/dynamic";
import { Button, Card, Select, Textarea } from "@/components/ui/primitives";
import { PRESETS, type PresetId } from "@/lib/presets";
import { useAppStore } from "@/lib/store";

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
  transcriptPreview: string; // Keep for now but we'll use store for live updates
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

function LiveTranscriptPreview() {
  const liveTranscript = useAppStore(s => s.liveTranscript);

  if (!liveTranscript) return null;

  return (
    <div className="mt-6 rounded-md border border-border bg-background p-4 animate-in fade-in slide-in-from-top-2 duration-300">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Live Transcript</p>
      <p className="text-sm text-foreground leading-relaxed italic opacity-80">
        &ldquo;{liveTranscript}...&rdquo;
      </p>
    </div>
  );
}

export function InputSection({
  isListening,
  transcriptPreview: _transcriptPreview,
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
    <section className="space-y-8">
      <Card className="border-border bg-surface p-8">
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Aural Capture
          </h3>
          <div className="flex gap-3">
            <Button variant="ghost" size="sm" onClick={onTrySample}>
              Sample
            </Button>
            <Button variant="ghost" size="sm" onClick={onClear}>
              Clear
            </Button>
          </div>
        </div>

        <div className="py-4">
          <VoiceOrb isListening={isListening} />
          <div className="mt-10 text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-6">
              Mic: <span className="text-foreground">{micPermission}</span>
              {!speechSupported && " (unsupported)"}
            </p>
            <div className="flex justify-center gap-4">
              {!isListening ? (
                <Button
                  variant="primary"
                  onClick={onStartListening}
                  disabled={!speechSupported || processingDisabled}
                  className="px-10"
                >
                  Start listening
                </Button>
              ) : (
                <Button
                  variant="danger"
                  onClick={onStopListening}
                  className="px-10"
                >
                  Stop capture
                </Button>
              )}
            </div>
          </div>
        </div>

        <LiveTranscriptPreview />
      </Card>

      <div className="space-y-6">
        <div className="rounded-md border border-border bg-surface p-6">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-4">
            Intelligence Preset
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

        <div className="rounded-md border border-border bg-surface p-6">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-4">
            Transcript Source
          </label>
          <Textarea
            value={typedText}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setTypedText(e.target.value)}
            placeholder="Manual override or post-capture edits..."
            className="h-40"
          />
          <div className="mt-4 flex items-center justify-between">
            <span className={`text-[10px] font-bold tracking-widest uppercase ${typedText.length > maxInputChars * 0.9 ? 'text-rose-500' : 'text-muted-foreground'}`}>
              {typedText.length} / {maxInputChars}
            </span>
            <Button
              variant="primary"
              size="sm"
              onClick={() => onProcess("text")}
              disabled={processingDisabled || !typedText.trim()}
            >
              Analyze Input
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
