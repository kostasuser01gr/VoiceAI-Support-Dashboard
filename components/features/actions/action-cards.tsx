"use client";
import { motion } from "framer-motion";

interface ActionCardsProps {
  actions: { description: string }[];
  emailDraft: string;
}

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const item = {
  hidden: { opacity: 0, y: 15 },
  show: { 
    opacity: 1, 
    y: 0,
    transition: {
      type: "spring" as const,
      stiffness: 260,
      damping: 20
    }
  }
};

export function ActionCards({ actions, emailDraft }: ActionCardsProps) {
  return (
    <motion.div 
      variants={container} 
      initial="hidden" 
      animate="show" 
      className="space-y-8 w-full mt-8"
    >
      {actions && actions.length > 0 && (
        <motion.div variants={item} className="relative overflow-hidden rounded-[2rem] border border-white/5 bg-white/[0.02] p-10 backdrop-blur-2xl">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.3em] text-sky-400">
              Operational Tasks
            </h3>
            <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">
              {actions.length} Identified
            </span>
          </div>

          <ul className="space-y-4">
            {actions.map((action, idx) => (
              <li key={idx} className="flex items-start gap-5 group">
                <div className="mt-1.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-sky-500/20 bg-sky-500/5 text-sky-400 text-[9px] font-bold">
                  {idx + 1}
                </div>
                <span className="text-zinc-300 text-sm leading-relaxed font-medium transition-colors group-hover:text-white">
                  {action.description}
                </span>
              </li>
            ))}
          </ul>
        </motion.div>
      )}

      {emailDraft && (
        <motion.div variants={item} className="relative overflow-hidden rounded-[2.5rem] border border-white/5 bg-white/[0.02] p-10 backdrop-blur-2xl">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          
          <h3 className="text-[10px] font-bold uppercase tracking-[0.3em] text-indigo-400 mb-8">
            Proposed Correspondence
          </h3>
          
          <div className="relative group">
            <div className="absolute -inset-4 rounded-[2rem] bg-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity blur-xl" />
            <div className="relative bg-black/40 p-8 rounded-2xl border border-white/5 font-mono text-xs text-zinc-400 whitespace-pre-wrap leading-relaxed">
              {emailDraft}
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
