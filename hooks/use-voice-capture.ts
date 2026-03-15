"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";

export type RecognitionError = 
  | "no-speech"
  | "aborted"
  | "audio-capture"
  | "network"
  | "not-allowed"
  | "service-not-allowed"
  | "bad-grammar"
  | "language-not-supported"
  | "unsupported";

interface SpeechRecognitionResult {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: {
    transcript: string;
    confidence: number;
  };
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: RecognitionError;
  readonly message: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface ExtendedWindow extends Window {
  SpeechRecognition?: new () => SpeechRecognition;
  webkitSpeechRecognition?: new () => SpeechRecognition;
}

export function useVoiceCapture(language: string = "en-US") {
  const isBrowserSupported = useMemo(() => {
    if (typeof window === "undefined") return false;
    const win = window as ExtendedWindow;
    return !!(win.SpeechRecognition || win.webkitSpeechRecognition);
  }, []);

  const [transcript, setTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<RecognitionError | string | null>(isBrowserSupported ? null : "unsupported");
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !isBrowserSupported) return;

    const win = window as ExtendedWindow;
    const SpeechRecognitionConstructor = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechRecognitionConstructor) return;
    
    const recognition = new SpeechRecognitionConstructor();
    
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const current = Array.from(event.results)
        .map((result: SpeechRecognitionResult) => result[0]?.transcript || "")
        .join(" ")
        .trim();
      
      setTranscript(current);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setError(event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
      recognitionRef.current = null;
    };
  }, [language, isBrowserSupported]);

  const start = useCallback(() => {
    if (!recognitionRef.current) {
      setError("unsupported");
      return;
    }
    setError(null);
    setIsListening(true);
    try {
      recognitionRef.current.start();
    } catch (e) {
      console.error("Speech recognition start failed", e);
      setIsListening(false);
    }
  }, []);

  const stop = useCallback(() => {
    setIsListening(false);
    recognitionRef.current?.stop();
  }, []);

  const clear = useCallback(() => {
    setTranscript("");
  }, []);

  return { 
    transcript, 
    isListening, 
    error, 
    start, 
    stop, 
    clear,
    setTranscript 
  };
}
