import React from 'react';
import { renderMarkdownLike } from './RichText';

export function ReasoningBlock({ content }: { content: string }) {
  return (
    <div className="rounded-[22px] border border-zinc-800/80 bg-zinc-900/45 px-4 py-3">
      <div className="space-y-3 text-sm leading-7 text-zinc-400">
        {renderMarkdownLike(content)}
      </div>
    </div>
  );
}
