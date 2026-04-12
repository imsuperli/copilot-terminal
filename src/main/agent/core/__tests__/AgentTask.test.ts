import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentRespondApprovalRequest, AgentSendRequest, AgentTaskSnapshot } from '../../../../../shared/types/agent';
import type { LLMProviderConfig, ToolCall } from '../../../../../shared/types/chat';
import { AgentTask } from '../task/AgentTask';

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function createSnapshot(overrides?: Partial<AgentTaskSnapshot>): AgentTaskSnapshot {
  return {
    taskId: 'task-1',
    paneId: 'pane-1',
    windowId: 'win-1',
    status: 'idle',
    providerId: 'provider-1',
    model: 'model-1',
    linkedPaneId: 'ssh-pane-1',
    sshContext: {
      host: '10.0.0.20',
      user: 'root',
      cwd: '/srv/app',
      windowId: 'win-1',
      paneId: 'ssh-pane-1',
    },
    timeline: [],
    messages: [],
    offloadRefs: [],
    createdAt: '2026-04-12T00:00:00.000Z',
    updatedAt: '2026-04-12T00:00:00.000Z',
    ...overrides,
  };
}

function createRequest(text: string): AgentSendRequest {
  return {
    paneId: 'pane-1',
    windowId: 'win-1',
    providerId: 'provider-1',
    model: 'model-1',
    text,
    enableTools: true,
    linkedPaneId: 'ssh-pane-1',
    sshContext: {
      host: '10.0.0.20',
      user: 'root',
      cwd: '/srv/app',
      windowId: 'win-1',
      paneId: 'ssh-pane-1',
    },
  };
}

function createProvider(): LLMProviderConfig {
  return {
    id: 'provider-1',
    type: 'anthropic',
    name: 'Claude API',
    apiKey: 'sk-ant-test',
    models: ['model-1'],
    defaultModel: 'model-1',
  };
}

function createDeps(overrides?: Record<string, unknown>) {
  return {
    chatService: {
      streamChat: vi.fn(),
    },
    toolExecutor: null,
    remoteTerminalManager: null,
    skillsManager: {
      getSystemPromptAddendum: vi.fn().mockReturnValue(''),
    },
    mcpHub: {
      describeAvailableTools: vi.fn().mockReturnValue(''),
    },
    commandSecurityEnabled: false,
    postState: vi.fn(),
    postEvent: vi.fn(),
    postError: vi.fn(),
    ...overrides,
  } as ConstructorParameters<typeof AgentTask>[1];
}

