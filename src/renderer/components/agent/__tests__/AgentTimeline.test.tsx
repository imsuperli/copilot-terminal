import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import type { AgentTaskSnapshot } from '../../../../../shared/types/agent';
import { AgentTimeline } from '../AgentTimeline';

function createTaskSnapshot(overrides?: Partial<AgentTaskSnapshot>): AgentTaskSnapshot {
  return {
    taskId: 'task-1',
    paneId: 'pane-1',
    windowId: 'win-1',
    status: 'completed',
    providerId: 'provider-1',
    model: 'model-1',
    timeline: [],
    messages: [],
    offloadRefs: [],
    createdAt: '2026-04-12T00:00:00.000Z',
    updatedAt: '2026-04-12T00:00:00.000Z',
    ...overrides,
  };
}

describe('AgentTimeline', () => {
  it('renders reasoning before the matching assistant message even if the raw timeline is out of order', () => {
    render(
      <AgentTimeline
        task={createTaskSnapshot({
          timeline: [
            {
              id: 'assistant-turn-1',
              taskId: 'task-1',
              paneId: 'pane-1',
              timestamp: '2026-04-12T00:00:02.000Z',
              kind: 'assistant-message',
              status: 'completed',
              content: '最终答复',
            },
            {
              id: 'reasoning-turn-1',
              taskId: 'task-1',
              paneId: 'pane-1',
              timestamp: '2026-04-12T00:00:03.000Z',
              kind: 'reasoning',
              status: 'completed',
              content: '分析过程',
            },
          ],
        })}
        assistantLabel="codex"
        onApprove={() => {}}
        onReject={() => {}}
        onSubmitInteraction={() => {}}
        onCancelInteraction={() => {}}
      />,
    );

    const thinkingLabel = screen.getByText('codex · Thinking');
    const assistantLabel = screen.getByText('codex');
    expect(thinkingLabel.compareDocumentPosition(assistantLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps completed tool calls collapsed by default and expands on demand', async () => {
    const user = userEvent.setup();

    render(
      <AgentTimeline
        task={createTaskSnapshot({
          timeline: [
            {
              id: 'tool-tool-1',
              taskId: 'task-1',
              paneId: 'pane-1',
              timestamp: '2026-04-12T00:00:01.000Z',
              kind: 'tool-call',
              status: 'completed',
              toolCall: {
                id: 'tool-1',
                name: 'execute_command',
                params: {
                  command: 'uname -a',
                },
                status: 'completed',
                result: 'Linux localhost',
              },
            },
          ],
        })}
        assistantLabel="codex"
        onApprove={() => {}}
        onReject={() => {}}
        onSubmitInteraction={() => {}}
        onCancelInteraction={() => {}}
      />,
    );

    expect(screen.queryByText('Linux localhost')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /show/i }));

    expect(screen.getByText('Linux localhost')).toBeInTheDocument();
  });
});
