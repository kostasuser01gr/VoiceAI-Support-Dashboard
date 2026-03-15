"use client";

import { motion, AnimatePresence, Variants } from "framer-motion";
import { ActionCards } from "@/components/features/actions/action-cards";
import { Badge, Card } from "@/components/ui/primitives";
import { ProcessResponse } from "@/lib/schema";

type ResultSectionProps = {
  result: ProcessResponse | null;
  loading: boolean;
  editableEmailDraft: string;
  analysis?: any;
};

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.2,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20, filter: "blur(10px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: {
      duration: 0.8,
      ease: "easeOut",
    },
  },
};

export function ResultSection({
  result,
  loading,
  editableEmailDraft,
  analysis,
}: ResultSectionProps) {
  if (loading) {
    return (
      <div className="space-y-6">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      {!result ? (
        <motion.div
          key="empty"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.05, filter: "blur(20px)" }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="h-full min-h-[400px] flex flex-col items-center justify-center p-12 border border-white/5 rounded-[3rem] bg-white/[0.01] backdrop-blur-3xl relative overflow-hidden group shadow-[0_0_100px_rgba(0,0,0,0.5)]"
        >
          <div className="absolute inset-0 bg-gradient-to-b from-sky-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
          
          <div className="relative w-24 h-24 rounded-full bg-white/[0.02] border border-white/5 flex items-center justify-center mb-10 shadow-2xl">
            <div className="absolute inset-0 rounded-full bg-sky-500/10 blur-2xl animate-pulse" />
            <svg className="w-10 h-10 text-zinc-600 group-hover:text-sky-400 transition-colors duration-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          
          <h3 className="text-[10px] font-bold uppercase tracking-[0.5em] text-zinc-500 mb-4 relative">
            Awaiting Protocol
          </h3>
          <p className="text-sm text-zinc-600 text-center max-w-[280px] leading-relaxed relative font-light">
            Initiate voice capture or provide manual context to generate intelligence.
          </p>
        </motion.div>
      ) : (
        <motion.section
          key="result"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-8"
        >
          <motion.div variants={itemVariants}>
            <Card className="border-white/5 bg-white/[0.03] backdrop-blur-xl p-10 relative overflow-hidden group shadow-2xl">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-sky-500/20 to-transparent" />
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500">
                  Summary
                </h3>
                <Badge tone="neutral" className="bg-white/5 border-white/10 text-zinc-400 uppercase tracking-widest text-[9px]">{result.meta.model}</Badge>
              </div>
              <p className="text-xl leading-relaxed text-zinc-100 font-light tracking-tight">
                {result.summary}
              </p>
            </Card>
          </motion.div>

          <motion.div variants={itemVariants}>
            <ActionCards 
              actions={result.actions.taskList.map(t => ({ description: t }))} 
              emailDraft={editableEmailDraft} 
            />
          </motion.div>

          <motion.div variants={itemVariants}>
            <Card className="border-white/5 bg-white/[0.02] backdrop-blur-lg p-10 shadow-xl">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500 mb-10">
                Audit Trail
              </h3>
              <div className="relative space-y-8">
                <div className="absolute left-[7px] top-2 bottom-2 w-px bg-white/5" />
                {result.auditTrail.map((item, idx) => (
                  <div key={idx} className="relative pl-10 group/item">
                    <div className="absolute left-0 top-1.5 w-3.5 h-3.5 rounded-full bg-zinc-900 border border-white/10 group-hover/item:border-sky-500/50 transition-colors duration-500 ring-8 ring-black" />
                    <div className="flex items-center gap-3 mb-2">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em]">{item.step}</p>
                      <div className="h-px flex-1 bg-white/[0.03]" />
                      <p className="text-[10px] font-medium text-zinc-600 tabular-nums">{new Date(item.timestamp).toLocaleTimeString()}</p>
                    </div>
                    <p className="text-sm text-zinc-500 leading-relaxed font-light">{item.details}</p>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-[3rem] border border-white/5 bg-white/[0.01] p-10 animate-pulse">
      <div className="h-3 w-24 bg-white/5 rounded-full mb-8" />
      <div className="space-y-4">
        <div className="h-5 w-full bg-white/5 rounded-full" />
        <div className="h-5 w-11/12 bg-white/5 rounded-full" />
        <div className="h-5 w-4/6 bg-white/5 rounded-full" />
      </div>
    </div>
  );
}
