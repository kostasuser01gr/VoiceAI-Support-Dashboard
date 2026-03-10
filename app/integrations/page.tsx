"use client";

import { useState } from "react";

import { AppNav } from "@/components/app-nav";
import { Button, Card, Input, Toast } from "@/components/ui/primitives";

type IntegrationService = "gmail" | "calendar" | "jira_zendesk";

const cards: Array<{
  id: IntegrationService;
  title: string;
  description: string;
}> = [
  {
    id: "gmail",
    title: "Gmail",
    description: "Draft and review outbound follow-up emails.",
  },
  {
    id: "calendar",
    title: "Google Calendar",
    description: "Convert extracted tasks into calendar events.",
  },
  {
    id: "jira_zendesk",
    title: "Jira / Zendesk",
    description: "Send action items to issue tracking queues.",
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
      [service]: "Queuing...",
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
        [service]: `Queued job ${jobId}`,
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
              [service]: `${jobStatus}: ${jobResult}`,
            }));
          }
        } catch {
          setStatus((previous) => ({
            ...previous,
            [service]: "Could not fetch job status.",
          }));
        }
      }, 800);
    } catch (error) {
      setStatus((previous) => ({
        ...previous,
        [service]: error instanceof Error ? error.message : "Request failed.",
      }));
    }
  };

  const retryLatestJob = async (service: IntegrationService) => {
    const jobId = latestJob[service];
    if (!jobId) {
      setStatus((previous) => ({
        ...previous,
        [service]: "No previous job to retry.",
      }));
      return;
    }

    setStatus((previous) => ({
      ...previous,
      [service]: "Retrying...",
    }));

    try {
      const response = await fetch(`/api/integrations/jobs/${jobId}/retry`, {
        method: "POST",
      });
      const payload = (await response.json()) as { job?: { id: string } };
      if (!response.ok || !payload.job) {
        throw new Error("Retry failed.");
      }
      setLatestJob((previous) => ({
        ...previous,
        [service]: payload.job!.id,
      }));
      setStatus((previous) => ({
        ...previous,
        [service]: `Retry queued as ${payload.job!.id}`,
      }));
    } catch {
      setStatus((previous) => ({
        ...previous,
        [service]: "Retry failed.",
      }));
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#d9f5ff_0%,#f5f9ff_35%,#f7f6ff_60%,#ffffff_100%)] px-4 py-6 text-slate-900 md:px-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="rounded-3xl border border-white/60 bg-white/80 p-5 shadow-[0_10px_40px_rgba(15,23,42,0.08)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl font-semibold">Integrations</h1>
              <p className="text-sm text-slate-600">
                Integrations are mock mode for hackathon demo.
              </p>
            </div>
            <AppNav current="integrations" />
          </div>
          <Toast tone="warning" className="mt-4 text-xs">
            Integrations are mock mode for hackathon demo by default. Execution is blocked
            until approvals when `action=execute` + a DB `sessionId` are provided.
          </Toast>
          <label className="mt-3 block text-sm text-slate-700">
            Session ID for approval-gated execute (optional)
            <Input
              value={sessionId}
              onChange={(event) => setSessionId(event.target.value)}
              placeholder="uuid from session meta.requestId"
              className="mt-1"
            />
          </label>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          {cards.map((card) => (
            <Card key={card.title} className="rounded-2xl border border-white/60 bg-white/85 p-4">
              <h2 className="text-lg font-semibold">{card.title}</h2>
              <p className="mt-2 text-sm text-slate-600">{card.description}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => runIntegration(card.id, "connect_stub")}
                >
                  Connect (stub)
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => runIntegration(card.id, "dry_run")}
                >
                  Dry-run only
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => runIntegration(card.id, "execute")}
                >
                  Execute (gated)
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => retryLatestJob(card.id)}
                >
                  Retry last
                </Button>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                {status[card.id] ?? "No jobs yet."}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
