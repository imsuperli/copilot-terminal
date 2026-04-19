import React from 'react';

export function CommandOutputBlock({
  content,
  stream,
}: {
  content: string;
  stream: 'stdout' | 'stderr' | 'pty';
}) {
  return (
    <div className="overflow-hidden rounded-[18px] border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--background))_74%,transparent)]">
      <div className="border-b border-[rgb(var(--border))] px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-[rgb(var(--muted-foreground))]">
        {stream}
      </div>
      <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap break-words px-3 py-3 font-mono text-[12px] leading-6 text-[rgb(var(--muted-foreground))]">
        {content}
      </pre>
    </div>
  );
}
