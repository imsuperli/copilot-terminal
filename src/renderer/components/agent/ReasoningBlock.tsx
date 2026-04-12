import React from 'react';
import { BrainCircuit } from 'lucide-react';
import { renderMarkdownLike } from './RichText';

export function ReasoningBlock({ content }: { content: string }) {
  return (
    <div className="rounded-[22px] border border-amber-500/20 bg-amber-500/8 px-4 py-3">
      <div className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-amber-200/90">
        <BrainCircuit size={13} />
        <span>Thinking</span>
      </div>
      <div className="space-y-3 text-sm leading-7 text-amber-50/90">
        {renderMarkdownLike(content)}
      </div>
    </div>
  );
}
