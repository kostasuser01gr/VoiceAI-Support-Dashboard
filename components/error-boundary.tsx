"use client";

import type { ReactNode } from "react";
import { Component } from "react";

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  message: string;
  stack?: string;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: "",
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message,
      stack: error.stack,
    };
  }

  componentDidCatch(error: Error) {
    console.error("dashboard_error_boundary", error);
  }

  private async copyDiagnostics() {
    const diagnostics = [
      "voice-to-action-agent runtime fallback",
      `message: ${this.state.message}`,
      `path: ${typeof window !== "undefined" ? window.location.pathname : "unknown"}`,
      `time: ${new Date().toISOString()}`,
      this.state.stack ? `stack: ${this.state.stack}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      await navigator.clipboard.writeText(diagnostics);
    } catch {
      // Fallback still shows diagnostics inline.
    }
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="mx-auto mt-12 max-w-2xl rounded-[2rem] border border-rose-500/20 bg-rose-500/5 p-12 text-zinc-300 shadow-2xl backdrop-blur-xl">
        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-rose-400">
          Runtime Exception
        </p>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-white">The dashboard encountered a failure.</h1>
        <p className="mt-3 text-sm text-zinc-500 leading-relaxed">
          A safe circuit breaker has been triggered. Please review the diagnostics below and verify service health before attempting to reload.
        </p>
        <div className="mt-6 rounded-xl bg-black/40 border border-white/5 p-4 font-mono text-xs text-rose-300/80 overflow-auto max-h-40 leading-relaxed">
          {this.state.message || "Unknown runtime error."}
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => this.copyDiagnostics()}
            className="h-10 px-5 rounded-lg bg-white text-black text-sm font-bold tracking-tight hover:bg-white/90 transition-all"
          >
            Copy Diagnostics
          </button>
          <a
            href="/api/health"
            target="_blank"
            className="h-10 px-5 rounded-lg border border-white/10 bg-white/5 text-zinc-400 text-sm font-bold tracking-tight hover:bg-white/10 transition-all flex items-center"
          >
            View Status
          </a>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="h-10 px-5 rounded-lg border border-white/10 bg-white/5 text-zinc-400 text-sm font-bold tracking-tight hover:bg-white/10 transition-all"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }
}
