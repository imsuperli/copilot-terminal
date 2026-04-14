import React from 'react';
import { Sparkles } from 'lucide-react';

const thinkingSweepStyle: React.CSSProperties = {
  backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.2) 32%, rgba(255,255,255,0.98) 50%, rgba(255,255,255,0.2) 68%, rgba(255,255,255,0) 100%)',
  backgroundSize: '220% 100%',
  backgroundClip: 'text',
  WebkitBackgroundClip: 'text',
};

export function ThinkingStatusBar() {
  return (
    <div
      data-testid="agent-thinking-indicator"
      className="sticky bottom-0 z-10 mt-auto bg-gradient-to-t from-[rgb(var(--background))] via-[rgb(var(--background))] to-transparent pt-6"
    >
      <div className="flex items-center gap-3 pb-1">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[18px] border border-zinc-800/90 bg-zinc-900/80 text-zinc-200">
          <Sparkles size={15} />
        </div>
        <div
          role="status"
          aria-live="polite"
          aria-label="Thinking"
          className="relative inline-flex overflow-hidden whitespace-nowrap text-[13px] font-medium tracking-[0.28em] text-zinc-500"
        >
          <span>Thinking</span>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 animate-agent-thinking-sweep text-transparent"
            style={thinkingSweepStyle}
          >
            Thinking
          </span>
        </div>
      </div>
    </div>
  );
}
