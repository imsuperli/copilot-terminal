import React from 'react';
import { Sparkles } from 'lucide-react';

const THINKING_LABEL = 'Thinking';

const thinkingSweepStyle: React.CSSProperties = {
  backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.48) 34%, rgba(255,255,255,1) 50%, rgba(255,255,255,0.48) 66%, rgba(255,255,255,0) 100%)',
  backgroundSize: '220% 100%',
  backgroundRepeat: 'no-repeat',
  backgroundClip: 'text',
  WebkitBackgroundClip: 'text',
};

export function formatThinkingElapsed(elapsedSeconds: number): string {
  if (elapsedSeconds <= 60) {
    return `${elapsedSeconds}s`;
  }

  const seconds = elapsedSeconds % 60;
  const totalMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedSeconds <= 3600) {
    return `${totalMinutes}m ${seconds}s`;
  }

  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  return `${hours}h ${minutes}m ${seconds}s`;
}

export function ThinkingStatusBar() {
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0);

  React.useEffect(() => {
    setElapsedSeconds(0);

    const intervalId = window.setInterval(() => {
      setElapsedSeconds((currentSeconds) => currentSeconds + 1);
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <div
      data-testid="agent-thinking-indicator"
      className="pt-6"
    >
      <div className="flex items-center gap-3 pb-1">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[18px] border border-zinc-800/90 bg-zinc-900/80 text-zinc-200">
          <Sparkles size={15} />
        </div>
        <div
          role="status"
          aria-live="polite"
          aria-label={`${THINKING_LABEL} ${formatThinkingElapsed(elapsedSeconds)}`}
          className="inline-flex items-center gap-3 whitespace-nowrap"
        >
          <div className="relative inline-flex overflow-hidden font-mono text-[14px] font-semibold tracking-[0.06em] text-zinc-600">
            <span>{THINKING_LABEL}</span>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 animate-agent-thinking-sweep text-transparent"
              style={thinkingSweepStyle}
            >
              {THINKING_LABEL}
            </span>
          </div>
          <span className="font-mono text-[13px] font-medium tabular-nums text-zinc-500">
            {formatThinkingElapsed(elapsedSeconds)}
          </span>
        </div>
      </div>
    </div>
  );
}
