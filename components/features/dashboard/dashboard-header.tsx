"use client";

import { Badge, Button } from "@/components/ui/primitives";
import { AppNav } from "@/components/app-nav";
import { t } from "@/lib/i18n";
import type { ProcessResponse } from "@/lib/schema";

type DashboardHeaderProps = {
  status: string;
  localizedStatus: string;
  sessionIdentity: {
    name: string;
    email: string;
    role: string;
  };
  latestSessionText: string;
  demoSafeEnabled: boolean;
  language: string;
  processingDisabled: boolean;
  onProcess: () => void;
  onExport: () => void;
  result: ProcessResponse | null;
};

export function DashboardHeader({
  status,
  localizedStatus,
  sessionIdentity,
  latestSessionText,
  demoSafeEnabled,
  language,
  processingDisabled,
  onProcess,
  onExport,
  result,
}: DashboardHeaderProps) {
  const statusPillClass =
    status === "Listening"
      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_15px_rgba(52,211,153,0.1)]"
      : status === "Processing"
        ? "bg-sky-500/10 text-sky-400 border-sky-500/20 shadow-[0_0_15px_rgba(56,189,248,0.1)]"
        : status === "Error"
          ? "bg-rose-500/10 text-rose-400 border-rose-500/20 shadow-[0_0_15px_rgba(251,113,133,0.1)]"
          : "bg-white/[0.03] text-zinc-500 border-white/5";

  return (
    <header className="mb-12 rounded-[3rem] border border-white/5 bg-white/[0.01] backdrop-blur-2xl p-8 md:p-10 shadow-2xl relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="absolute -top-24 -left-24 w-48 h-48 bg-sky-500/5 blur-[100px] rounded-full" />
      
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 relative z-10">
        <div>
          <div className="flex items-center gap-4 mb-4">
            <div className="px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20">
              <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-sky-400">
                Protocol v1.2
              </p>
            </div>
            {demoSafeEnabled && (
              <Badge tone="warning" className="lowercase border-amber-500/20 bg-amber-500/5 text-amber-500/80">Demo-safe</Badge>
            )}
          </div>
          <h1 className="text-5xl font-light tracking-tight text-white mb-6">
            Command <span className="text-zinc-500">Center</span>
          </h1>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-500">
            <span className="flex items-center gap-2">
              <span className="w-1 h-1 rounded-full bg-sky-500/50" />
              {latestSessionText}
            </span>
            <span className="flex items-center gap-2">
              <span className="w-1 h-1 rounded-full bg-sky-500/50" />
              {sessionIdentity.name} • {sessionIdentity.role}
            </span>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-4">
          <div className={`flex items-center gap-3 rounded-full border px-6 py-2.5 text-[10px] font-bold uppercase tracking-[0.2em] transition-all duration-700 ${statusPillClass}`}>
            <span className={`w-2 h-2 rounded-full ${status === "Listening" ? "animate-pulse bg-emerald-400" : status === "Processing" ? "animate-bounce bg-sky-400" : "bg-current opacity-40"}`} />
            {localizedStatus}
          </div>
          
          <div className="h-10 w-px bg-white/5 mx-2 hidden md:block" />
          
          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              onClick={onProcess}
              disabled={processingDisabled}
              className="px-8 bg-white text-black hover:bg-zinc-200 border-none h-11 text-[11px] font-bold uppercase tracking-widest rounded-full transition-transform active:scale-95"
            >
              {t(language, "process")}
            </Button>
            <Button
              variant="secondary"
              onClick={onExport}
              disabled={!result}
              className="px-8 border-white/10 hover:bg-white/5 h-11 text-[11px] font-bold uppercase tracking-widest rounded-full"
            >
              {t(language, "export")}
            </Button>
            <div className="ml-2">
              <AppNav current="dashboard" />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
