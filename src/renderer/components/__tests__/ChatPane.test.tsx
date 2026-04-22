import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { useMemo } from 'react';
import { I18nProvider } from '../../i18n';
import { ChatPane } from '../ChatPane';
import { useWindowStore } from '../../stores/windowStore';
import { WindowStatus } from '../../types/window';
import { notifyWorkspaceSettingsUpdated } from '../../utils/settingsEvents';
import type { AgentTaskSnapshot, AgentTaskStatePayload } from '../../../shared/types/agent';

type AgentListenerMap = {
  state: Set<(event: unknown, payload: AgentTaskStatePayload) => void>;
  error: Set<(event: unknown, payload: { paneId: string; error: string }) => void>;
};

let clipboardWriteTextMock = vi.fn().mockResolvedValue(undefined);

function createListenerMap(): AgentListenerMap {
  return {
    state: new Set(),
    error: new Set(),
  };
}

function createAgentSnapshot(overrides?: Partial<AgentTaskSnapshot>): AgentTaskSnapshot {
  return {
    taskId: 'task-1',
    paneId: 'chat-pane-1',
    windowId: 'win-1',
    status: 'running',
    providerId: 'provider-1',
    model: 'claude-sonnet-4-5',
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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function ChatPaneHarness() {
  const terminalWindow = useWindowStore((state) => (
    state.windows.find((window) => window.id === 'win-1') ?? null
  ));
  const pane = useMemo(() => {
    if (!terminalWindow || terminalWindow.layout.type !== 'split') {
      return null;
    }

    const node = terminalWindow.layout.children.find((child) => child.type === 'pane' && child.id === 'chat-pane-1');
    return node?.type === 'pane' ? node.pane : null;
  }, [terminalWindow]);

  if (!pane) {
    return null;
  }

  return (
    <ChatPane
      windowId="win-1"
      pane={pane}
      isActive
      onActivate={vi.fn()}
    />
  );
}

async function expectThinkingIndicator() {
  const indicator = await screen.findByTestId('agent-thinking-indicator');
  expect(indicator).toHaveTextContent('Thinking');
  expect(indicator).toHaveTextContent('0s');
  expect(screen.queryByText('Agent · Thinking')).not.toBeInTheDocument();
  return indicator;
}

describe('ChatPane', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    clipboardWriteTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'clipboard', {
      value: {
        writeText: clipboardWriteTextMock,
      },
      configurable: true,
    });
    useWindowStore.setState({
      windows: [],
      activeWindowId: null,
      mruList: [],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });
  });

  it('sends messages with linked SSH context and handles approval/interactions through the agent timeline', async () => {
    const user = userEvent.setup();
    const listeners = createListenerMap();

    vi.mocked(window.electronAPI.getSettings).mockResolvedValue({
      success: true,
      data: {
        language: 'zh-CN',
        ides: [],
        chat: {
          providers: [
            {
              id: 'provider-1',
              type: 'anthropic',
              name: 'Claude API',
              apiKey: 'sk-ant-test',
              models: ['claude-sonnet-4-5'],
              defaultModel: 'claude-sonnet-4-5',
            },
          ],
          activeProviderId: 'provider-1',
          enableCommandSecurity: true,
        },
      } as any,
    });
    vi.mocked(window.electronAPI.agentSend).mockResolvedValue({
      success: true,
      data: {
        taskId: 'task-1',
        status: 'running',
      },
    });
    vi.mocked(window.electronAPI.agentGetTask).mockResolvedValue({
      success: true,
      data: null,
    });
    vi.mocked(window.electronAPI.onAgentTaskState).mockImplementation((callback) => {
      listeners.state.add(callback as (event: unknown, payload: AgentTaskStatePayload) => void);
    });
    vi.mocked(window.electronAPI.offAgentTaskState).mockImplementation((callback) => {
      listeners.state.delete(callback as (event: unknown, payload: AgentTaskStatePayload) => void);
    });
    vi.mocked(window.electronAPI.onAgentTaskError).mockImplementation((callback) => {
      listeners.error.add(callback as (event: unknown, payload: { paneId: string; error: string }) => void);
    });
    vi.mocked(window.electronAPI.offAgentTaskError).mockImplementation((callback) => {
      listeners.error.delete(callback as (event: unknown, payload: { paneId: string; error: string }) => void);
    });

    const chatPane = {
      id: 'chat-pane-1',
      cwd: '',
      command: '',
      kind: 'chat' as const,
      status: WindowStatus.Paused,
      pid: null,
      chat: {
        messages: [],
        linkedPaneId: 'ssh-pane-1',
      },
    };

    useWindowStore.setState({
      windows: [
        {
          id: 'win-1',
          name: 'SSH Window',
          activePaneId: 'chat-pane-1',
          createdAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
          layout: {
            type: 'split',
            direction: 'horizontal',
            sizes: [0.5, 0.5],
            children: [
              {
                type: 'pane',
                id: 'ssh-pane-1',
                pane: {
                  id: 'ssh-pane-1',
                  cwd: '/srv/app',
                  command: '',
                  status: WindowStatus.Running,
                  pid: 101,
                  backend: 'ssh',
                  ssh: {
                    profileId: 'profile-1',
                    host: '10.0.0.20',
                    user: 'root',
                    remoteCwd: '/srv/app',
                  },
                },
              },
              {
                type: 'pane',
                id: 'chat-pane-1',
                pane: chatPane,
              },
            ],
          },
        },
      ],
      activeWindowId: 'win-1',
      mruList: ['win-1'],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    render(
      <I18nProvider>
        <ChatPaneHarness />
      </I18nProvider>,
    );

    await user.type(await screen.findByPlaceholderText('输入消息，Enter 发送，Shift+Enter 换行'), '帮我检查 nginx 状态');
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(await screen.findByText('帮我检查 nginx 状态')).toBeInTheDocument();
    await expectThinkingIndicator();

    await waitFor(() => {
      expect(window.electronAPI.agentSend).toHaveBeenCalledWith(expect.objectContaining({
        paneId: 'chat-pane-1',
        windowId: 'win-1',
        providerId: 'provider-1',
        model: 'claude-sonnet-4-5',
        enableTools: true,
        linkedPaneId: 'ssh-pane-1',
        sshContext: {
          host: '10.0.0.20',
          user: 'root',
          cwd: '/srv/app',
          windowId: 'win-1',
          paneId: 'ssh-pane-1',
        },
      }));
    });

    await act(async () => {
      const snapshot = createAgentSnapshot({
        timeline: [
          {
            id: 'user-1',
            taskId: 'task-1',
            paneId: 'chat-pane-1',
            timestamp: new Date().toISOString(),
            kind: 'user-message',
            status: 'completed',
            content: '帮我检查 nginx 状态',
          },
          {
            id: 'reasoning-1',
            taskId: 'task-1',
            paneId: 'chat-pane-1',
            timestamp: new Date().toISOString(),
            kind: 'reasoning',
            status: 'completed',
            content: '先确认服务状态，再看命令输出。',
          },
          {
            id: 'assistant-1',
            taskId: 'task-1',
            paneId: 'chat-pane-1',
            timestamp: new Date().toISOString(),
            kind: 'assistant-message',
            status: 'completed',
            content: '先看一下当前服务状态。',
          },
          {
            id: 'tool-tool-1',
            taskId: 'task-1',
            paneId: 'chat-pane-1',
            timestamp: new Date().toISOString(),
            kind: 'tool-call',
            status: 'pending',
            toolCall: {
              id: 'tool-1',
              name: 'execute_command',
              params: {
                command: 'systemctl status nginx --no-pager',
              },
              status: 'pending',
            },
          },
          {
            id: 'approval-1',
            taskId: 'task-1',
            paneId: 'chat-pane-1',
            timestamp: new Date().toISOString(),
            kind: 'approval-request',
            status: 'pending',
            approvalId: 'approval-1',
            reason: '模型将该命令标记为需要确认',
            toolCall: {
              id: 'tool-1',
              name: 'execute_command',
              params: {
                command: 'systemctl status nginx --no-pager',
              },
              status: 'pending',
            },
          },
        ],
        pendingApproval: {
          approvalId: 'approval-1',
          createdAt: new Date().toISOString(),
          reason: '模型将该命令标记为需要确认',
          toolCall: {
            id: 'tool-1',
            name: 'execute_command',
            params: {
              command: 'systemctl status nginx --no-pager',
            },
            status: 'pending',
          },
        },
        messages: [
          {
            id: 'assistant-1',
            role: 'assistant',
            content: '先看一下当前服务状态。',
            timestamp: new Date().toISOString(),
            model: 'claude-sonnet-4-5',
          },
        ],
        status: 'waiting_approval',
      });

      listeners.state.forEach((listener) => listener({}, {
        paneId: 'chat-pane-1',
        task: snapshot,
      }));
    });

    expect(await screen.findByText('先看一下当前服务状态。')).toBeInTheDocument();
    expect(screen.getAllByText('systemctl status nginx --no-pager').length).toBeGreaterThan(0);
    expect(screen.getByText(/Thinking/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Approve' }));

    expect(window.electronAPI.agentRespondApproval).toHaveBeenCalledWith({
      paneId: 'chat-pane-1',
      taskId: 'task-1',
      approvalId: 'approval-1',
      approved: true,
    });

    await act(async () => {
      const snapshot = createAgentSnapshot({
        timeline: [
          {
            id: 'assistant-1',
            taskId: 'task-1',
            paneId: 'chat-pane-1',
            timestamp: new Date().toISOString(),
            kind: 'assistant-message',
            status: 'completed',
            content: '先看一下当前服务状态。',
          },
          {
            id: 'command-1',
            taskId: 'task-1',
            paneId: 'chat-pane-1',
            timestamp: new Date().toISOString(),
            kind: 'command',
            status: 'completed',
            commandId: 'command-1',
            host: '10.0.0.20',
            command: 'systemctl status nginx --no-pager',
            interactive: false,
            exitCode: 0,
          },
          {
            id: 'command-output-1',
            taskId: 'task-1',
            paneId: 'chat-pane-1',
            timestamp: new Date().toISOString(),
            kind: 'command-output',
            status: 'completed',
            commandId: 'command-1',
            stream: 'pty',
            content: 'nginx.service is active (running)',
          },
          {
            id: 'tool-result-1',
            taskId: 'task-1',
            paneId: 'chat-pane-1',
            timestamp: new Date().toISOString(),
            kind: 'tool-result',
            status: 'completed',
            toolCallId: 'tool-1',
            toolName: 'execute_command',
            content: 'nginx.service is active (running)',
          },
        ],
        messages: [
          {
            id: 'tool-result-message-1',
            role: 'user',
            content: '',
            timestamp: new Date().toISOString(),
            toolResult: {
              toolCallId: 'tool-1',
              content: 'nginx.service is active (running)',
            },
          },
        ],
        pendingApproval: undefined,
        status: 'completed',
      });

      listeners.state.forEach((listener) => listener({}, {
        paneId: 'chat-pane-1',
        task: snapshot,
      }));
    });

    expect(await screen.findAllByText('nginx.service is active (running)')).not.toHaveLength(0);
    expect(screen.getAllByText('completed').length).toBeGreaterThan(0);
  });

  it('uses a translucent root surface so the appearance backdrop can show through', async () => {
    vi.mocked(window.electronAPI.getSettings).mockResolvedValue({
      success: true,
      data: {
        language: 'zh-CN',
        ides: [],
        chat: {
          providers: [],
          enableCommandSecurity: true,
        },
      } as any,
    });
    vi.mocked(window.electronAPI.agentGetTask).mockResolvedValue({
      success: true,
      data: null,
    });
    vi.mocked(window.electronAPI.onAgentTaskState).mockImplementation(() => {});
    vi.mocked(window.electronAPI.offAgentTaskState).mockImplementation(() => {});
    vi.mocked(window.electronAPI.onAgentTaskError).mockImplementation(() => {});
    vi.mocked(window.electronAPI.offAgentTaskError).mockImplementation(() => {});

    useWindowStore.setState({
      windows: [
        {
          id: 'win-1',
          name: 'Chat Window',
          activePaneId: 'chat-pane-1',
          createdAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
          layout: {
            type: 'split',
            direction: 'horizontal',
            sizes: [0.5, 0.5],
            children: [
              {
                type: 'pane',
                id: 'terminal-pane-1',
                pane: {
                  id: 'terminal-pane-1',
                  cwd: '/workspace/demo',
                  command: 'bash',
                  status: WindowStatus.Running,
                  pid: 101,
                  backend: 'local',
                },
              },
              {
                type: 'pane',
                id: 'chat-pane-1',
                pane: {
                  id: 'chat-pane-1',
                  cwd: '',
                  command: '',
                  kind: 'chat' as const,
                  status: WindowStatus.Paused,
                  pid: null,
                  chat: {
                    messages: [],
                  },
                },
              },
            ],
          },
        },
      ],
      activeWindowId: 'win-1',
      mruList: ['win-1'],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    render(
      <I18nProvider>
        <ChatPaneHarness />
      </I18nProvider>,
    );

    const root = await screen.findByTestId('chat-pane-root');
    expect(root).toHaveStyle({
      backgroundColor: 'var(--appearance-pane-background)',
      backdropFilter: 'blur(10px)',
    });
  });

  it('shows optimistic thinking immediately even when the pane prop has not been refreshed yet', async () => {
    const user = userEvent.setup();

    vi.mocked(window.electronAPI.getSettings).mockResolvedValue({
      success: true,
      data: {
        language: 'zh-CN',
        ides: [],
        chat: {
          providers: [
            {
              id: 'provider-1',
              type: 'anthropic',
              name: 'Claude API',
              apiKey: 'sk-ant-test',
              models: ['claude-sonnet-4-5'],
              defaultModel: 'claude-sonnet-4-5',
            },
          ],
          activeProviderId: 'provider-1',
          enableCommandSecurity: true,
        },
      } as any,
    });
    vi.mocked(window.electronAPI.agentSend).mockResolvedValue({
      success: true,
      data: {
        taskId: 'task-1',
        status: 'running',
      },
    });
    vi.mocked(window.electronAPI.agentGetTask).mockResolvedValue({
      success: true,
      data: null,
    });

    const stalePane = {
      id: 'chat-pane-1',
      cwd: '',
      command: '',
      kind: 'chat' as const,
      status: WindowStatus.Paused,
      pid: null,
      chat: {
        messages: [],
      },
    };

    useWindowStore.setState({
      windows: [
        {
          id: 'win-1',
          name: 'Chat Window',
          activePaneId: 'chat-pane-1',
          createdAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
          layout: {
            type: 'split',
            direction: 'horizontal',
            sizes: [1],
            children: [
              {
                type: 'pane',
                id: 'chat-pane-1',
                pane: stalePane,
              },
            ],
          },
        },
      ],
      activeWindowId: 'win-1',
      mruList: ['win-1'],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    render(
      <I18nProvider>
        <ChatPane
          windowId="win-1"
          pane={stalePane}
          isActive
          onActivate={vi.fn()}
        />
      </I18nProvider>,
    );

    await user.type(await screen.findByPlaceholderText('输入消息，Enter 发送，Shift+Enter 换行'), '马上给我反馈');
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(await screen.findByText('马上给我反馈')).toBeInTheDocument();
    await expectThinkingIndicator();
  });

  it('shows optimistic thinking immediately for follow-up messages before SSH preflight resolves', async () => {
    const user = userEvent.setup();
    let resolveProfile:
      | ((value: { success: true; data: any }) => void)
      | undefined;

    vi.mocked(window.electronAPI.getSettings).mockResolvedValue({
      success: true,
      data: {
        language: 'zh-CN',
        ides: [],
        chat: {
          providers: [
            {
              id: 'provider-1',
              type: 'anthropic',
              name: 'Claude API',
              apiKey: 'sk-ant-test',
              models: ['claude-sonnet-4-5'],
              defaultModel: 'claude-sonnet-4-5',
            },
          ],
          activeProviderId: 'provider-1',
          enableCommandSecurity: true,
        },
      } as any,
    });
    vi.mocked(window.electronAPI.agentSend).mockResolvedValue({
      success: true,
      data: {
        taskId: 'task-1',
        status: 'running',
      },
    });
    vi.mocked(window.electronAPI.agentGetTask).mockResolvedValue({
      success: true,
      data: null,
    });
    vi.mocked(window.electronAPI.getSSHProfile).mockImplementation(() => (
      new Promise((resolve) => {
        resolveProfile = resolve as (value: { success: true; data: any }) => void;
      })
    ));

    const existingMessages = [
      {
        id: 'user-previous-1',
        role: 'user' as const,
        content: '先看下磁盘',
        timestamp: new Date().toISOString(),
      },
      {
        id: 'assistant-previous-1',
        role: 'assistant' as const,
        content: '磁盘主要被日志占用。',
        timestamp: new Date().toISOString(),
      },
    ];

    useWindowStore.setState({
      windows: [
        {
          id: 'win-1',
          name: 'SSH Window',
          activePaneId: 'chat-pane-1',
          createdAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
          layout: {
            type: 'split',
            direction: 'horizontal',
            sizes: [0.5, 0.5],
            children: [
              {
                type: 'pane',
                id: 'ssh-pane-1',
                pane: {
                  id: 'ssh-pane-1',
                  cwd: '/srv/app',
                  command: '',
                  status: WindowStatus.Running,
                  pid: 101,
                  backend: 'ssh',
                  ssh: {
                    profileId: 'profile-1',
                    remoteCwd: '/srv/app',
                  },
                },
              },
              {
                type: 'pane',
                id: 'chat-pane-1',
                pane: {
                  id: 'chat-pane-1',
                  cwd: '',
                  command: '',
                  kind: 'chat',
                  status: WindowStatus.Paused,
                  pid: null,
                  chat: {
                    messages: existingMessages,
                    linkedPaneId: 'ssh-pane-1',
                    agent: createAgentSnapshot({
                      status: 'completed',
                      timeline: [
                        {
                          id: 'user-previous-1',
                          taskId: 'task-1',
                          paneId: 'chat-pane-1',
                          timestamp: new Date().toISOString(),
                          kind: 'user-message',
                          status: 'completed',
                          content: '先看下磁盘',
                        },
                        {
                          id: 'assistant-previous-1',
                          taskId: 'task-1',
                          paneId: 'chat-pane-1',
                          timestamp: new Date().toISOString(),
                          kind: 'assistant-message',
                          status: 'completed',
                          content: '磁盘主要被日志占用。',
                        },
                      ],
                      messages: existingMessages,
                    }),
                  },
                },
              },
            ],
          },
        },
      ],
      activeWindowId: 'win-1',
      mruList: ['win-1'],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    render(
      <I18nProvider>
        <ChatPaneHarness />
      </I18nProvider>,
    );

    await user.type(await screen.findByPlaceholderText('输入消息，Enter 发送，Shift+Enter 换行'), '继续看下 inode');
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(await screen.findByText('继续看下 inode')).toBeInTheDocument();
    await expectThinkingIndicator();
    expect(window.electronAPI.agentSend).not.toHaveBeenCalled();

    resolveProfile?.({
      success: true,
      data: {
        id: 'profile-1',
        name: 'Prod',
        host: '10.0.0.20',
        port: 22,
        user: 'root',
        authType: 'password',
      },
    });

    await waitFor(() => {
      expect(window.electronAPI.agentSend).toHaveBeenCalledWith(expect.objectContaining({
        text: '继续看下 inode',
        linkedPaneId: 'ssh-pane-1',
      }));
    });
  });

  it('keeps optimistic thinking visible while only internal bootstrap events have arrived', async () => {
    const user = userEvent.setup();
    const listeners = createListenerMap();

    vi.mocked(window.electronAPI.getSettings).mockResolvedValue({
      success: true,
      data: {
        language: 'zh-CN',
        ides: [],
        chat: {
          providers: [
            {
              id: 'provider-1',
              type: 'anthropic',
              name: 'Claude API',
              apiKey: 'sk-ant-test',
              models: ['claude-sonnet-4-5'],
              defaultModel: 'claude-sonnet-4-5',
            },
          ],
          activeProviderId: 'provider-1',
          enableCommandSecurity: true,
        },
      } as any,
    });
    vi.mocked(window.electronAPI.agentSend).mockResolvedValue({
      success: true,
      data: {
        taskId: 'task-1',
        status: 'running',
      },
    });
    vi.mocked(window.electronAPI.agentGetTask).mockResolvedValue({
      success: true,
      data: null,
    });
    vi.mocked(window.electronAPI.onAgentTaskState).mockImplementation((callback) => {
      listeners.state.add(callback as (event: unknown, payload: AgentTaskStatePayload) => void);
    });
    vi.mocked(window.electronAPI.offAgentTaskState).mockImplementation((callback) => {
      listeners.state.delete(callback as (event: unknown, payload: AgentTaskStatePayload) => void);
    });
    vi.mocked(window.electronAPI.onAgentTaskError).mockImplementation((callback) => {
      listeners.error.add(callback as (event: unknown, payload: { paneId: string; error: string }) => void);
    });
    vi.mocked(window.electronAPI.offAgentTaskError).mockImplementation((callback) => {
      listeners.error.delete(callback as (event: unknown, payload: { paneId: string; error: string }) => void);
    });

    useWindowStore.setState({
      windows: [
        {
          id: 'win-1',
          name: 'Chat Window',
          activePaneId: 'chat-pane-1',
          createdAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
          layout: {
            type: 'split',
            direction: 'horizontal',
            sizes: [1],
            children: [
              {
                type: 'pane',
                id: 'chat-pane-1',
                pane: {
                  id: 'chat-pane-1',
                  cwd: '',
                  command: '',
                  kind: 'chat',
                  status: WindowStatus.Paused,
                  pid: null,
                  chat: {
                    messages: [
                      {
                        id: 'legacy-assistant-1',
                        role: 'assistant',
                        content: '旧回复',
                        timestamp: new Date().toISOString(),
                      },
                    ],
                  },
                },
              },
            ],
          },
        },
      ],
      activeWindowId: 'win-1',
      mruList: ['win-1'],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    render(
      <I18nProvider>
        <ChatPaneHarness />
      </I18nProvider>,
    );

    await user.type(await screen.findByPlaceholderText('输入消息，Enter 发送，Shift+Enter 换行'), '继续分析');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await expectThinkingIndicator();

    await act(async () => {
      const snapshot = createAgentSnapshot({
        timeline: [
          {
            id: 'user-1',
            taskId: 'task-1',
            paneId: 'chat-pane-1',
            timestamp: new Date().toISOString(),
            kind: 'user-message',
            status: 'completed',
            content: '继续分析',
          },
          {
            id: 'notice-1',
            taskId: 'task-1',
            paneId: 'chat-pane-1',
            timestamp: new Date().toISOString(),
            kind: 'system-notice',
            status: 'completed',
            level: 'warning',
            content: 'Imported existing chat transcript into the new agent runtime.',
          },
          {
            id: 'context-summary-1',
            taskId: 'task-1',
            paneId: 'chat-pane-1',
            timestamp: new Date().toISOString(),
            kind: 'context-summary',
            status: 'completed',
            summary: '历史上下文摘要：旧消息被压缩。',
          },
        ],
        messages: [
          {
            id: 'legacy-assistant-1',
            role: 'assistant',
            content: '旧回复',
            timestamp: new Date().toISOString(),
          },
        ],
        status: 'running',
      });

      listeners.state.forEach((listener) => listener({}, {
        paneId: 'chat-pane-1',
        task: snapshot,
      }));
    });

    expect(screen.getByTestId('agent-thinking-indicator')).toHaveTextContent('Thinking');
    expect(screen.getByTestId('agent-thinking-indicator')).toHaveTextContent('0s');
    expect(screen.queryByText('Agent · Thinking')).not.toBeInTheDocument();
    expect(screen.queryByText('历史上下文摘要：旧消息被压缩。')).not.toBeInTheDocument();
  });

  it('keeps optimistic thinking visible when the first assistant state is an empty message', async () => {
    const user = userEvent.setup();
    const listeners = createListenerMap();

    vi.mocked(window.electronAPI.getSettings).mockResolvedValue({
      success: true,
      data: {
        language: 'zh-CN',
        ides: [],
        chat: {
          providers: [
            {
              id: 'provider-1',
              type: 'anthropic',
              name: 'Claude API',
              apiKey: 'sk-ant-test',
              models: ['claude-sonnet-4-5'],
              defaultModel: 'claude-sonnet-4-5',
            },
          ],
          activeProviderId: 'provider-1',
          enableCommandSecurity: true,
        },
      } as any,
    });
    vi.mocked(window.electronAPI.agentSend).mockResolvedValue({
      success: true,
      data: {
        taskId: 'task-1',
        status: 'running',
      },
    });
    vi.mocked(window.electronAPI.agentGetTask).mockResolvedValue({
      success: true,
      data: null,
    });
    vi.mocked(window.electronAPI.onAgentTaskState).mockImplementation((callback) => {
      listeners.state.add(callback as (event: unknown, payload: AgentTaskStatePayload) => void);
    });
    vi.mocked(window.electronAPI.offAgentTaskState).mockImplementation((callback) => {
      listeners.state.delete(callback as (event: unknown, payload: AgentTaskStatePayload) => void);
    });
    vi.mocked(window.electronAPI.onAgentTaskError).mockImplementation((callback) => {
      listeners.error.add(callback as (event: unknown, payload: { paneId: string; error: string }) => void);
    });
    vi.mocked(window.electronAPI.offAgentTaskError).mockImplementation((callback) => {
      listeners.error.delete(callback as (event: unknown, payload: { paneId: string; error: string }) => void);
    });

    useWindowStore.setState({
      windows: [
        {
          id: 'win-1',
          name: 'Chat Window',
          activePaneId: 'chat-pane-1',
          createdAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
          layout: {
            type: 'split',
            direction: 'horizontal',
            sizes: [1],
            children: [
              {
                type: 'pane',
                id: 'chat-pane-1',
                pane: {
                  id: 'chat-pane-1',
                  cwd: '',
                  command: '',
                  kind: 'chat',
                  status: WindowStatus.Paused,
                  pid: null,
                  chat: {
                    messages: [],
                  },
                },
              },
            ],
          },
        },
      ],
      activeWindowId: 'win-1',
      mruList: ['win-1'],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    render(
      <I18nProvider>
        <ChatPaneHarness />
      </I18nProvider>,
    );

    await user.type(await screen.findByPlaceholderText('输入消息，Enter 发送，Shift+Enter 换行'), '看下磁盘');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await expectThinkingIndicator();

    await act(async () => {
      const snapshot = createAgentSnapshot({
        timeline: [
          {
            id: 'user-1',
            taskId: 'task-1',
            paneId: 'chat-pane-1',
            timestamp: new Date().toISOString(),
            kind: 'user-message',
            status: 'completed',
            content: '看下磁盘',
          },
          {
            id: 'assistant-1',
            taskId: 'task-1',
            paneId: 'chat-pane-1',
            timestamp: new Date().toISOString(),
            kind: 'assistant-message',
            status: 'completed',
            content: '',
          },
        ],
        messages: [],
        status: 'running',
      });

      listeners.state.forEach((listener) => listener({}, {
        paneId: 'chat-pane-1',
        task: snapshot,
      }));
    });

    expect(screen.getByTestId('agent-thinking-indicator')).toHaveTextContent('Thinking');
    expect(screen.getByTestId('agent-thinking-indicator')).toHaveTextContent('0s');
    expect(screen.queryByText('Agent · Thinking')).not.toBeInTheDocument();
  });

  it('does not restore a purely optimistic task while the real agent task has not been created yet', async () => {
    vi.mocked(window.electronAPI.getSettings).mockResolvedValue({
      success: true,
      data: {
        language: 'zh-CN',
        ides: [],
        chat: {
          providers: [
            {
              id: 'provider-1',
              type: 'anthropic',
              name: 'Claude API',
              apiKey: 'sk-ant-test',
              models: ['claude-sonnet-4-5'],
              defaultModel: 'claude-sonnet-4-5',
            },
          ],
          activeProviderId: 'provider-1',
          enableCommandSecurity: true,
        },
      } as any,
    });
    vi.mocked(window.electronAPI.agentGetTask).mockResolvedValue({
      success: true,
      data: null,
    });

    const optimisticPane = {
      id: 'chat-pane-1',
      cwd: '',
      command: '',
      kind: 'chat' as const,
      status: WindowStatus.Paused,
      pid: null,
      chat: {
        messages: [
          {
            id: 'optimistic-user-1',
            role: 'user' as const,
            content: '继续处理',
            timestamp: new Date().toISOString(),
          },
        ],
        agent: createAgentSnapshot({
          taskId: 'optimistic-task-1',
          timeline: [
            {
              id: 'optimistic-user-1',
              taskId: 'optimistic-task-1',
              paneId: 'chat-pane-1',
              timestamp: new Date().toISOString(),
              kind: 'user-message',
              status: 'completed',
              content: '继续处理',
            },
            {
              id: 'reasoning-optimistic-1',
              taskId: 'optimistic-task-1',
              paneId: 'chat-pane-1',
              timestamp: new Date().toISOString(),
              kind: 'reasoning',
              status: 'streaming',
              content: '',
            },
          ],
          messages: [
            {
              id: 'optimistic-user-1',
              role: 'user',
              content: '继续处理',
              timestamp: new Date().toISOString(),
            },
          ],
          status: 'running',
        }),
      },
    };

    render(
      <I18nProvider>
        <ChatPane
          windowId="win-1"
          pane={optimisticPane}
          isActive
          onActivate={vi.fn()}
        />
      </I18nProvider>,
    );

    await expectThinkingIndicator();
    expect(window.electronAPI.agentRestoreTask).not.toHaveBeenCalled();
  });

  it('reloads provider options when chat settings are updated', async () => {
    vi.mocked(window.electronAPI.getSettings)
      .mockResolvedValueOnce({
        success: true,
        data: {
          language: 'zh-CN',
          ides: [],
          chat: {
            providers: [],
            enableCommandSecurity: true,
          },
        } as any,
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          language: 'zh-CN',
          ides: [],
          chat: {
            providers: [
              {
                id: 'provider-1',
                type: 'anthropic',
                name: 'Claude API',
                apiKey: 'sk-ant-test',
                models: ['claude-sonnet-4-5'],
                defaultModel: 'claude-sonnet-4-5',
              },
            ],
            activeProviderId: 'provider-1',
            enableCommandSecurity: true,
          },
        } as any,
      });

    useWindowStore.setState({
      windows: [
        {
          id: 'win-1',
          name: 'Chat Window',
          activePaneId: 'chat-pane-1',
          createdAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
          layout: {
            type: 'split',
            direction: 'horizontal',
            sizes: [1],
            children: [
              {
                type: 'pane',
                id: 'chat-pane-1',
                pane: {
                  id: 'chat-pane-1',
                  cwd: '',
                  command: '',
                  kind: 'chat',
                  status: WindowStatus.Paused,
                  pid: null,
                  chat: {
                    messages: [],
                  },
                },
              },
            ],
          },
        },
      ],
      activeWindowId: 'win-1',
      mruList: ['win-1'],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    render(
      <I18nProvider>
        <ChatPaneHarness />
      </I18nProvider>,
    );

    expect(await screen.findByText('尚未配置 Chat Provider')).toBeInTheDocument();

    await act(async () => {
      notifyWorkspaceSettingsUpdated({
        chat: {
          providers: [
            {
              id: 'provider-1',
              type: 'anthropic',
              name: 'Claude API',
              apiKey: 'sk-ant-test',
              models: ['claude-sonnet-4-5'],
              defaultModel: 'claude-sonnet-4-5',
            },
          ],
        } as any,
      });
    });

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Claude API / claude-sonnet-4-5' })).toBeInTheDocument();
    });
  });

  it('prefers an ssh pane when the chat pane has no explicit linked pane id', async () => {
    const user = userEvent.setup();

    vi.mocked(window.electronAPI.getSettings).mockResolvedValue({
      success: true,
      data: {
        language: 'zh-CN',
        ides: [],
        chat: {
          providers: [
            {
              id: 'provider-1',
              type: 'anthropic',
              name: 'Claude API',
              apiKey: 'sk-ant-test',
              models: ['claude-sonnet-4-5'],
              defaultModel: 'claude-sonnet-4-5',
            },
          ],
          activeProviderId: 'provider-1',
          enableCommandSecurity: true,
        },
      } as any,
    });

    useWindowStore.setState({
      windows: [
        {
          id: 'win-1',
          name: 'Mixed Window',
          activePaneId: 'chat-pane-1',
          createdAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
          layout: {
            type: 'split',
            direction: 'horizontal',
            sizes: [0.33, 0.33, 0.34],
            children: [
              {
                type: 'pane',
                id: 'local-pane-1',
                pane: {
                  id: 'local-pane-1',
                  cwd: '/workspace/project',
                  command: 'bash',
                  status: WindowStatus.Running,
                  pid: 11,
                },
              },
              {
                type: 'pane',
                id: 'ssh-pane-1',
                pane: {
                  id: 'ssh-pane-1',
                  cwd: '/srv/app',
                  command: '',
                  status: WindowStatus.Running,
                  pid: 101,
                  backend: 'ssh',
                  ssh: {
                    profileId: 'profile-1',
                    host: '10.0.0.20',
                    user: 'root',
                    remoteCwd: '/srv/app',
                  },
                },
              },
              {
                type: 'pane',
                id: 'chat-pane-1',
                pane: {
                  id: 'chat-pane-1',
                  cwd: '',
                  command: '',
                  kind: 'chat',
                  status: WindowStatus.Paused,
                  pid: null,
                  chat: {
                    messages: [],
                  },
                },
              },
            ],
          },
        },
      ],
      activeWindowId: 'win-1',
      mruList: ['win-1'],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    render(
      <I18nProvider>
        <ChatPaneHarness />
      </I18nProvider>,
    );

    await user.type(await screen.findByPlaceholderText('输入消息，Enter 发送，Shift+Enter 换行'), '帮我看看系统版本');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(window.electronAPI.agentSend).toHaveBeenCalledWith(expect.objectContaining({
        sshContext: {
          host: '10.0.0.20',
          user: 'root',
          cwd: '/srv/app',
          windowId: 'win-1',
          paneId: 'ssh-pane-1',
        },
      }));
    });
  });

  it('uses a single provider-model selector and switches both values together', async () => {
    const user = userEvent.setup();

    vi.mocked(window.electronAPI.getSettings).mockResolvedValue({
      success: true,
      data: {
        language: 'zh-CN',
        ides: [],
        chat: {
          providers: [
            {
              id: 'provider-1',
              type: 'anthropic',
              name: 'Claude API',
              apiKey: 'sk-ant-test',
              models: ['claude-sonnet-4-5'],
              defaultModel: 'claude-sonnet-4-5',
            },
            {
              id: 'provider-2',
              type: 'openai-compatible',
              name: 'OpenAI Gateway',
              apiKey: 'sk-openai-test',
              models: ['gpt-4.1'],
              defaultModel: 'gpt-4.1',
            },
          ],
          activeProviderId: 'provider-1',
          enableCommandSecurity: true,
        },
      } as any,
    });

    useWindowStore.setState({
      windows: [
        {
          id: 'win-1',
          name: 'Chat Window',
          activePaneId: 'chat-pane-1',
          createdAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
          layout: {
            type: 'split',
            direction: 'horizontal',
            sizes: [1],
            children: [
              {
                type: 'pane',
                id: 'chat-pane-1',
                pane: {
                  id: 'chat-pane-1',
                  cwd: '',
                  command: '',
                  kind: 'chat',
                  status: WindowStatus.Paused,
                  pid: null,
                  chat: {
                    messages: [],
                  },
                },
              },
            ],
          },
        },
      ],
      activeWindowId: 'win-1',
      mruList: ['win-1'],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    render(
      <I18nProvider>
        <ChatPaneHarness />
      </I18nProvider>,
    );

    const selector = await screen.findByRole('combobox', { name: 'Provider / 模型' });
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
    expect(screen.getByRole('option', { name: 'Claude API / claude-sonnet-4-5' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'OpenAI Gateway / gpt-4.1' })).toBeInTheDocument();

    await user.selectOptions(selector, '["provider-2","gpt-4.1"]');
    await user.type(await screen.findByPlaceholderText('输入消息，Enter 发送，Shift+Enter 换行'), '切到 OpenAI');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(window.electronAPI.agentSend).toHaveBeenCalledWith(expect.objectContaining({
        providerId: 'provider-2',
        model: 'gpt-4.1',
      }));
    });
  });

  it('starts a fresh conversation from the header plus button', async () => {
    const user = userEvent.setup();

    vi.mocked(window.electronAPI.getSettings).mockResolvedValue({
      success: true,
      data: {
        language: 'zh-CN',
        ides: [],
        chat: {
          providers: [
            {
              id: 'provider-1',
              type: 'anthropic',
              name: 'Claude API',
              apiKey: 'sk-ant-test',
              models: ['claude-sonnet-4-5'],
              defaultModel: 'claude-sonnet-4-5',
            },
          ],
          activeProviderId: 'provider-1',
          enableCommandSecurity: true,
        },
      } as any,
    });

    useWindowStore.setState({
      windows: [
        {
          id: 'win-1',
          name: '博客初稿',
          activePaneId: 'chat-pane-1',
          createdAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
          layout: {
            type: 'split',
            direction: 'horizontal',
            sizes: [1],
            children: [
              {
                type: 'pane',
                id: 'chat-pane-1',
                pane: {
                  id: 'chat-pane-1',
                  cwd: '',
                  command: '',
                  kind: 'chat',
                  status: WindowStatus.Paused,
                  pid: null,
                  chat: {
                    messages: [
                      {
                        id: 'message-1',
                        role: 'assistant',
                        content: '这是上一轮对话',
                        timestamp: new Date().toISOString(),
                        model: 'claude-sonnet-4-5',
                      },
                    ],
                  },
                },
              },
            ],
          },
        },
      ],
      activeWindowId: 'win-1',
      mruList: ['win-1'],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    render(
      <I18nProvider>
        <ChatPaneHarness />
      </I18nProvider>,
    );

    expect(await screen.findByText('这是上一轮对话')).toBeInTheDocument();

    const input = await screen.findByPlaceholderText('输入消息，Enter 发送，Shift+Enter 换行');
    await user.type(input, '临时草稿');
    await user.click(screen.getByRole('button', { name: '新建对话' }));

    await waitFor(() => {
      expect(screen.queryByText('这是上一轮对话')).not.toBeInTheDocument();
      expect(screen.getByText('与AI协作 博客初稿')).toBeInTheDocument();
    });
    expect(screen.queryByText('全新的对话')).not.toBeInTheDocument();
    expect(screen.queryByText('开始一段新对话')).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'SSH 未连接' })).toBeInTheDocument();
    expect((input as HTMLTextAreaElement).value).toBe('');
  });

  it('uses consistent sizing for header icon buttons', async () => {
    vi.mocked(window.electronAPI.getSettings).mockResolvedValue({
      success: true,
      data: {
        language: 'zh-CN',
        ides: [],
        chat: {
          providers: [
            {
              id: 'provider-1',
              type: 'anthropic',
              name: 'Claude API',
              apiKey: 'sk-ant-test',
              models: ['claude-sonnet-4-5'],
              defaultModel: 'claude-sonnet-4-5',
            },
          ],
          activeProviderId: 'provider-1',
          enableCommandSecurity: true,
        },
      } as any,
    });

    useWindowStore.setState({
      windows: [
        {
          id: 'win-1',
          name: 'Chat Window',
          activePaneId: 'chat-pane-1',
          createdAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
          layout: {
            type: 'split',
            direction: 'horizontal',
            sizes: [1],
            children: [
              {
                type: 'pane',
                id: 'chat-pane-1',
                pane: {
                  id: 'chat-pane-1',
                  cwd: '',
                  command: '',
                  kind: 'chat',
                  status: WindowStatus.Paused,
                  pid: null,
                  chat: {
                    messages: [],
                  },
                },
              },
            ],
          },
        },
      ],
      activeWindowId: 'win-1',
      mruList: ['win-1'],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    render(
      <I18nProvider>
        <ChatPaneHarness />
      </I18nProvider>,
    );

    const historyButton = await screen.findByRole('button', { name: '对话历史' });
    const newConversationButton = screen.getByRole('button', { name: '新建对话' });

    expect(historyButton).toHaveClass('h-8', 'w-8', 'items-center', 'justify-center');
    expect(newConversationButton).toHaveClass('h-8', 'w-8', 'items-center', 'justify-center');
    expect(historyButton.querySelector('svg')).toHaveAttribute('width', '18');
    expect(historyButton.querySelector('svg')).toHaveAttribute('height', '18');
    expect(newConversationButton.querySelector('svg')).toHaveAttribute('width', '18');
    expect(newConversationButton.querySelector('svg')).toHaveAttribute('height', '18');
  });

  it('uses the newly selected model for the next turn in the same conversation', async () => {
    const user = userEvent.setup();
    const listeners = createListenerMap();

    vi.mocked(window.electronAPI.getSettings).mockResolvedValue({
      success: true,
      data: {
        language: 'zh-CN',
        ides: [],
        chat: {
          providers: [
            {
              id: 'provider-1',
              type: 'anthropic',
              name: 'Claude API',
              apiKey: 'sk-ant-test',
              models: ['claude-sonnet-4-5', 'claude-opus-4-1'],
              defaultModel: 'claude-sonnet-4-5',
            },
          ],
          activeProviderId: 'provider-1',
          enableCommandSecurity: true,
        },
      } as any,
    });
    vi.mocked(window.electronAPI.agentSend).mockResolvedValue({
      success: true,
      data: {
        taskId: 'task-1',
        status: 'running',
      },
    });
    vi.mocked(window.electronAPI.agentGetTask).mockResolvedValue({
      success: true,
      data: null,
    });
    vi.mocked(window.electronAPI.onAgentTaskState).mockImplementation((callback) => {
      listeners.state.add(callback as (event: unknown, payload: AgentTaskStatePayload) => void);
    });
    vi.mocked(window.electronAPI.offAgentTaskState).mockImplementation((callback) => {
      listeners.state.delete(callback as (event: unknown, payload: AgentTaskStatePayload) => void);
    });
    vi.mocked(window.electronAPI.onAgentTaskError).mockImplementation((callback) => {
      listeners.error.add(callback as (event: unknown, payload: { paneId: string; error: string }) => void);
    });
    vi.mocked(window.electronAPI.offAgentTaskError).mockImplementation((callback) => {
      listeners.error.delete(callback as (event: unknown, payload: { paneId: string; error: string }) => void);
    });

    useWindowStore.setState({
      windows: [
        {
          id: 'win-1',
          name: 'Chat Window',
          activePaneId: 'chat-pane-1',
          createdAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
          layout: {
            type: 'split',
            direction: 'horizontal',
            sizes: [1],
            children: [
              {
                type: 'pane',
                id: 'chat-pane-1',
                pane: {
                  id: 'chat-pane-1',
                  cwd: '',
                  command: '',
                  kind: 'chat',
                  status: WindowStatus.Paused,
                  pid: null,
                  chat: {
                    messages: [],
                  },
                },
              },
            ],
          },
        },
      ],
      activeWindowId: 'win-1',
      mruList: ['win-1'],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    render(
      <I18nProvider>
        <ChatPaneHarness />
      </I18nProvider>,
    );

    await user.type(await screen.findByPlaceholderText('输入消息，Enter 发送，Shift+Enter 换行'), '先用默认模型');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(window.electronAPI.agentSend).toHaveBeenNthCalledWith(1, expect.objectContaining({
        providerId: 'provider-1',
        model: 'claude-sonnet-4-5',
      }));
    });

    await act(async () => {
      listeners.state.forEach((listener) => listener({}, {
        paneId: 'chat-pane-1',
        task: createAgentSnapshot({
          status: 'completed',
          model: 'claude-sonnet-4-5',
          messages: [
            {
              id: 'user-1',
              role: 'user',
              content: '先用默认模型',
              timestamp: new Date().toISOString(),
            },
            {
              id: 'assistant-1',
              role: 'assistant',
              content: '默认模型已响应',
              timestamp: new Date().toISOString(),
              model: 'claude-sonnet-4-5',
            },
          ],
        }),
      }));
    });

    const selector = await screen.findByRole('combobox', { name: 'Provider / 模型' });
    await user.selectOptions(selector, '["provider-1","claude-opus-4-1"]');
    expect(selector).toHaveValue('["provider-1","claude-opus-4-1"]');

    await user.clear(screen.getByPlaceholderText('输入消息，Enter 发送，Shift+Enter 换行'));
    await user.type(screen.getByPlaceholderText('输入消息，Enter 发送，Shift+Enter 换行'), '第二轮切模型');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(window.electronAPI.agentSend).toHaveBeenNthCalledWith(2, expect.objectContaining({
        providerId: 'provider-1',
        model: 'claude-opus-4-1',
      }));
    });
  });

  it('renders header actions as icon-only controls', async () => {
    vi.mocked(window.electronAPI.getSettings).mockResolvedValue({
      success: true,
      data: {
        language: 'zh-CN',
        ides: [],
        chat: {
          providers: [
            {
              id: 'provider-1',
              type: 'anthropic',
              name: 'Claude API',
              apiKey: 'sk-ant-test',
              models: ['claude-sonnet-4-5'],
              defaultModel: 'claude-sonnet-4-5',
            },
          ],
          activeProviderId: 'provider-1',
          enableCommandSecurity: true,
        },
      } as any,
    });

    const pane = {
      id: 'chat-pane-1',
      cwd: '',
      command: '',
      kind: 'chat' as const,
      status: WindowStatus.Paused,
      pid: null,
      chat: {
        messages: [],
      },
    };

    useWindowStore.setState({
      windows: [
        {
          id: 'win-1',
          name: 'Chat Window',
          activePaneId: 'chat-pane-1',
          createdAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
          layout: {
            type: 'split',
            direction: 'horizontal',
            sizes: [1],
            children: [
              {
                type: 'pane',
                id: 'chat-pane-1',
                pane,
              },
            ],
          },
        },
      ],
      activeWindowId: 'win-1',
      mruList: ['win-1'],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    render(
      <I18nProvider>
        <ChatPane
          windowId="win-1"
          pane={pane}
          isActive
          onActivate={vi.fn()}
          onClose={vi.fn()}
        />
      </I18nProvider>,
    );

    const newConversationButton = screen.getByRole('button', { name: '新建对话' });
    const closeButton = screen.getByRole('button', { name: '关闭' });

    expect(newConversationButton).toHaveClass('leading-none');
    expect(closeButton).toHaveClass('leading-none');
    expect(newConversationButton).not.toHaveClass('border');
    expect(closeButton).not.toHaveClass('border');
    expect(newConversationButton).not.toHaveClass('h-9');
    expect(closeButton).not.toHaveClass('h-9');
  });

  it('renders a more compact composer and narrower provider-model selector', async () => {
    vi.mocked(window.electronAPI.getSettings).mockResolvedValue({
      success: true,
      data: {
        language: 'zh-CN',
        ides: [],
        chat: {
          providers: [
            {
              id: 'provider-1',
              type: 'anthropic',
              name: 'Claude API',
              apiKey: 'sk-ant-test',
              models: ['claude-sonnet-4-5'],
              defaultModel: 'claude-sonnet-4-5',
            },
          ],
          activeProviderId: 'provider-1',
          enableCommandSecurity: true,
        },
      } as any,
    });

    useWindowStore.setState({
      windows: [
        {
          id: 'win-1',
          name: '长文草稿',
          activePaneId: 'chat-pane-1',
          createdAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
          layout: {
            type: 'split',
            direction: 'horizontal',
            sizes: [1],
            children: [
              {
                type: 'pane',
                id: 'chat-pane-1',
                pane: {
                  id: 'chat-pane-1',
                  cwd: '',
                  command: '',
                  kind: 'chat',
                  status: WindowStatus.Paused,
                  pid: null,
                  chat: {
                    messages: [],
                  },
                },
              },
            ],
          },
        },
      ],
      activeWindowId: 'win-1',
      mruList: ['win-1'],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    render(
      <I18nProvider>
        <ChatPaneHarness />
      </I18nProvider>,
    );

    const input = await screen.findByPlaceholderText('输入消息，Enter 发送，Shift+Enter 换行');
    const selector = screen.getByRole('combobox', { name: 'Provider / 模型' });

    expect(input).toHaveClass('min-h-[72px]');
    expect(input).not.toHaveClass('min-h-[108px]');
    expect(selector).toHaveClass('h-9');
    expect(selector).toHaveClass('py-0');
    expect(selector).toHaveClass('pl-3');
    expect(selector).toHaveClass('leading-5');
    expect(selector).not.toHaveClass('pl-9');
    expect(selector.closest('label')).toHaveClass('sm:w-fit');
    expect(selector.closest('label')).toHaveClass('sm:min-w-[220px]');
    expect(selector.closest('label')).toHaveClass('sm:max-w-[280px]');
  });

  it('renders reasoning and command output blocks from the structured agent timeline', async () => {
    const listeners = createListenerMap();

    vi.mocked(window.electronAPI.getSettings).mockResolvedValue({
      success: true,
      data: {
        language: 'zh-CN',
        ides: [],
        chat: {
          providers: [
            {
              id: 'provider-1',
              type: 'anthropic',
              name: 'Claude API',
              apiKey: 'sk-ant-test',
              models: ['claude-sonnet-4-5'],
              defaultModel: 'claude-sonnet-4-5',
            },
          ],
          activeProviderId: 'provider-1',
          enableCommandSecurity: true,
        },
      } as any,
    });
    vi.mocked(window.electronAPI.onAgentTaskState).mockImplementation((callback) => {
      listeners.state.add(callback as (event: unknown, payload: AgentTaskStatePayload) => void);
    });
    vi.mocked(window.electronAPI.offAgentTaskState).mockImplementation((callback) => {
      listeners.state.delete(callback as (event: unknown, payload: AgentTaskStatePayload) => void);
    });

    useWindowStore.setState({
      windows: [
        {
          id: 'win-1',
          name: 'Chat Window',
          activePaneId: 'chat-pane-1',
          createdAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
          layout: {
            type: 'split',
            direction: 'horizontal',
            sizes: [1],
            children: [
              {
                type: 'pane',
                id: 'chat-pane-1',
                pane: {
                  id: 'chat-pane-1',
                  cwd: '',
                  command: '',
                  kind: 'chat',
                  status: WindowStatus.Paused,
                  pid: null,
                  chat: {
                    messages: [],
                  },
                },
              },
            ],
          },
        },
      ],
      activeWindowId: 'win-1',
      mruList: ['win-1'],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    render(
      <I18nProvider>
        <ChatPaneHarness />
      </I18nProvider>,
    );

    await act(async () => {
      listeners.state.forEach((listener) => listener({}, {
        paneId: 'chat-pane-1',
        task: createAgentSnapshot({
          timeline: [
            {
              id: 'reasoning-1',
              taskId: 'task-1',
              paneId: 'chat-pane-1',
              timestamp: new Date().toISOString(),
              kind: 'reasoning',
              status: 'completed',
              content: '先确定服务是否真的在线。',
            },
            {
              id: 'command-1',
              taskId: 'task-1',
              paneId: 'chat-pane-1',
              timestamp: new Date().toISOString(),
              kind: 'command',
              status: 'completed',
              commandId: 'command-1',
              host: '10.0.0.20',
              command: 'systemctl status nginx --no-pager',
              interactive: false,
              exitCode: 0,
            },
            {
              id: 'command-output-1',
              taskId: 'task-1',
              paneId: 'chat-pane-1',
              timestamp: new Date().toISOString(),
              kind: 'command-output',
              status: 'completed',
              commandId: 'command-1',
              stream: 'pty',
              content: 'Active: active (running)',
            },
          ],
          status: 'completed',
        }),
      }));
    });

    expect(await screen.findByText(/Thinking/)).toBeInTheDocument();
    expect(screen.getByText('先确定服务是否真的在线。')).toBeInTheDocument();
    expect(screen.getByText('Remote command · 10.0.0.20')).toBeInTheDocument();
    expect(screen.getByText('Active: active (running)')).toBeInTheDocument();
  });

  it('restores a persisted agent snapshot when the main controller has no live task', async () => {
    const persisted = createAgentSnapshot({
      status: 'completed',
      timeline: [
        {
          id: 'assistant-restore',
          taskId: 'task-restore',
          paneId: 'chat-pane-1',
          timestamp: new Date().toISOString(),
          kind: 'assistant-message',
          status: 'completed',
          content: '这是恢复出来的 agent 历史',
        },
      ],
      messages: [
        {
          id: 'assistant-restore',
          role: 'assistant',
          content: '这是恢复出来的 agent 历史',
          timestamp: new Date().toISOString(),
        },
      ],
      taskId: 'task-restore',
    });

    vi.mocked(window.electronAPI.getSettings).mockResolvedValue({
      success: true,
      data: {
        language: 'zh-CN',
        ides: [],
        chat: {
          providers: [
            {
              id: 'provider-1',
              type: 'anthropic',
              name: 'Claude API',
              apiKey: 'sk-ant-test',
              models: ['claude-sonnet-4-5'],
              defaultModel: 'claude-sonnet-4-5',
            },
          ],
          activeProviderId: 'provider-1',
          enableCommandSecurity: true,
        },
      } as any,
    });
    vi.mocked(window.electronAPI.agentGetTask).mockResolvedValue({
      success: true,
      data: null,
    });
    vi.mocked(window.electronAPI.agentRestoreTask).mockResolvedValue({
      success: true,
      data: persisted,
    });

    useWindowStore.setState({
      windows: [
        {
          id: 'win-1',
          name: 'Chat Window',
          activePaneId: 'chat-pane-1',
          createdAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
          layout: {
            type: 'split',
            direction: 'horizontal',
            sizes: [1],
            children: [
              {
                type: 'pane',
                id: 'chat-pane-1',
                pane: {
                  id: 'chat-pane-1',
                  cwd: '',
                  command: '',
                  kind: 'chat',
                  status: WindowStatus.Paused,
                  pid: null,
                  chat: {
                    messages: persisted.messages,
                    agent: persisted,
                  },
                },
              },
            ],
          },
        },
      ],
      activeWindowId: 'win-1',
      mruList: ['win-1'],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    render(
      <I18nProvider>
        <ChatPaneHarness />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(window.electronAPI.agentRestoreTask).toHaveBeenCalledWith({
        task: persisted,
      });
    });
    expect(await screen.findByText('这是恢复出来的 agent 历史')).toBeInTheDocument();
  });

  it('resets the main-side agent task when starting a new conversation', async () => {
    const user = userEvent.setup();
    const restoredAgent = createAgentSnapshot({
      taskId: 'task-reset',
      status: 'completed',
      timeline: [
        {
          id: 'assistant-reset',
          taskId: 'task-reset',
          paneId: 'chat-pane-1',
          timestamp: new Date().toISOString(),
          kind: 'assistant-message',
          status: 'completed',
          content: '旧会话内容',
        },
      ],
      messages: [
        {
          id: 'assistant-reset',
          role: 'assistant',
          content: '旧会话内容',
          timestamp: new Date().toISOString(),
        },
      ],
    });

    vi.mocked(window.electronAPI.getSettings).mockResolvedValue({
      success: true,
      data: {
        language: 'zh-CN',
        ides: [],
        chat: {
          providers: [
            {
              id: 'provider-1',
              type: 'anthropic',
              name: 'Claude API',
              apiKey: 'sk-ant-test',
              models: ['claude-sonnet-4-5'],
              defaultModel: 'claude-sonnet-4-5',
            },
          ],
          activeProviderId: 'provider-1',
          enableCommandSecurity: true,
        },
      } as any,
    });
    vi.mocked(window.electronAPI.agentGetTask).mockResolvedValue({
      success: true,
      data: null,
    });
    vi.mocked(window.electronAPI.agentRestoreTask).mockResolvedValue({
      success: true,
      data: null,
    });
    vi.mocked(window.electronAPI.agentResetTask).mockResolvedValue({
      success: true,
      data: undefined,
    });

    useWindowStore.setState({
      windows: [
        {
          id: 'win-1',
          name: 'Chat Window',
          activePaneId: 'chat-pane-1',
          createdAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
          layout: {
            type: 'split',
            direction: 'horizontal',
            sizes: [1],
            children: [
              {
                type: 'pane',
                id: 'chat-pane-1',
                pane: {
                  id: 'chat-pane-1',
                  cwd: '',
                  command: '',
                  kind: 'chat',
                  status: WindowStatus.Paused,
                  pid: null,
                  chat: {
                    messages: restoredAgent.messages,
                    agent: restoredAgent,
                  },
                },
              },
            ],
          },
        },
      ],
      activeWindowId: 'win-1',
      mruList: ['win-1'],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    render(
      <I18nProvider>
        <ChatPaneHarness />
      </I18nProvider>,
    );

    expect(await screen.findByText('旧会话内容')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '新建对话' }));

    await waitFor(() => {
      expect(window.electronAPI.agentResetTask).toHaveBeenCalledWith({
        paneId: 'chat-pane-1',
        taskId: 'task-reset',
      });
    });
    await waitFor(() => {
      expect(screen.queryByText('旧会话内容')).not.toBeInTheDocument();
    });
  });

  it('restores the latest saved conversation and lets the user switch history entries', async () => {
    const user = userEvent.setup();

    vi.mocked(window.electronAPI.getSettings).mockResolvedValue({
      success: true,
      data: {
        language: 'zh-CN',
        ides: [],
        chat: {
          providers: [
            {
              id: 'provider-1',
              type: 'anthropic',
              name: 'Claude API',
              apiKey: 'sk-ant-test',
              models: ['claude-sonnet-4-5'],
              defaultModel: 'claude-sonnet-4-5',
            },
          ],
          activeProviderId: 'provider-1',
          enableCommandSecurity: true,
        },
      } as any,
    });

    window.localStorage.setItem('copilot-terminal:chat-conversation-history:v1', JSON.stringify([
      {
        id: 'conversation-latest',
        windowId: 'win-1',
        title: '最新会话',
        createdAt: '2026-04-14T10:00:00.000Z',
        updatedAt: '2026-04-14T10:05:00.000Z',
        activeProviderId: 'provider-1',
        activeModel: 'claude-sonnet-4-5',
        messages: [
          {
            id: 'latest-user',
            role: 'user',
            content: '最新会话内容',
            timestamp: '2026-04-14T10:05:00.000Z',
          },
        ],
      },
      {
        id: 'conversation-older',
        windowId: 'win-1',
        title: '较早会话',
        createdAt: '2026-04-14T09:00:00.000Z',
        updatedAt: '2026-04-14T09:05:00.000Z',
        activeProviderId: 'provider-1',
        activeModel: 'claude-sonnet-4-5',
        messages: [
          {
            id: 'older-user',
            role: 'user',
            content: '较早会话内容',
            timestamp: '2026-04-14T09:05:00.000Z',
          },
        ],
      },
    ]));

    useWindowStore.setState({
      windows: [
        {
          id: 'win-1',
          name: 'Chat Window',
          activePaneId: 'chat-pane-1',
          createdAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
          layout: {
            type: 'split',
            direction: 'horizontal',
            sizes: [1],
            children: [
              {
                type: 'pane',
                id: 'chat-pane-1',
                pane: {
                  id: 'chat-pane-1',
                  cwd: '',
                  command: '',
                  kind: 'chat',
                  status: WindowStatus.Paused,
                  pid: null,
                  chat: {
                    messages: [],
                  },
                },
              },
            ],
          },
        },
      ],
      activeWindowId: 'win-1',
      mruList: ['win-1'],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    render(
      <I18nProvider>
        <ChatPaneHarness />
      </I18nProvider>,
    );

    expect(await screen.findByText('最新会话内容')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '对话历史' }));

    expect(screen.getByRole('button', { name: /较早会话/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /较早会话/ }));

    await waitFor(() => {
      expect(screen.getByText('较早会话内容')).toBeInTheDocument();
    });
    expect(screen.queryByText('最新会话内容')).not.toBeInTheDocument();
  });

  it('copies message content from the hover action buttons', async () => {
    const user = userEvent.setup();

    vi.mocked(window.electronAPI.getSettings).mockResolvedValue({
      success: true,
      data: {
        language: 'zh-CN',
        ides: [],
        chat: {
          providers: [
            {
              id: 'provider-1',
              type: 'anthropic',
              name: 'Claude API',
              apiKey: 'sk-ant-test',
              models: ['claude-sonnet-4-5'],
              defaultModel: 'claude-sonnet-4-5',
            },
          ],
          activeProviderId: 'provider-1',
          enableCommandSecurity: true,
        },
      } as any,
    });

    useWindowStore.setState({
      windows: [
        {
          id: 'win-1',
          name: 'Chat Window',
          activePaneId: 'chat-pane-1',
          createdAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
          layout: {
            type: 'split',
            direction: 'horizontal',
            sizes: [1],
            children: [
              {
                type: 'pane',
                id: 'chat-pane-1',
                pane: {
                  id: 'chat-pane-1',
                  cwd: '',
                  command: '',
                  kind: 'chat',
                  status: WindowStatus.Paused,
                  pid: null,
                  chat: {
                    messages: [
                      {
                        id: 'legacy-user',
                        role: 'user',
                        content: '你好',
                        timestamp: new Date().toISOString(),
                      },
                    ],
                  },
                },
              },
            ],
          },
        },
      ],
      activeWindowId: 'win-1',
      mruList: ['win-1'],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    render(
      <I18nProvider>
        <ChatPaneHarness />
      </I18nProvider>,
    );

    const copyButton = await screen.findByRole('button', { name: '复制内容' });
    const messageRow = copyButton.closest('.group');

    expect(messageRow).not.toBeNull();
    expect(messageRow).toHaveClass('items-center');
    expect(messageRow).not.toHaveClass('items-start');

    await user.click(copyButton);

    expect(await screen.findByRole('button', { name: '已复制' })).toBeInTheDocument();
  });

  it('rolls back a multi-turn conversation to the selected round and restores the draft input', async () => {
    const user = userEvent.setup();
    const restoredAgent = createAgentSnapshot({
      taskId: 'task-rollback',
      status: 'completed',
      timeline: [
        {
          id: 'user-1',
          taskId: 'task-rollback',
          paneId: 'chat-pane-1',
          timestamp: '2026-04-14T10:00:00.000Z',
          kind: 'user-message',
          status: 'completed',
          content: '第一轮问题',
        },
        {
          id: 'assistant-1',
          taskId: 'task-rollback',
          paneId: 'chat-pane-1',
          timestamp: '2026-04-14T10:00:10.000Z',
          kind: 'assistant-message',
          status: 'completed',
          content: '第一轮回答',
        },
        {
          id: 'user-2',
          taskId: 'task-rollback',
          paneId: 'chat-pane-1',
          timestamp: '2026-04-14T10:01:00.000Z',
          kind: 'user-message',
          status: 'completed',
          content: '第二轮问题',
        },
        {
          id: 'assistant-2',
          taskId: 'task-rollback',
          paneId: 'chat-pane-1',
          timestamp: '2026-04-14T10:01:10.000Z',
          kind: 'assistant-message',
          status: 'completed',
          content: '第二轮回答',
        },
      ],
      messages: [
        {
          id: 'user-1',
          role: 'user',
          content: '第一轮问题',
          timestamp: '2026-04-14T10:00:00.000Z',
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          content: '第一轮回答',
          timestamp: '2026-04-14T10:00:10.000Z',
        },
        {
          id: 'user-2',
          role: 'user',
          content: '第二轮问题',
          timestamp: '2026-04-14T10:01:00.000Z',
        },
        {
          id: 'assistant-2',
          role: 'assistant',
          content: '第二轮回答',
          timestamp: '2026-04-14T10:01:10.000Z',
        },
      ],
    });

    vi.mocked(window.electronAPI.getSettings).mockResolvedValue({
      success: true,
      data: {
        language: 'zh-CN',
        ides: [],
        chat: {
          providers: [
            {
              id: 'provider-1',
              type: 'anthropic',
              name: 'Claude API',
              apiKey: 'sk-ant-test',
              models: ['claude-sonnet-4-5'],
              defaultModel: 'claude-sonnet-4-5',
            },
          ],
          activeProviderId: 'provider-1',
          enableCommandSecurity: true,
        },
      } as any,
    });

    useWindowStore.setState({
      windows: [
        {
          id: 'win-1',
          name: 'Chat Window',
          activePaneId: 'chat-pane-1',
          createdAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
          layout: {
            type: 'split',
            direction: 'horizontal',
            sizes: [1],
            children: [
              {
                type: 'pane',
                id: 'chat-pane-1',
                pane: {
                  id: 'chat-pane-1',
                  cwd: '',
                  command: '',
                  kind: 'chat',
                  status: WindowStatus.Paused,
                  pid: null,
                  chat: {
                    messages: restoredAgent.messages,
                    agent: restoredAgent,
                  },
                },
              },
            ],
          },
        },
      ],
      activeWindowId: 'win-1',
      mruList: ['win-1'],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    render(
      <I18nProvider>
        <ChatPaneHarness />
      </I18nProvider>,
    );

    expect(await screen.findByText('第二轮回答')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '回退到第 2 轮对话' }));

    await waitFor(() => {
      expect(window.electronAPI.agentResetTask).toHaveBeenCalledWith({
        paneId: 'chat-pane-1',
        taskId: 'task-rollback',
      });
    });
    expect(screen.getByDisplayValue('第二轮问题')).toBeInTheDocument();
    expect(screen.getByText('第一轮回答')).toBeInTheDocument();
    expect(screen.queryByText('第二轮回答')).not.toBeInTheDocument();
  });

  it('hydrates SSH host/user from the linked profile before sending agent requests', async () => {
    const user = userEvent.setup();

    vi.mocked(window.electronAPI.getSettings).mockResolvedValue({
      success: true,
      data: {
        language: 'zh-CN',
        ides: [],
        chat: {
          providers: [
            {
              id: 'provider-1',
              type: 'anthropic',
              name: 'Claude API',
              apiKey: 'sk-ant-test',
              models: ['claude-sonnet-4-5'],
              defaultModel: 'claude-sonnet-4-5',
            },
          ],
          activeProviderId: 'provider-1',
          enableCommandSecurity: true,
        },
      } as any,
    });
    vi.mocked(window.electronAPI.agentSend).mockResolvedValue({
      success: true,
      data: {
        taskId: 'task-1',
        status: 'running',
      },
    });
    vi.mocked(window.electronAPI.agentGetTask).mockResolvedValue({
      success: true,
      data: null,
    });
    vi.mocked(window.electronAPI.getSSHProfile).mockResolvedValue({
      success: true,
      data: {
        id: 'profile-1',
        name: 'Prod',
        host: '10.0.0.20',
        port: 22,
        user: 'root',
        authType: 'password',
      } as any,
    });

    useWindowStore.setState({
      windows: [
        {
          id: 'win-1',
          name: 'SSH Window',
          activePaneId: 'chat-pane-1',
          createdAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
          layout: {
            type: 'split',
            direction: 'horizontal',
            sizes: [0.5, 0.5],
            children: [
              {
                type: 'pane',
                id: 'ssh-pane-1',
                pane: {
                  id: 'ssh-pane-1',
                  cwd: '/srv/app',
                  command: '',
                  status: WindowStatus.Running,
                  pid: 101,
                  backend: 'ssh',
                  ssh: {
                    profileId: 'profile-1',
                    remoteCwd: '/srv/app',
                  },
                },
              },
              {
                type: 'pane',
                id: 'chat-pane-1',
                pane: {
                  id: 'chat-pane-1',
                  cwd: '',
                  command: '',
                  kind: 'chat',
                  status: WindowStatus.Paused,
                  pid: null,
                  chat: {
                    messages: [],
                  },
                },
              },
            ],
          },
        },
      ],
      activeWindowId: 'win-1',
      mruList: ['win-1'],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    render(
      <I18nProvider>
        <ChatPaneHarness />
      </I18nProvider>,
    );

    expect(await screen.findByText('与AI协作 app')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'SSH 已连接' })).toBeInTheDocument();

    await user.type(await screen.findByPlaceholderText('输入消息，Enter 发送，Shift+Enter 换行'), '帮我看下系统的版本号是什么？');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(window.electronAPI.getSSHProfile).toHaveBeenCalledWith('profile-1');
      expect(window.electronAPI.agentSend).toHaveBeenCalledWith(expect.objectContaining({
        enableTools: true,
        linkedPaneId: 'ssh-pane-1',
        sshContext: {
          host: '10.0.0.20',
          user: 'root',
          cwd: '/srv/app',
          windowId: 'win-1',
          paneId: 'ssh-pane-1',
        },
      }));
    });
  });

  it('does not render an outer active border', async () => {
    vi.mocked(window.electronAPI.getSettings).mockResolvedValue({
      success: true,
      data: {
        language: 'zh-CN',
        ides: [],
        chat: {
          providers: [],
          enableCommandSecurity: true,
        },
      } as any,
    });

    useWindowStore.setState({
      windows: [
        {
          id: 'win-1',
          name: 'Chat Window',
          activePaneId: 'chat-pane-1',
          createdAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
          layout: {
            type: 'split',
            direction: 'horizontal',
            sizes: [1],
            children: [
              {
                type: 'pane',
                id: 'chat-pane-1',
                pane: {
                  id: 'chat-pane-1',
                  cwd: '',
                  command: '',
                  kind: 'chat',
                  status: WindowStatus.Paused,
                  pid: null,
                  chat: {
                    messages: [],
                  },
                },
              },
            ],
          },
        },
      ],
      activeWindowId: 'win-1',
      mruList: ['win-1'],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    const view = render(
      <I18nProvider>
        <ChatPaneHarness />
      </I18nProvider>,
    );

    await screen.findByText('尚未配置 Chat Provider');

    const root = view.container.firstElementChild;
    expect(root).not.toBeNull();
    expect(root).not.toHaveClass('border-t-2');
    expect(root).not.toHaveClass('ring-1');
    expect((root as HTMLElement).className).not.toContain('border-t-sky-400');
    expect((root as HTMLElement).className).not.toContain('border-t-sky-700/60');
  });

  it('auto-scrolls only while the transcript is pinned to the bottom', async () => {
    const listeners = createListenerMap();
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalCancelAnimationFrame = window.cancelAnimationFrame;
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = vi.fn();

    try {
      vi.mocked(window.electronAPI.getSettings).mockResolvedValue({
        success: true,
        data: {
          language: 'zh-CN',
          ides: [],
          chat: {
            providers: [
              {
                id: 'provider-1',
                type: 'anthropic',
                name: 'Claude API',
                apiKey: 'sk-ant-test',
                models: ['claude-sonnet-4-5'],
                defaultModel: 'claude-sonnet-4-5',
              },
            ],
            activeProviderId: 'provider-1',
            enableCommandSecurity: true,
          },
        } as any,
      });
      vi.mocked(window.electronAPI.agentGetTask).mockResolvedValue({
        success: true,
        data: null,
      });
      vi.mocked(window.electronAPI.onAgentTaskState).mockImplementation((callback) => {
        listeners.state.add(callback as (event: unknown, payload: AgentTaskStatePayload) => void);
      });
      vi.mocked(window.electronAPI.offAgentTaskState).mockImplementation((callback) => {
        listeners.state.delete(callback as (event: unknown, payload: AgentTaskStatePayload) => void);
      });
      vi.mocked(window.electronAPI.onAgentTaskError).mockImplementation((callback) => {
        listeners.error.add(callback as (event: unknown, payload: { paneId: string; error: string }) => void);
      });
      vi.mocked(window.electronAPI.offAgentTaskError).mockImplementation((callback) => {
        listeners.error.delete(callback as (event: unknown, payload: { paneId: string; error: string }) => void);
      });

      useWindowStore.setState({
        windows: [
          {
            id: 'win-1',
            name: 'Chat Window',
            activePaneId: 'chat-pane-1',
            createdAt: new Date().toISOString(),
            lastActiveAt: new Date().toISOString(),
            layout: {
              type: 'split',
              direction: 'horizontal',
              sizes: [1],
              children: [
                {
                  type: 'pane',
                  id: 'chat-pane-1',
                  pane: {
                    id: 'chat-pane-1',
                    cwd: '',
                    command: '',
                    kind: 'chat',
                    status: WindowStatus.Paused,
                    pid: null,
                    chat: {
                      messages: [],
                    },
                  },
                },
              ],
            },
          },
        ],
        activeWindowId: 'win-1',
        mruList: ['win-1'],
        sidebarExpanded: false,
        sidebarWidth: 200,
      });

      const { container } = render(
        <I18nProvider>
          <ChatPaneHarness />
        </I18nProvider>,
      );

      await screen.findByPlaceholderText('输入消息，Enter 发送，Shift+Enter 换行');

      const scrollContainer = container.querySelector('.overflow-y-auto.px-4.pb-4.pt-1') as HTMLDivElement | null;
      expect(scrollContainer).toBeTruthy();
      if (!scrollContainer) {
        return;
      }

      let scrollHeight = 1200;
      const clientHeight = 400;
      let scrollTop = 800;

      Object.defineProperty(scrollContainer, 'scrollHeight', {
        configurable: true,
        get: () => scrollHeight,
      });
      Object.defineProperty(scrollContainer, 'clientHeight', {
        configurable: true,
        get: () => clientHeight,
      });
      Object.defineProperty(scrollContainer, 'scrollTop', {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => {
          scrollTop = value;
        },
      });

      const emitState = async (updatedAt: string, content: string) => {
        await act(async () => {
          listeners.state.forEach((listener) => listener({}, {
            paneId: 'chat-pane-1',
            task: createAgentSnapshot({
              status: 'running',
              updatedAt,
              timeline: [
                {
                  id: 'user-1',
                  taskId: 'task-1',
                  paneId: 'chat-pane-1',
                  timestamp: updatedAt,
                  kind: 'user-message',
                  status: 'completed',
                  content: '分析日志',
                },
                {
                  id: 'assistant-1',
                  taskId: 'task-1',
                  paneId: 'chat-pane-1',
                  timestamp: updatedAt,
                  kind: 'assistant-message',
                  status: 'streaming',
                  content,
                },
              ],
              messages: [],
            }),
          }));
        });
      };

      await emitState('2026-04-13T14:10:00.000Z', '第一段输出');
      expect(scrollTop).toBe(1200);

      scrollTop = 180;
      await act(async () => {
        scrollContainer.dispatchEvent(new Event('scroll'));
      });

      scrollHeight = 1600;
      await emitState('2026-04-13T14:10:01.000Z', '第二段输出');
      expect(scrollTop).toBe(180);

      scrollTop = 1200;
      await act(async () => {
        scrollContainer.dispatchEvent(new Event('scroll'));
      });

      scrollHeight = 1800;
      await emitState('2026-04-13T14:10:02.000Z', '第三段输出');
      expect(scrollTop).toBe(1800);
    } finally {
      window.requestAnimationFrame = originalRequestAnimationFrame;
      window.cancelAnimationFrame = originalCancelAnimationFrame;
    }
  });
});
