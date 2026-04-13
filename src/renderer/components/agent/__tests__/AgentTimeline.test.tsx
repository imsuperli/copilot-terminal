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

    const thinkingLabel = screen.getByText('Thinking');
    const assistantReply = screen.getByText('最终答复');
    expect(thinkingLabel.compareDocumentPosition(assistantReply) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByText('codex')).toHaveLength(1);
  });

  it('groups consecutive tool calls into one compact block and expands command details on demand', async () => {
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
            {
              id: 'tool-tool-2',
              taskId: 'task-1',
              paneId: 'pane-1',
              timestamp: '2026-04-12T00:00:01.500Z',
              kind: 'tool-call',
              status: 'executing',
              toolCall: {
                id: 'tool-2',
                name: 'execute_command',
                params: {
                  command: 'cat /etc/os-release',
                },
                status: 'executing',
              },
            },
            {
              id: 'command-tool-1',
              taskId: 'task-1',
              paneId: 'pane-1',
              timestamp: '2026-04-12T00:00:02.000Z',
              kind: 'command',
              status: 'completed',
              commandId: 'command-tool-1',
              host: '192.168.3.25',
              command: 'uname -a',
              interactive: false,
              exitCode: 0,
            },
            {
              id: 'command-output-tool-1',
              taskId: 'task-1',
              paneId: 'pane-1',
              timestamp: '2026-04-12T00:00:03.000Z',
              kind: 'command-output',
              status: 'completed',
              commandId: 'command-tool-1',
              stream: 'stdout',
              content: 'Linux localhost',
            },
            {
              id: 'command-tool-2',
              taskId: 'task-1',
              paneId: 'pane-1',
              timestamp: '2026-04-12T00:00:03.500Z',
              kind: 'command',
              status: 'running',
              commandId: 'command-tool-2',
              host: '192.168.3.25',
              command: 'cat /etc/os-release',
              interactive: false,
            },
            {
              id: 'tool-result-tool-1',
              taskId: 'task-1',
              paneId: 'pane-1',
              timestamp: '2026-04-12T00:00:04.000Z',
              kind: 'tool-result',
              status: 'completed',
              toolCallId: 'tool-1',
              toolName: 'execute_command',
              content: 'Linux localhost',
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

    expect(screen.getByText('Tool Calls')).toBeInTheDocument();
    expect(screen.getAllByText('codex')).toHaveLength(1);
    expect(screen.getByText('uname -a')).toBeInTheDocument();
    expect(screen.getByText('cat /etc/os-release')).toBeInTheDocument();
    expect(screen.queryByText('execute_command')).not.toBeInTheDocument();
    expect(screen.queryByText('192.168.3.25')).not.toBeInTheDocument();
    expect(screen.queryByText(/exit 0/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Linux localhost')).not.toBeInTheDocument();
    expect(screen.queryByText('Tool result')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show details for uname -a' }));

    expect(screen.getByText('Linux localhost')).toBeInTheDocument();
    expect(screen.queryByText('192.168.3.25')).not.toBeInTheDocument();

    expect(screen.queryByText('Running')).not.toBeInTheDocument();
  });

  it('keeps a single agent block when an empty assistant message is followed by tool calls', () => {
    render(
      <AgentTimeline
        task={createTaskSnapshot({
          timeline: [
            {
              id: 'assistant-turn-1',
              taskId: 'task-1',
              paneId: 'pane-1',
              timestamp: '2026-04-12T00:00:01.000Z',
              kind: 'assistant-message',
              status: 'completed',
              content: '',
            },
            {
              id: 'tool-tool-1',
              taskId: 'task-1',
              paneId: 'pane-1',
              timestamp: '2026-04-12T00:00:01.500Z',
              kind: 'tool-call',
              status: 'completed',
              toolCall: {
                id: 'tool-1',
                name: 'execute_command',
                params: {
                  command: 'df -h',
                },
                status: 'completed',
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

    expect(screen.getAllByText('codex')).toHaveLength(1);
    expect(screen.getByText('Tool Call')).toBeInTheDocument();
    expect(screen.getByText('df -h')).toBeInTheDocument();
  });

  it('does not render internal context summary events', () => {
    render(
      <AgentTimeline
        task={createTaskSnapshot({
          timeline: [
            {
              id: 'context-summary-1',
              taskId: 'task-1',
              paneId: 'pane-1',
              timestamp: '2026-04-12T00:00:01.000Z',
              kind: 'context-summary',
              status: 'completed',
              summary: '历史上下文摘要：旧消息被压缩。',
            },
            {
              id: 'assistant-turn-1',
              taskId: 'task-1',
              paneId: 'pane-1',
              timestamp: '2026-04-12T00:00:02.000Z',
              kind: 'assistant-message',
              status: 'completed',
              content: '新的回复',
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

    expect(screen.queryByText('历史上下文摘要：旧消息被压缩。')).not.toBeInTheDocument();
    expect(screen.getByText('新的回复')).toBeInTheDocument();
  });
});
