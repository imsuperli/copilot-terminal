import React from 'react';
import { BrainCircuit } from 'lucide-react';
import { renderMarkdownLike } from './RichText';

export function ReasoningBlock({ content }: { content: string }) {
  return (
    <div className="rounded-[22px] border border-zinc-800/80 bg-zinc-900/45 px-4 py-3">
      <div className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
        <BrainCircuit size={13} />
        <span>Thinking</span>
      </div>
      <div className="space-y-3 text-sm leading-7 text-zinc-400">
        {renderMarkdownLike(content)}
      </div>
    </div>
  );
}
