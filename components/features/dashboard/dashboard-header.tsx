"use client";

import { Badge, Button } from "@/components/ui/primitives";
import { AppNav } from "@/components/app-nav";
import { t } from "@/lib/i18n";
import { type ProcessResponse } from "@/lib/schema";

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
      ? "bg-emerald-500/5 text-emerald-400 border-emerald-500/10"
      : status === "Processing"
        ? "bg-white/5 text-white border-white/10"
        : status === "Error"
          ? "bg-rose-500/5 text-rose-400 border-rose-500/10"
          : "bg-surface text-muted-foreground border-border";

  return (
    <header className="mb-12 rounded-lg border border-border bg-surface p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground">
              Voice Intelligence
            </p>
            {demoSafeEnabled && (
              <Badge tone="warning">Demo</Badge>
            )}
          </div>
          <h1 className="text-3xl font-medium tracking-tight text-white">Action Center</h1>
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <span>{latestSessionText}</span>
            <span className="w-1 h-1 rounded-full bg-zinc-800" />
            <span>{sessionIdentity.name}</span>
            <span className="w-1 h-1 rounded-full bg-zinc-800" />
            <span className="opacity-50">{sessionIdentity.email}</span>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-4">
          <div className={`flex items-center gap-2 rounded-md border px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${statusPillClass}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${status === "Listening" ? "animate-pulse bg-emerald-400" : "bg-current"}`} />
            {localizedStatus}
          </div>
          
          <div className="h-6 w-px bg-border mx-2 hidden md:block" />
          
          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              onClick={onProcess}
              disabled={processingDisabled}
              className="min-w-[120px]"
            >
              {t(language,"process")}
            </Button>
            <Button
              variant="secondary"
              onClick={onExport}
              disabled={!result}
            >
              {t(language,"export")}
            </Button>
            <AppNav current="dashboard" />
          </div>
        </div>
      </div>
    </header>
  );
}
