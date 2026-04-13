import React from 'react';
import { Sparkles, TerminalSquare } from 'lucide-react';
import type { AgentTaskSnapshot } from '../../../shared/types/agent';
import type {
  AgentCommandEvent,
  AgentCommandOutputEvent,
  AgentToolCallEvent,
  AgentTimelineEvent,
  AgentToolResultEvent,
} from '../../../shared/types/agentTimeline';
import { ApprovalCard } from './ApprovalCard';
import { CommandOutputBlock } from './CommandOutputBlock';
import { InteractionPrompt } from './InteractionPrompt';
import { ReasoningBlock } from './ReasoningBlock';
import { renderMarkdownLike } from './RichText';
import { ToolCallBlock, type HydratedToolCallItem } from './ToolCallBlock';

function getAssistantTurnKey(event: AgentTimelineEvent): string | null {
  if (event.kind === 'reasoning' && event.id.startsWith('reasoning-')) {
    return event.id.slice('reasoning-'.length);
  }

  if (event.kind === 'assistant-message' && event.id.startsWith('assistant-')) {
    return event.id.slice('assistant-'.length);
  }

  return null;
}

function orderTimelineEvents(events: AgentTimelineEvent[]): AgentTimelineEvent[] {
  return events
    .map((event, index) => ({
      event,
      index,
      turnKey: getAssistantTurnKey(event),
    }))
    .sort((left, right) => {
      if (left.turnKey && left.turnKey === right.turnKey && left.event.kind !== right.event.kind) {
        if (left.event.kind === 'reasoning') {
          return -1;
        }
        if (right.event.kind === 'reasoning') {
          return 1;
        }
      }

      return left.index - right.index;
    })
    .map(({ event }) => event);
}

function getToolCallIdFromCommandId(commandId: string): string | null {
  if (!commandId.startsWith('command-')) {
    return null;
  }

  return commandId.slice('command-'.length);
}

interface HydratedToolCallEvent {
  commandEvent?: AgentCommandEvent;
  commandOutputs: AgentCommandOutputEvent[];
  toolResultEvent?: AgentToolResultEvent;
}

type AssistantTurnSection =
  | { kind: 'reasoning'; event: AgentTimelineEvent & { kind: 'reasoning' } }
  | { kind: 'assistant-message'; event: AgentTimelineEvent & { kind: 'assistant-message' } }
  | { kind: 'tool-call-group'; events: HydratedToolCallItem[] }
  | { kind: 'approval-request'; event: AgentTimelineEvent & { kind: 'approval-request' } }
  | { kind: 'interaction-request'; event: AgentTimelineEvent & { kind: 'interaction-request' } }
  | { kind: 'approval-result'; event: AgentTimelineEvent & { kind: 'approval-result' } }
  | { kind: 'interaction-result'; event: AgentTimelineEvent & { kind: 'interaction-result' } };

type TimelineDisplayItem =
  | { kind: 'event'; event: AgentTimelineEvent }
  | { kind: 'assistant-turn'; key: string; sections: AssistantTurnSection[] };

function isInternalSystemNotice(event: AgentTimelineEvent): boolean {
  return event.kind === 'system-notice'
    && event.content === 'Imported existing chat transcript into the new agent runtime.';
}

function shouldRenderTimelineEvent(event: AgentTimelineEvent): boolean {
  if (event.kind === 'context-summary') {
    return false;
  }

  if (isInternalSystemNotice(event)) {
    return false;
  }

  if (event.kind === 'assistant-message') {
    return Boolean(event.content.trim());
  }

  if (event.kind === 'reasoning') {
    return Boolean(event.content.trim())
      || ['pending', 'running', 'streaming'].includes(event.status ?? '');
  }

  return true;
}

function isAssistantTurnEvent(event: AgentTimelineEvent): boolean {
  switch (event.kind) {
    case 'reasoning':
    case 'assistant-message':
    case 'tool-call':
    case 'approval-request':
    case 'interaction-request':
    case 'approval-result':
    case 'interaction-result':
      return true;
    default:
      return false;
  }
}

