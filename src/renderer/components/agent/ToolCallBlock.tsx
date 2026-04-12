import React from 'react';
import type { ToolCall } from '../../../shared/types/chat';

function getToolStatusTone(status: ToolCall['status']) {
  switch (status) {
    case 'completed':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
    case 'approved':
    case 'executing':
      return 'border-sky-500/30 bg-sky-500/10 text-sky-200';
    case 'rejected':
    case 'blocked':
    case 'error':
      return 'border-red-500/30 bg-red-500/10 text-red-200';
    default:
      return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  }
}

export function ToolCallBlock({ toolCall }: { toolCall: ToolCall }) {
  return (
    <div className="rounded-[20px] border border-zinc-800/80 bg-zinc-900/70 p-4 shadow-[0_20px_40px_-34px_rgba(0,0,0,0.9)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium text-zinc-100">{toolCall.name}</div>
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${getToolStatusTone(toolCall.status)}`}>
          {toolCall.status}
        </span>
      </div>

      {'command' in toolCall.params && typeof toolCall.params.command === 'string' && (
        <div className="mt-3">
          <div className="mb-1 text-[11px] uppercase tracking-[0.18em] text-zinc-500">Command</div>
          <pre className="overflow-x-auto rounded-2xl border border-zinc-800/80 bg-[#0d0d10] px-3 py-2.5 font-mono text-[12px] leading-6 text-zinc-100">
            {toolCall.params.command}
          </pre>
        </div>
      )}

      {toolCall.result && (
        <div className="mt-3 rounded-2xl border border-zinc-800 bg-zinc-900/80 px-3 py-2.5">
          <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">Result</div>
          <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-6 text-zinc-100">
            {toolCall.result}
          </pre>
        </div>
      )}

      {toolCall.reason && (
        <p className="mt-3 text-xs leading-5 text-zinc-400">{toolCall.reason}</p>
      )}
    </div>
  );
}
