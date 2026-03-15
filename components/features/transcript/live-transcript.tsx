"use client";
import { motion } from "framer-motion";

interface LiveTranscriptProps {
  transcript: string;
  isListening: boolean;
}

export function LiveTranscript({ transcript, isListening }: LiveTranscriptProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel p-6 rounded-2xl w-full"
    >
      <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-4">
        {isListening ? "Listening..." : "Transcript"}
      </h3>
      <p className="text-lg text-foreground font-light leading-relaxed min-h-[60px]">
        {transcript || <span className="text-muted-foreground italic">Awaiting voice input...</span>}
      </p>
    </motion.div>
  );
}
