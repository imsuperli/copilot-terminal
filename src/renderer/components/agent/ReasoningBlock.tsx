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
    <div className="rounded-[22px] border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--secondary))_54%,transparent)] px-4 py-3">
      {showPlaceholder ? (
        <div className="inline-flex items-center gap-2 text-sm uppercase tracking-[0.18em] text-[rgb(var(--muted-foreground))]">
          <LoaderCircle size={14} className="animate-spin" />
          <span>Thinking...</span>
        </div>
      ) : (
        <div className="space-y-2 text-sm leading-6 text-[rgb(var(--muted-foreground))]">
          {renderMarkdownLike(content)}
        </div>
      )}
    </div>
  );
}
