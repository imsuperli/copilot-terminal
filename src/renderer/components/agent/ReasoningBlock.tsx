import React from 'react';
import { LoaderCircle } from 'lucide-react';
import { renderMarkdownLike } from './RichText';

export function ReasoningBlock({
  content,
  status,
}: {
  content: string;
  status?: string;
}) {
  const showPlaceholder = !content.trim() && ['pending', 'running', 'streaming'].includes(status ?? '');

  return (
    <div className="rounded-[22px] border border-zinc-800/80 bg-zinc-900/45 px-4 py-3">
      {showPlaceholder ? (
        <div className="inline-flex items-center gap-2 text-sm uppercase tracking-[0.18em] text-zinc-400">
          <LoaderCircle size={14} className="animate-spin" />
          <span>Thinking...</span>
        </div>
      ) : (
        <div className="space-y-2 text-sm leading-6 text-zinc-400">
          {renderMarkdownLike(content)}
        </div>
      )}
    </div>
  );
}
