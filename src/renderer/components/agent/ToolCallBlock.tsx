import React from 'react';
import { LoaderCircle } from 'lucide-react';
import type {
  AgentCommandEvent,
  AgentCommandOutputEvent,
  AgentToolResultEvent,
} from '../../../shared/types/agentTimeline';
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

function formatCommandOutput(outputs: AgentCommandOutputEvent[]): string {
  if (outputs.length === 0) {
    return '';
  }

  const grouped = outputs.reduce<Array<{ stream: AgentCommandOutputEvent['stream']; content: string }>>((sections, output) => {
    const lastSection = sections[sections.length - 1];
    if (lastSection && lastSection.stream === output.stream) {
      lastSection.content += output.content;
      return sections;
    }

    sections.push({
      stream: output.stream,
      content: output.content,
    });
    return sections;
  }, []);

  if (grouped.length === 1 && grouped[0] && grouped[0].stream !== 'stderr') {
    return grouped[0].content;
  }

  return grouped
    .map((section) => `[${section.stream}]\n${section.content}`)
    .join('\n\n');
}

export function ToolCallBlock({
  toolCall,
  commandEvent,
  commandOutputs = [],
  toolResult,
}: {
  toolCall: ToolCall;
  commandEvent?: AgentCommandEvent;
  commandOutputs?: AgentCommandOutputEvent[];
  toolResult?: AgentToolResultEvent;
}) {
  const shouldAutoExpand = ['error', 'blocked', 'rejected'].includes(toolCall.status);
  const [expanded, setExpanded] = React.useState(shouldAutoExpand);
  const commandOutput = React.useMemo(() => formatCommandOutput(commandOutputs), [commandOutputs]);
  const detailContent = commandOutput || toolCall.result || toolResult?.content || '';
  const isRunning = ['pending', 'approved', 'executing'].includes(toolCall.status);
  const commandPreview = 'command' in toolCall.params && typeof toolCall.params.command === 'string'
    ? toolCall.params.command
    : null;

  React.useEffect(() => {
    if (shouldAutoExpand) {
      setExpanded(true);
    }
  }, [shouldAutoExpand]);

  return (
    <div className="rounded-[20px] border border-zinc-800/80 bg-zinc-900/70 p-4 shadow-[0_20px_40px_-34px_rgba(0,0,0,0.9)]">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
      >
        <div className="min-w-0">
          {commandPreview ? (
            <>
              <div className="truncate font-mono text-[13px] text-zinc-200">
                {commandPreview}
              </div>
              <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                {toolCall.name}
              </div>
            </>
          ) : (
            <div className="text-sm font-medium text-zinc-100">{toolCall.name}</div>
          )}
          {isRunning && (
            <div className="mt-2 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-sky-300">
              <LoaderCircle size={12} className="animate-spin" />
              <span>{commandOutputs.length > 0 ? 'Streaming output' : 'Running'}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {commandEvent?.host && (
            <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
              {commandEvent.host}
            </span>
          )}
          {typeof commandEvent?.exitCode === 'number' && (
            <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
              exit {commandEvent.exitCode}
            </span>
          )}
          <span
            className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${getToolStatusTone(toolCall.status)} ${isRunning ? 'animate-pulse' : ''}`}
          >
            {toolCall.status}
          </span>
          <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
            {expanded ? 'Hide' : 'Show'}
          </span>
        </div>
      </button>

      {expanded && (
        <>
          {detailContent && (
            <div className="mt-3 rounded-2xl border border-zinc-800 bg-zinc-900/80 px-3 py-2.5">
              <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                {isRunning ? 'Live output' : commandEvent ? 'Output' : 'Result'}
              </div>
              <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-6 text-zinc-400">
                {detailContent}
              </pre>
            </div>
          )}

          {isRunning && !detailContent && (
            <div className="mt-3 rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/55 px-3 py-2.5">
              <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                <LoaderCircle size={12} className="animate-spin" />
                <span>Waiting for remote output</span>
              </div>
            </div>
          )}

          {toolCall.reason && (
            <p className="mt-3 text-xs leading-5 text-zinc-400">{toolCall.reason}</p>
          )}
        </>
      )}
    </div>
  );
}
