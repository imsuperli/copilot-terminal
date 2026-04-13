import React from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  LoaderCircle,
} from 'lucide-react';
import type {
  AgentCommandEvent,
  AgentCommandOutputEvent,
  AgentToolCallEvent,
  AgentToolResultEvent,
} from '../../../shared/types/agentTimeline';
import type { ToolCall } from '../../../shared/types/chat';

export interface HydratedToolCallItem {
  event: AgentToolCallEvent;
  commandEvent?: AgentCommandEvent;
  commandOutputs: AgentCommandOutputEvent[];
  toolResultEvent?: AgentToolResultEvent;
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

function formatToolSummary(toolCall: ToolCall): string {
  if ('command' in toolCall.params && typeof toolCall.params.command === 'string' && toolCall.params.command.trim()) {
    return toolCall.params.command.trim();
  }

  if ('path' in toolCall.params && typeof toolCall.params.path === 'string' && toolCall.params.path.trim()) {
    return toolCall.params.path.trim();
  }

  return toolCall.name
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function formatStatusLabel(status: ToolCall['status']): string {
  switch (status) {
    case 'approved':
      return 'Approved';
    case 'executing':
      return 'Running';
    case 'completed':
      return 'Completed';
    case 'rejected':
      return 'Rejected';
    case 'blocked':
      return 'Blocked';
    case 'error':
      return 'Failed';
    default:
      return 'Pending';
  }
}

function getStatusPresentation(status: ToolCall['status']) {
  switch (status) {
    case 'approved':
    case 'executing':
      return {
        tone: 'text-sky-300',
        icon: <LoaderCircle size={14} className="animate-spin" />,
      };
    case 'completed':
      return {
        tone: 'text-emerald-300',
        icon: <Check size={14} />,
      };
    case 'rejected':
    case 'blocked':
    case 'error':
      return {
        tone: 'text-red-300',
        icon: <CircleAlert size={14} />,
      };
    default:
      return {
        tone: 'text-amber-300',
        icon: <span className="inline-block h-2 w-2 rounded-full bg-current" />,
      };
  }
}

function buildDetailContent(item: HydratedToolCallItem): string {
  const commandOutput = formatCommandOutput(item.commandOutputs);
  return commandOutput || item.event.toolCall.result || item.toolResultEvent?.content || '';
}

export function ToolCallBlock({
  items,
}: {
  items: HydratedToolCallItem[];
}) {
  const errorIds = React.useMemo(
    () => items
      .filter((item) => ['error', 'blocked', 'rejected'].includes(item.event.toolCall.status))
      .map((item) => item.event.toolCall.id),
    [items],
  );
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(() => new Set(errorIds));

  React.useEffect(() => {
    if (errorIds.length === 0) {
      return;
    }

    setExpandedIds((current) => {
      const next = new Set(current);
      errorIds.forEach((id) => next.add(id));
      return next;
    });
  }, [errorIds]);

  return (
    <div className="rounded-[20px] border border-zinc-800/80 bg-zinc-900/70 p-3 shadow-[0_20px_40px_-34px_rgba(0,0,0,0.9)]">
      <div className="space-y-2">
        {items.map((item) => {
          const summary = formatToolSummary(item.event.toolCall);
          const detailContent = buildDetailContent(item);
          const isExpanded = expandedIds.has(item.event.toolCall.id);
          const isRunning = ['approved', 'executing'].includes(item.event.toolCall.status);
          const status = getStatusPresentation(item.event.toolCall.status);

          return (
            <div
              key={item.event.toolCall.id}
              className="rounded-2xl border border-zinc-800/80 bg-zinc-950/55"
            >
              <div className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1 truncate font-mono text-[12px] leading-6 text-zinc-200">
                  {summary}
                </div>

                <div className={`inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] ${status.tone}`}>
                  {status.icon}
                  <span>{formatStatusLabel(item.event.toolCall.status)}</span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setExpandedIds((current) => {
                      const next = new Set(current);
                      if (next.has(item.event.toolCall.id)) {
                        next.delete(item.event.toolCall.id);
                      } else {
                        next.add(item.event.toolCall.id);
                      }
                      return next;
                    });
                  }}
                  className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.18em] text-zinc-400 transition-colors hover:text-zinc-100"
                  aria-label={`${isExpanded ? 'Hide' : 'Show'} details for ${summary}`}
                >
                  {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  <span>{isExpanded ? 'Hide' : 'Show'}</span>
                </button>
              </div>

              {isExpanded && (
                <div className="border-t border-zinc-800/80 px-3 py-3">
                  {detailContent ? (
                    <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-6 text-zinc-300">
                      {detailContent}
                    </pre>
                  ) : isRunning ? (
                    <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-sky-300">
                      <LoaderCircle size={12} className="animate-spin" />
                      <span>Waiting for output</span>
                    </div>
                  ) : (
                    <div className="text-xs text-zinc-500">No output</div>
                  )}

                  {item.event.toolCall.reason && (
                    <p className="mt-3 text-xs leading-5 text-zinc-400">{item.event.toolCall.reason}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
