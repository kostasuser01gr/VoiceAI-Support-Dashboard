"use client";

import { ActionCards } from "@/components/features/actions/action-cards";
import { Badge, Card } from "@/components/ui/primitives";
import { ProcessResponse } from "@/lib/schema";
import type { SessionAnalysis, SessionReviewState } from "@/lib/session-meta";

type ResultSectionProps = {
  result: ProcessResponse | null;
  loading: boolean;
  editableEmailDraft: string;
  onEditEmail: (text: string) => void;
  analysis: SessionAnalysis;
  review: SessionReviewState;
  onPersistReview: () => void;
  newComment: string;
  setNewComment: (text: string) => void;
  onAddComment: () => void;
};

export function ResultSection({
  result,
  loading,
  editableEmailDraft,
  onEditEmail: _onEditEmail,
  analysis: _analysis,
  review: _review,
  onPersistReview: _onPersistReview,
  newComment: _newComment,
  setNewComment: _setNewComment,
  onAddComment: _onAddComment,
}: ResultSectionProps) {
  if (loading) {
    return (
      <div className="space-y-8 animate-pulse">
        <SkeletonCard title="Summary" />
        <SkeletonCard title="Tasks" />
        <SkeletonCard title="Email Draft" />
      </div>
    );
  }

  if (!result) {
    return (
      <div className="h-full min-h-[500px] flex flex-col items-center justify-center p-12 border border-border rounded-lg bg-surface">
        <div className="w-16 h-16 rounded-full border border-border flex items-center justify-center mb-10">
          <svg className="w-6 h-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        </div>
        
        <h3 className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground mb-4">
          Intelligence Ready
        </h3>
        <p className="text-sm text-muted-foreground text-center max-w-[280px] leading-relaxed opacity-60">
          Capture voice or input text to generate automated summaries and actions.
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-8">
      <Card className="border-border bg-surface p-10">
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Executive Summary
          </h3>
          <Badge tone="neutral">{result.meta.model}</Badge>
        </div>
        <p className="text-xl leading-relaxed text-foreground font-medium">
          {result.summary}
        </p>
      </Card>

      <ActionCards 
        actions={result.actions.taskList.map(t => ({ description: t }))} 
        emailDraft={editableEmailDraft} 
      />

      <Card className="border-border bg-surface p-10">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-10">
          Traceability Log
        </h3>
        <div className="relative space-y-8">
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
          {result.auditTrail.map((item, idx) => (
            <div key={idx} className="relative pl-10">
              <div className="absolute left-0 top-1.5 w-4 h-4 rounded-full bg-surface border border-border flex items-center justify-center">
                <div className="w-1 h-1 rounded-full bg-zinc-600" />
              </div>
              <div className="flex items-center gap-4 mb-2">
                <p className="text-[10px] font-bold text-foreground uppercase tracking-widest">{item.step}</p>
                <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">{new Date(item.timestamp).toLocaleTimeString()}</p>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">{item.details}</p>
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}

function SkeletonCard({ title: _title }: { title: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-10">
      <div className="h-2 w-24 bg-border/50 rounded mb-8" />
      <div className="space-y-4">
        <div className="h-3 w-full bg-border/30 rounded" />
        <div className="h-3 w-5/6 bg-border/30 rounded" />
        <div className="h-3 w-4/6 bg-border/30 rounded" />
      </div>
    </div>
  );
}
