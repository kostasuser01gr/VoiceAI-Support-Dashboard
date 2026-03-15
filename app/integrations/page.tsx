"use client";

import { useState } from "react";

import { AppNav } from "@/components/app-nav";
import { Button, Input } from "@/components/ui/primitives";

type IntegrationService = "gmail" | "calendar" | "jira_zendesk";

const cards: Array<{
  id: IntegrationService;
  title: string;
  description: string;
}> = [
  {
    id: "gmail",
    title: "Gmail",
    description: "Automated drafting and distribution of follow-up intelligence.",
  },
  {
    id: "calendar",
    title: "Google Calendar",
    description: "Synchronization of extracted temporal requirements to primary calendars.",
  },
  {
    id: "jira_zendesk",
    title: "Jira / Zendesk",
    description: "Systemic handoff of action items to operational support queues.",
  },
];

export default function IntegrationsPage() {
  const [status, setStatus] = useState<Record<string, string>>({});
  const [latestJob, setLatestJob] = useState<Record<string, string>>({});
  const [sessionId, setSessionId] = useState("");

  const runIntegration = async (
    service: IntegrationService,
    action: "dry_run" | "connect_stub" | "execute",
  ) => {
    setStatus((previous) => ({
      ...previous,
      [service]: "Enqueuing...",
    }));

    try {
      const response = await fetch("/api/integrations/execute", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          service,
          action,
          sessionId: sessionId.trim() || undefined,
          payload: {
            source: "integrations_page",
            requestedAction: action,
          },
          idempotencyKey:
            action === "execute" ? `${service}:${action}:${sessionId || "none"}` : undefined,
        }),
      });

      const payload = (await response.json()) as {
        job?: { id: string };
        error?: { message?: string };
      };
      if (!response.ok || !payload.job) {
        throw new Error(payload.error?.message ?? "Could not enqueue job.");
      }
      const jobId = payload.job.id;

      setStatus((previous) => ({
        ...previous,
        [service]: `Job ${jobId.slice(0,8)} active`,
      }));
      setLatestJob((previous) => ({
        ...previous,
        [service]: jobId,
      }));

      window.setTimeout(async () => {
        try {
          const statusResponse = await fetch(`/api/integrations/jobs/${jobId}`, {
            cache: "no-store",
          });
          const statusPayload = (await statusResponse.json()) as {
            job?: { status?: string; result?: string };
          };
          if (statusPayload.job) {
            const jobStatus = statusPayload.job.status ?? "running";
            const jobResult = statusPayload.job.result ?? "in progress";
            setStatus((previous) => ({
              ...previous,
              [service]: `${jobStatus.toUpperCase()}: ${jobResult}`,
            }));
          }
        } catch {
          setStatus((previous) => ({
            ...previous,
            [service]: "Status unavailable",
          }));
        }
      }, 1200);
    } catch (error) {
      setStatus((previous) => ({
        ...previous,
        [service]: error instanceof Error ? error.message : "Handshake failed",
      }));
    }
  };

  const retryLatestJob = async (service: IntegrationService) => {
    const jobId = latestJob[service];
    if (!jobId) {
      setStatus((previous) => ({ ...previous, [service]: "Null reference" }));
      return;
    }

    setStatus((previous) => ({ ...previous, [service]: "Re-executing..." }));

    try {
      const response = await fetch(`/api/integrations/jobs/${jobId}/retry`, {
        method: "POST",
      });
      const payload = (await response.json()) as { job?: { id: string } };
      if (!response.ok || !payload.job) throw new Error("Retry sequence failed");
      setLatestJob((previous) => ({ ...previous, [service]: payload.job!.id }));
      setStatus((previous) => ({ ...previous, [service]: `Retrying: ${payload.job!.id.slice(0,8)}` }));
    } catch {
      setStatus((previous) => ({ ...previous, [service]: "System error" }));
    }
  };

  return (
    <div className="min-h-screen bg-black px-4 py-16 text-zinc-300 md:px-12">
      <div className="mx-auto max-w-[1200px]">
        <header className="mb-12 rounded-[2.5rem] border border-white/5 bg-white/[0.02] p-10 backdrop-blur-2xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-sky-400 mb-2">Connectivity</p>
              <h1 className="text-5xl font-bold tracking-tight text-white">External Pipelines</h1>
              <p className="mt-4 text-sm text-zinc-500 font-medium max-w-xl">
                Bridge session intelligence with your primary operational stack. Secure, gated, and fully audited.
              </p>
            </div>
            <AppNav current="integrations" />
          </div>
          
          <div className="mt-10 p-6 rounded-2xl bg-amber-500/5 border border-amber-500/10">
            <p className="text-xs text-amber-200/70 font-medium leading-relaxed">
              <span className="text-amber-400 font-bold uppercase tracking-widest mr-2">Note:</span> 
              Integrations are operating in high-fidelity mock mode for this protocol cycle. Real-world execution requires explicit administrative approval.
            </p>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_auto]">
            <div className="relative group">
              <Input
                value={sessionId}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSessionId(e.target.value)}
                placeholder="Session correlation ID (required for gated execution)..."
              />
            </div>
          </div>
        </header>

        <div className="grid gap-6 md:grid-cols-3">
          {cards.map((card) => (
            <div 
              key={card.id} 
              className="rounded-[2rem] border border-white/5 bg-white/[0.01] p-8 transition-all hover:bg-white/[0.02] hover:border-white/10"
            >
              <h2 className="text-xl font-bold text-white mb-3">{card.title}</h2>
              <p className="text-sm text-zinc-500 leading-relaxed mb-8">{card.description}</p>
              
              <div className="space-y-3">
                <Button
                  size="sm"
                  variant="primary"
                  className="w-full"
                  onClick={() => runIntegration(card.id, "execute")}
                >
                  Execute Sequence
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => runIntegration(card.id, "dry_run")}
                  >
                    Dry Run
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => retryLatestJob(card.id)}
                  >
                    Retry
                  </Button>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full text-[10px]"
                  onClick={() => runIntegration(card.id, "connect_stub")}
                >
                  Configure Stub
                </Button>
              </div>

              <div className="mt-8 pt-6 border-t border-white/5">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-600 mb-2">Status</p>
                <p className="text-xs font-mono text-sky-400/80">
                  {status[card.id] ?? "Idle"}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
