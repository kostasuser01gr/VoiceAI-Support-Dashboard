"use client";

import type { StoredSession } from "@/lib/history";

type SharedReportViewProps = {
  session: StoredSession;
};

export function SharedReportView({ session }: SharedReportViewProps) {
  const { data, analysis, createdAt } = session;
  const { index, verifier } = analysis;

  const formattedDate = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'full',
    timeStyle: 'short'
  }).format(new Date(createdAt));

  const sentimentColor = 
    index.sentiment === 'positive' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
    index.sentiment === 'negative' ? 'text-rose-400 bg-rose-500/10 border-rose-500/20' :
    'text-zinc-400 bg-white/5 border-white/10';

  const urgencyColor = 
    index.urgency === 'high' ? 'text-rose-400 bg-rose-500/10 border-rose-500/20' :
    index.urgency === 'medium' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' :
    'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';

  return (
    <div className="min-h-screen bg-black py-16 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-16 text-center">
          <div className="inline-flex items-center rounded-full border border-sky-500/30 bg-sky-500/10 px-4 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-sky-400 mb-6">
            Official Voice-to-Action Report
          </div>
          <h1 className="text-5xl font-bold tracking-tight text-gradient sm:text-6xl">
            Session Intelligence
          </h1>
          <p className="mt-6 text-sm font-medium text-zinc-500 uppercase tracking-widest">
            Processed on {formattedDate}
          </p>
        </header>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 mb-12">
          <div className="rounded-3xl border border-white/5 bg-white/[0.02] p-8 backdrop-blur-xl transition-all hover:bg-white/[0.04]">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-4">Sentiment</p>
            <div className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${sentimentColor}`}>
              {index.sentiment}
            </div>
          </div>
          <div className="rounded-3xl border border-white/5 bg-white/[0.02] p-8 backdrop-blur-xl transition-all hover:bg-white/[0.04]">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-4">Urgency</p>
            <div className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${urgencyColor}`}>
              {index.urgency}
            </div>
          </div>
          <div className="rounded-3xl border border-white/5 bg-white/[0.02] p-8 backdrop-blur-xl transition-all hover:bg-white/[0.04]">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-4">Safety Score</p>
            <div className={`text-3xl font-bold tracking-tighter ${verifier.score >= 90 ? 'text-emerald-400' : 'text-amber-400'}`}>
              {verifier.score}%
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <section className="rounded-[2.5rem] border border-white/5 bg-white/[0.02] p-10 backdrop-blur-2xl">
            <h2 className="text-xs font-bold uppercase tracking-[0.3em] text-zinc-500 mb-8 pb-4 border-b border-white/5">Transcript Context</h2>
            <div className="max-w-none">
              <p className="text-zinc-200 text-lg leading-relaxed font-medium italic border-l-2 border-sky-500/50 pl-8 mb-10">
                &quot;{data.transcript}&quot;
              </p>
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-sky-400 mb-4">Executive Summary</h3>
              <p className="text-zinc-400 leading-relaxed text-base">
                {data.summary}
              </p>
            </div>
          </section>

          <section className="rounded-[2.5rem] border border-sky-500/10 bg-sky-500/[0.02] p-10 backdrop-blur-2xl">
            <h2 className="text-xs font-bold uppercase tracking-[0.3em] text-sky-400 mb-8 flex items-center gap-3">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              Extracted Actions
            </h2>
            <ul className="space-y-3">
              {data.actions.taskList.map((task, i) => (
                <li key={i} className="flex items-start gap-4 bg-white/[0.01] p-5 rounded-2xl border border-white/5 transition-all hover:border-white/10 hover:bg-white/[0.02]">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-500/20 text-sky-400 text-[10px] font-bold">
                    {i + 1}
                  </span>
                  <span className="text-zinc-300 text-sm leading-relaxed">{task}</span>
                </li>
              ))}
              {data.actions.taskList.length === 0 && (
                <p className="text-zinc-600 italic text-center py-6 text-sm">No action items were required for this session.</p>
              )}
            </ul>
          </section>

          <section className="rounded-[2.5rem] border border-white/5 bg-white/[0.02] p-10 backdrop-blur-2xl">
            <h2 className="text-xs font-bold uppercase tracking-[0.3em] text-zinc-500 mb-8 flex items-center gap-3">
              <svg className="h-4 w-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Draft Correspondence
            </h2>
            <div className="bg-black/40 rounded-2xl p-8 font-mono text-xs text-zinc-400 whitespace-pre-wrap border border-white/5 leading-relaxed">
              {data.actions.emailDraft}
            </div>
          </section>

          <section className="rounded-[2.5rem] border border-white/5 bg-white/[0.02] p-10 backdrop-blur-2xl">
            <h2 className="text-xs font-bold uppercase tracking-[0.3em] text-zinc-500 mb-8">Semantic Context</h2>
            <div className="flex flex-wrap gap-3">
              {index.topics.map(topic => (
                <span key={topic} className="px-4 py-1.5 border border-indigo-500/20 bg-indigo-500/5 text-indigo-400 rounded-full text-[10px] font-bold uppercase tracking-widest">
                  {topic}
                </span>
              ))}
              {index.entities.map(entity => (
                <span key={entity} className="px-4 py-1.5 border border-white/5 bg-white/5 text-zinc-400 rounded-full text-[10px] font-bold uppercase tracking-widest">
                  {entity}
                </span>
              ))}
            </div>
          </section>
        </div>

        <footer className="mt-20 text-center border-t border-white/5 pt-12">
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-600 mb-2">Automated AI Intelligence Report</p>
          <p className="text-xs text-zinc-700 font-medium tracking-tight">&copy; 2026 Voice-to-Action Agent Protocol. Highly Confidential.</p>
        </footer>
      </div>
    </div>
  );
}