describe('AgentTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cancels pending approvals cleanly and allows the task to be reused', async () => {
    const approvalToolCall: ToolCall = {
      id: 'tool-approval',
      name: 'execute_command',
      params: {
        command: 'cat /etc/os-release',
        requires_approval: true,
        interactive: false,
      },
      status: 'pending',
    };
    const deps = createDeps();
    vi.mocked(deps.chatService.streamChat)
      .mockImplementationOnce(async (_request, callbacks) => {
        callbacks.onDone('<thinking>check</thinking>', [approvalToolCall]);
      })
      .mockImplementationOnce(async (_request, callbacks) => {
        callbacks.onDone('second round complete', []);
      });

    const task = new AgentTask(createSnapshot(), deps);
    const provider = createProvider();

    task.start(createRequest('first request'), provider);
    await flush();
    await flush();

    expect(task.getSnapshot().status).toBe('waiting_approval');
    expect(task.getSnapshot().pendingApproval?.approvalId).toBeTruthy();

    task.cancel();
    await flush();
    await flush();

    expect(task.getSnapshot().status).toBe('cancelled');
    expect(task.getSnapshot().pendingApproval).toBeUndefined();

    task.start(createRequest('second request'), provider);
    await flush();
    await flush();

    expect(task.getSnapshot().status).toBe('completed');
    expect(task.getSnapshot().messages.some((message) => message.role === 'user' && message.content === 'second request')).toBe(true);
  });

  it('rejects stale approval responses', async () => {
    const approvalToolCall: ToolCall = {
      id: 'tool-approval',
      name: 'execute_command',
      params: {
        command: 'cat /etc/os-release',
        requires_approval: true,
        interactive: false,
      },
      status: 'pending',
    };
    const deps = createDeps();
    vi.mocked(deps.chatService.streamChat).mockImplementationOnce(async (_request, callbacks) => {
      callbacks.onDone('<thinking>check</thinking>', [approvalToolCall]);
    });

    const task = new AgentTask(createSnapshot(), deps);
    task.start(createRequest('approval request'), createProvider());
    await flush();
    await flush();

    const request: AgentRespondApprovalRequest = {
      paneId: 'pane-1',
      taskId: 'task-1',
      approvalId: 'stale-approval-id',
      approved: true,
    };

    expect(() => task.respondApproval(request)).toThrow('Stale approval response');

    task.cancel();
    await flush();
    await flush();
  });

  it('rejects stale interaction responses', async () => {
    const interactiveToolCall: ToolCall = {
      id: 'tool-interaction',
      name: 'execute_command',
      params: {
        command: 'sudo cat /etc/shadow',
        requires_approval: false,
        interactive: true,
      },
      status: 'pending',
    };
    let resolveCommand: ((result: { exitCode: number; output: string; timedOut: boolean }) => void) | null = null;
    const deps = createDeps({
      remoteTerminalManager: {
        runCommand: vi.fn(({ callbacks }: { callbacks?: { onInteraction?: (request: { interactionId: string; commandId: string; interactionType: 'password'; prompt: string; submitLabel: string; secret: boolean }) => void } }) => {
          setImmediate(() => {
            callbacks?.onInteraction?.({
              interactionId: 'interaction-1',
              commandId: 'command-tool-interaction',
              interactionType: 'password',
              prompt: '[sudo] password for root:',
              submitLabel: 'Continue',
              secret: true,
            });
          });

          return {
            commandId: 'command-tool-interaction',
            sendInput: vi.fn(),
            cancel: vi.fn(() => resolveCommand?.({
              exitCode: 130,
              output: '',
              timedOut: false,
            })),
            result: new Promise((resolve) => {
              resolveCommand = resolve;
            }),
          };
        }),
      },
      toolExecutor: {
        execute: vi.fn(),
      },
    });
    vi.mocked(deps.chatService.streamChat).mockImplementationOnce(async (_request, callbacks) => {
      callbacks.onDone('<thinking>prompt</thinking>', [interactiveToolCall]);
    });

    const task = new AgentTask(createSnapshot(), deps);
    task.start(createRequest('interactive request'), createProvider());
    await flush();
    await flush();
    await flush();

    expect(task.getSnapshot().status).toBe('waiting_interaction');

    expect(() => task.submitInteraction({
      paneId: 'pane-1',
      taskId: 'task-1',
      interactionId: 'stale-interaction-id',
      input: 'secret',
    })).toThrow('Stale interaction response');

    task.cancel();
    await flush();
    await flush();
  });

  it('runs non-interactive execute_command calls through the silent SSH path', async () => {
    const commandToolCall: ToolCall = {
      id: 'tool-silent',
      name: 'execute_command',
      params: {
        command: 'uname -a && cat /etc/os-release',
        requires_approval: false,
        interactive: false,
      },
      status: 'pending',
    };
    const runCommand = vi.fn();
    const cancel = vi.fn();
    const runSilentCommand = vi.fn().mockImplementation(async (request: {
      callbacks?: {
        onStdout?: (chunk: string) => void;
        onStderr?: (chunk: string) => void;
      };
    }) => {
      request.callbacks?.onStdout?.('Linux localhost 5.15.0\n');
      return {
        cancel,
        result: Promise.resolve({
          stdout: 'Linux localhost 5.15.0\n',
          stderr: '',
          exitCode: 1,
        }),
      };
    });
    const deps = createDeps({
      remoteTerminalManager: {
        runCommand,
        runSilentCommand,
      },
      toolExecutor: {
        execute: vi.fn(),
      },
    });
    vi.mocked(deps.chatService.streamChat)
      .mockImplementationOnce(async (_request, callbacks) => {
        callbacks.onDone('<thinking>check</thinking>done', [commandToolCall]);
      })
      .mockImplementationOnce(async (_request, callbacks) => {
        callbacks.onDone('系统内核已经识别出来了。', []);
      });

    const task = new AgentTask(createSnapshot(), deps);
    task.start(createRequest('check version'), createProvider());
    await flush();
    await flush();
    await flush();

    expect(runCommand).not.toHaveBeenCalled();
    expect(runSilentCommand).toHaveBeenCalledWith(expect.objectContaining({
      windowId: 'win-1',
      paneId: 'ssh-pane-1',
      command: 'uname -a && cat /etc/os-release',
      callbacks: expect.any(Object),
    }));
    expect(task.getSnapshot().status).toBe('completed');
    expect(task.getSnapshot().timeline.some((event) => (
      event.kind === 'command'
      && event.status === 'completed'
      && event.exitCode === 1
    ))).toBe(true);
    expect(task.getSnapshot().timeline.some((event) => (
      event.kind === 'command-output'
      && event.content.includes('Linux localhost 5.15.0')
    ))).toBe(true);
    expect(task.getSnapshot().timeline.some((event) => (
      event.kind === 'tool-call'
      && event.toolCall.id === 'tool-silent'
      && event.toolCall.status === 'completed'
    ))).toBe(true);
    expect(cancel).not.toHaveBeenCalled();
  });

  it('sanitizes in-flight restored snapshots into a cancelled, non-interactive state', () => {
    const restored = AgentTask.prepareSnapshotForRestore(createSnapshot({
      status: 'waiting_interaction',
      pendingInteraction: {
        interactionId: 'interaction-1',
        commandId: 'command-1',
        interactionType: 'password',
        prompt: '[sudo] password for root:',
        secret: true,
        createdAt: '2026-04-12T00:00:00.000Z',
      },
      timeline: [
        {
          id: 'tool-tool-1',
          taskId: 'task-1',
          paneId: 'pane-1',
          timestamp: '2026-04-12T00:00:00.000Z',
          kind: 'tool-call',
          status: 'running',
          toolCall: {
            id: 'tool-1',
            name: 'execute_command',
            params: {
              command: 'sudo cat /etc/shadow',
            },
            status: 'executing',
          },
        },
        {
          id: 'interaction-interaction-1',
          taskId: 'task-1',
          paneId: 'pane-1',
          timestamp: '2026-04-12T00:00:00.000Z',
          kind: 'interaction-request',
          status: 'pending',
          interactionId: 'interaction-1',
          commandId: 'command-1',
          interactionType: 'password',
          prompt: '[sudo] password for root:',
          secret: true,
        },
      ],
    }));

    expect(restored.status).toBe('cancelled');
    expect(restored.pendingInteraction).toBeUndefined();
    expect(restored.timeline.some((event) => event.kind === 'interaction-result' && event.cancelled)).toBe(true);
    expect(restored.timeline.some((event) => event.kind === 'system-notice' && event.content.includes('could not be resumed'))).toBe(true);
    const cancelledToolCall = restored.timeline.find((event) => event.kind === 'tool-call');
    expect(cancelledToolCall?.status).toBe('cancelled');
    if (cancelledToolCall?.kind === 'tool-call') {
      expect(cancelledToolCall.toolCall.status).toBe('error');
    }
  });
});