function EventShell({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-[18px] border border-zinc-800/90 bg-zinc-900/80 text-zinc-200">
        {icon}
      </div>
      <div className="min-w-0 flex-1 pt-1">
        <div className="mb-3 text-sm font-medium text-zinc-100">{title}</div>
        {children}
      </div>
    </div>
  );
}

export function AgentTimeline({
  task,
  assistantLabel,
  onApprove,
  onReject,
  onSubmitInteraction,
  onCancelInteraction,
}: {
  task: AgentTaskSnapshot;
  assistantLabel: string;
  onApprove: (approvalId: string) => void;
  onReject: (approvalId: string) => void;
  onSubmitInteraction: (interactionId: string, value: string) => void;
  onCancelInteraction: (interactionId: string) => void;
}) {
  const orderedTimeline = React.useMemo(() => orderTimelineEvents(task.timeline), [task.timeline]);
  const { hiddenEventIds, hydratedToolCalls } = React.useMemo(() => {
    const toolCallIds = new Set<string>();
    const commandEventsByToolCallId = new Map<string, AgentCommandEvent>();
    const commandOutputsByToolCallId = new Map<string, AgentCommandOutputEvent[]>();
    const toolResultsByToolCallId = new Map<string, AgentToolResultEvent>();
    const hiddenIds = new Set<string>();
    const hydrated = new Map<string, HydratedToolCallEvent>();

    for (const event of orderedTimeline) {
      if (event.kind === 'tool-call') {
        toolCallIds.add(event.toolCall.id);
        hydrated.set(event.id, {
          commandOutputs: [],
        });
      }
    }

    for (const event of orderedTimeline) {
      if (event.kind === 'command') {
        const toolCallId = getToolCallIdFromCommandId(event.commandId);
        if (toolCallId) {
          commandEventsByToolCallId.set(toolCallId, event);
          if (toolCallIds.has(toolCallId)) {
            hiddenIds.add(event.id);
          }
        }
      }

      if (event.kind === 'command-output') {
        const toolCallId = getToolCallIdFromCommandId(event.commandId);
        if (toolCallId) {
          const outputs = commandOutputsByToolCallId.get(toolCallId) ?? [];
          outputs.push(event);
          commandOutputsByToolCallId.set(toolCallId, outputs);
          if (toolCallIds.has(toolCallId)) {
            hiddenIds.add(event.id);
          }
        }
      }

      if (event.kind === 'tool-result') {
        toolResultsByToolCallId.set(event.toolCallId, event);
        if (toolCallIds.has(event.toolCallId)) {
          hiddenIds.add(event.id);
        }
      }
    }

    for (const event of orderedTimeline) {
      if (event.kind !== 'tool-call') {
        continue;
      }

      hydrated.set(event.id, {
        commandEvent: commandEventsByToolCallId.get(event.toolCall.id),
        commandOutputs: commandOutputsByToolCallId.get(event.toolCall.id) ?? [],
        toolResultEvent: toolResultsByToolCallId.get(event.toolCall.id),
      });
    }

    return {
      hiddenEventIds: hiddenIds,
      hydratedToolCalls: hydrated,
    };
  }, [orderedTimeline]);
  const visibleTimeline = React.useMemo(
    () => orderedTimeline.filter((event) => !hiddenEventIds.has(event.id) && shouldRenderTimelineEvent(event)),
    [hiddenEventIds, orderedTimeline],
  );
  const displayTimeline = React.useMemo<TimelineDisplayItem[]>(() => {
    const items: TimelineDisplayItem[] = [];

    for (let index = 0; index < visibleTimeline.length; index += 1) {
      const event = visibleTimeline[index];
      if (isAssistantTurnEvent(event)) {
        const sections: AssistantTurnSection[] = [];
        let cursor = index;

        while (cursor < visibleTimeline.length) {
          const currentEvent = visibleTimeline[cursor];
          if (!currentEvent || !isAssistantTurnEvent(currentEvent)) {
            break;
          }

          if (currentEvent.kind === 'tool-call') {
            const groupedEvents: HydratedToolCallItem[] = [];

            while (cursor < visibleTimeline.length && visibleTimeline[cursor]?.kind === 'tool-call') {
              const toolEvent = visibleTimeline[cursor] as AgentToolCallEvent;
              const hydrated = hydratedToolCalls.get(toolEvent.id);
              groupedEvents.push({
                event: toolEvent,
                commandEvent: hydrated?.commandEvent,
                commandOutputs: hydrated?.commandOutputs ?? [],
                toolResultEvent: hydrated?.toolResultEvent,
              });
              cursor += 1;
            }

            sections.push({
              kind: 'tool-call-group',
              events: groupedEvents,
            });
            continue;
          }

          if (currentEvent.kind === 'reasoning') {
            sections.push({
              kind: 'reasoning',
              event: currentEvent,
            });
          } else if (currentEvent.kind === 'assistant-message') {
            sections.push({
              kind: 'assistant-message',
              event: currentEvent,
            });
          } else if (currentEvent.kind === 'approval-request') {
            sections.push({
              kind: 'approval-request',
              event: currentEvent,
            });
          } else if (currentEvent.kind === 'interaction-request') {
            sections.push({
              kind: 'interaction-request',
              event: currentEvent,
            });
          } else if (currentEvent.kind === 'approval-result') {
            sections.push({
              kind: 'approval-result',
              event: currentEvent,
            });
          } else if (currentEvent.kind === 'interaction-result') {
            sections.push({
              kind: 'interaction-result',
              event: currentEvent,
            });
          }

          cursor += 1;
        }

        if (sections.length > 0) {
          items.push({
            kind: 'assistant-turn',
            key: sections[0]?.kind === 'tool-call-group'
              ? `assistant-turn-${sections[0].events.map((entry) => entry.event.id).join('-')}`
              : `assistant-turn-${sections[0].event.id}`,
            sections,
          });
        }
        index = cursor - 1;
        continue;
      }

      items.push({
        kind: 'event',
        event,
      });
    }

    return items;
  }, [hydratedToolCalls, visibleTimeline]);

  const renderAssistantTurn = (sections: AssistantTurnSection[]) => {
    const hasNonReasoningSection = sections.some((section) => section.kind !== 'reasoning');
    const title = hasNonReasoningSection ? assistantLabel : `${assistantLabel} · Thinking`;

    return (
      <EventShell icon={<Sparkles size={15} />} title={title}>
        <div className="space-y-3">
          {sections.map((section, sectionIndex) => {
            switch (section.kind) {
              case 'reasoning':
                return (
                  <div key={`reasoning-${section.event.id}`}>
                    {hasNonReasoningSection && (
                      <div className="mb-1.5 text-[11px] font-medium tracking-[0.02em] text-zinc-500">
                        Thinking
                      </div>
                    )}
                    <ReasoningBlock content={section.event.content} status={section.event.status} />
                  </div>
                );
              case 'assistant-message':
                return (
                  <div
                    key={`assistant-message-${section.event.id}`}
                    className="space-y-2 text-[15px] leading-6 text-zinc-200"
                  >
                    {renderMarkdownLike(section.event.content)}
                  </div>
                );
              case 'tool-call-group':
                return (
                  <div key={`tool-call-group-${sectionIndex}`}>
                    <div className="mb-2 text-[11px] font-medium tracking-[0.02em] text-zinc-500">
                      {section.events.length > 1 ? 'Tool Calls' : 'Tool Call'}
                    </div>
                    <ToolCallBlock items={section.events} />
                  </div>
                );
              case 'approval-request':
                return task.pendingApproval?.approvalId === section.event.approvalId ? (
                  <div key={`approval-request-${section.event.id}`}>
                    <div className="mb-3 text-[11px] font-medium tracking-[0.02em] text-zinc-500">Approval</div>
                    <ApprovalCard
                      approval={task.pendingApproval}
                      onApprove={() => onApprove(section.event.approvalId)}
                      onReject={() => onReject(section.event.approvalId)}
                    />
                  </div>
                ) : null;
              case 'interaction-request':
                return task.pendingInteraction?.interactionId === section.event.interactionId ? (
                  <div key={`interaction-request-${section.event.id}`}>
                    <div className="mb-3 text-[11px] font-medium tracking-[0.02em] text-zinc-500">Interaction Needed</div>
                    <InteractionPrompt
                      interaction={task.pendingInteraction}
                      onSubmit={(value) => onSubmitInteraction(section.event.interactionId, value)}
                      onCancel={() => onCancelInteraction(section.event.interactionId)}
                    />
                  </div>
                ) : null;
              case 'approval-result':
              case 'interaction-result':
                return (
                  <div
                    key={`${section.kind}-${section.event.id}`}
                    className="rounded-[18px] border border-zinc-800/70 bg-zinc-900/50 px-4 py-2 text-xs text-zinc-400"
                  >
                    {section.kind === 'approval-result'
                      ? `Approval ${section.event.approved ? 'granted' : 'rejected'}`
                      : section.event.cancelled
                        ? 'Interaction cancelled'
                        : 'Interaction submitted'}
                  </div>
                );
              default:
                return null;
            }
          })}
        </div>
      </EventShell>
    );
  };

  const renderEvent = (event: AgentTimelineEvent) => {
    switch (event.kind) {
      case 'user-message':
        return (
          <div className="flex justify-end">
            <div className="max-w-[78%] rounded-[22px] border border-zinc-700/80 bg-zinc-800/85 px-4 py-3 shadow-[0_24px_44px_-36px_rgba(0,0,0,0.95)] sm:max-w-[68%]">
              <div className="space-y-2 text-[15px] leading-6 text-zinc-100">
                {renderMarkdownLike(event.content)}
              </div>
            </div>
          </div>
        );
      case 'reasoning':
        return (
          <EventShell icon={<Sparkles size={15} />} title={`${assistantLabel} · Thinking`}>
            <ReasoningBlock content={event.content} status={event.status} />
          </EventShell>
        );
      case 'assistant-message':
        return (
          <EventShell icon={<Sparkles size={15} />} title={assistantLabel}>
            <div className="space-y-2 text-[15px] leading-6 text-zinc-200">
              {renderMarkdownLike(event.content)}
            </div>
          </EventShell>
        );
      case 'tool-result':
        return (
          <EventShell icon={<TerminalSquare size={15} />} title="Tool result">
            <div className="rounded-[20px] border border-zinc-800/80 bg-zinc-900/75 px-4 py-3 text-zinc-200">
              <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-6 text-zinc-100">
                {event.content}
              </pre>
            </div>
          </EventShell>
        );
      case 'command':
        return (
          <EventShell icon={<TerminalSquare size={15} />} title={`Remote command · ${event.host}`}>
            <div className="rounded-[18px] border border-zinc-800/80 bg-zinc-900/70 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">{event.status}</div>
              <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-6 text-zinc-100">
                {event.command}
              </pre>
              {typeof event.exitCode === 'number' && (
                <div className="mt-3 text-xs text-zinc-400">exit code: {event.exitCode}</div>
              )}
            </div>
          </EventShell>
        );
      case 'command-output':
        return (
          <div className="pl-[52px]">
            <CommandOutputBlock content={event.content} stream={event.stream} />
          </div>
        );
      case 'system-notice':
        return (
          <div className="rounded-[20px] border border-zinc-800/80 bg-zinc-900/60 px-4 py-3 text-sm leading-7 text-zinc-300">
            {event.content}
          </div>
        );
      case 'approval-request':
      case 'interaction-request':
      case 'approval-result':
      case 'interaction-result':
        return null;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-5 pt-4">
      {displayTimeline.map((item) => (
        <div
          key={
            item.kind === 'assistant-turn'
              ? item.key
              : item.event.id
          }
        >
          {item.kind === 'assistant-turn' ? (
            renderAssistantTurn(item.sections)
          ) : (
            renderEvent(item.event)
          )}
        </div>
      ))}
    </div>
  );
}
