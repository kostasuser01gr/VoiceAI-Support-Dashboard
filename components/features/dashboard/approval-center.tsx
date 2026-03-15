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
    <Card className="border-white/5 bg-white/[0.02] p-8">
      <div className="flex items-center justify-between mb-8">
        <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-zinc-500">
          Review & Compliance
        </h3>
        <Button variant="secondary" size="sm" onClick={onPersistReview}>
          Save State
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <ApprovalPill label="Task List" approved={review.tasksApproved} />
        <ApprovalPill label="Email Draft" approved={review.emailApproved} />
      </div>

      <div className="space-y-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Reviewer Notes</p>
        <div className="relative">
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a note for compliance..."
            className="w-full h-24 rounded-xl border border-white/5 bg-white/[0.01] p-4 text-sm text-zinc-300 outline-none focus:border-sky-500/50 transition-all resize-none"
          />
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onAddComment}
            className="absolute right-3 bottom-3"
          >
            Add Note
          </Button>
        </div>

        <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
          {review.comments.map((comment, idx) => (
            <div key={idx} className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
              <p className="text-xs text-zinc-400 leading-relaxed">{comment}</p>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function ApprovalPill({ label, approved }: { label: string; approved: boolean }) {
  return (
    <div className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/[0.01]">
      <span className="text-xs font-medium text-zinc-400">{label}</span>
      <Badge tone={approved ? "success" : "warning"}>
        {approved ? "Approved" : "Pending"}
      </Badge>
    </div>
  );
}
