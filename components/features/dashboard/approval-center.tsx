"use client";

import { Badge, Button, Card } from "@/components/ui/primitives";

type ApprovalCenterProps = {
  review: {
    tasksApproved: boolean;
    emailApproved: boolean;
    comments: string[];
  };
  onPersistReview: () => void;
  newComment: string;
  setNewComment: (text: string) => void;
  onAddComment: () => void;
};

export function ApprovalCenter({
  review,
  onPersistReview,
  newComment,
  setNewComment,
  onAddComment,
}: ApprovalCenterProps) {
  return (
    <Card className="border-border bg-surface p-10">
      <div className="flex items-center justify-between mb-10">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Governance & Review
        </h3>
        <Button variant="secondary" size="sm" onClick={onPersistReview}>
          Sync State
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-12">
        <ApprovalPill label="Action Items" approved={review.tasksApproved} />
        <ApprovalPill label="Communications" approved={review.emailApproved} />
      </div>

      <div className="space-y-6">
        <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Internal Review Notes</p>
        <div className="relative">
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Document compliance or specific edits..."
            className="w-full h-32 rounded-md border border-border bg-background p-5 text-sm text-foreground outline-none focus:border-border-strong transition-all resize-none"
          />
          <div className="absolute right-3 bottom-3">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onAddComment}
            >
              Post Note
            </Button>
          </div>
        </div>

        <div className="space-y-3 max-h-56 overflow-y-auto pr-3 scrollbar-minimal">
          {review.comments.map((comment, idx) => (
            <div key={idx} className="p-4 rounded-md bg-background border border-border/50">
              <p className="text-sm text-muted-foreground leading-relaxed">{comment}</p>
            </div>
          ))}
          {review.comments.length === 0 && (
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-800 text-center py-6">No reviewer records found</p>
          )}
        </div>
      </div>
    </Card>
  );
}

function ApprovalPill({ label, approved }: { label: string; approved: boolean }) {
  return (
    <div className="flex items-center justify-between p-5 rounded-md border border-border/50 bg-background/50 transition-colors hover:border-border">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Badge tone={approved ? "success" : "warning"}>
        {approved ? "Approved" : "Pending"}
      </Badge>
    </div>
  );
}
