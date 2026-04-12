import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { useMemo } from 'react';
import { I18nProvider } from '../../i18n';
import { ChatPane } from '../ChatPane';
import { useWindowStore } from '../../stores/windowStore';
import { WindowStatus } from '../../types/window';
import { notifyWorkspaceSettingsUpdated } from '../../utils/settingsEvents';
import type {
  ChatStreamChunkPayload,
  ChatStreamDonePayload,
  ChatToolApprovalRequestPayload,
  ChatToolResultPayload,
} from '../../../shared/types/chat';

type ListenerMap = {
  chunk: Set<(event: unknown, payload: ChatStreamChunkPayload) => void>;
  done: Set<(event: unknown, payload: ChatStreamDonePayload) => void>;
  approval: Set<(event: unknown, payload: ChatToolApprovalRequestPayload) => void>;
  result: Set<(event: unknown, payload: ChatToolResultPayload) => void>;
};

function createListenerMap(): ListenerMap {
  return {
    chunk: new Set(),
    done: new Set(),
    approval: new Set(),
    result: new Set(),
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

describe('ChatPane', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWindowStore.setState({
      windows: [],
      activeWindowId: null,
      mruList: [],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });
  });

  it('sends messages with linked SSH context and completes tool approval flow', async () => {
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
    vi.mocked(window.electronAPI.chatSend).mockResolvedValue({
      success: true,
      data: {
        messageId: 'assistant-1',
      },
    });
    vi.mocked(window.electronAPI.onChatStreamChunk).mockImplementation((callback) => {
      listeners.chunk.add(callback as (event: unknown, payload: ChatStreamChunkPayload) => void);
    });
    vi.mocked(window.electronAPI.offChatStreamChunk).mockImplementation((callback) => {
      listeners.chunk.delete(callback as (event: unknown, payload: ChatStreamChunkPayload) => void);
    });
    vi.mocked(window.electronAPI.onChatStreamDone).mockImplementation((callback) => {
      listeners.done.add(callback as (event: unknown, payload: ChatStreamDonePayload) => void);
    });
    vi.mocked(window.electronAPI.offChatStreamDone).mockImplementation((callback) => {
      listeners.done.delete(callback as (event: unknown, payload: ChatStreamDonePayload) => void);
    });
    vi.mocked(window.electronAPI.onChatToolApprovalRequest).mockImplementation((callback) => {
      listeners.approval.add(callback as (event: unknown, payload: ChatToolApprovalRequestPayload) => void);
    });
    vi.mocked(window.electronAPI.offChatToolApprovalRequest).mockImplementation((callback) => {
      listeners.approval.delete(callback as (event: unknown, payload: ChatToolApprovalRequestPayload) => void);
    });
    vi.mocked(window.electronAPI.onChatToolResult).mockImplementation((callback) => {
      listeners.result.add(callback as (event: unknown, payload: ChatToolResultPayload) => void);
    });
    vi.mocked(window.electronAPI.offChatToolResult).mockImplementation((callback) => {
      listeners.result.delete(callback as (event: unknown, payload: ChatToolResultPayload) => void);
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

    await waitFor(() => {
      expect(window.electronAPI.chatSend).toHaveBeenCalledWith(expect.objectContaining({
        paneId: 'chat-pane-1',
        windowId: 'win-1',
        providerId: 'provider-1',
        model: 'claude-sonnet-4-5',
        enableTools: true,
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
      listeners.chunk.forEach((listener) => listener({}, {
        paneId: 'chat-pane-1',
        messageId: 'assistant-1',
        chunk: '先看一下当前服务状态。',
      }));

      listeners.done.forEach((listener) => listener({}, {
        paneId: 'chat-pane-1',
        messageId: 'assistant-1',
        fullContent: '先看一下当前服务状态。',
        isFinal: false,
        toolCalls: [
          {
            id: 'tool-1',
            name: 'execute_command',
            params: {
              command: 'systemctl status nginx --no-pager',
            },
            status: 'pending',
          },
        ],
      }));
    });

    expect(await screen.findByText('先看一下当前服务状态。')).toBeInTheDocument();
    expect(screen.getByText('执行远程命令')).toBeInTheDocument();

    await act(async () => {
      listeners.approval.forEach((listener) => listener({}, {
        paneId: 'chat-pane-1',
        toolCall: {
          id: 'tool-1',
          name: 'execute_command',
          params: {
            command: 'systemctl status nginx --no-pager',
          },
          status: 'pending',
        },
      }));
    });

    await user.click(await screen.findByRole('button', { name: '批准执行' }));

    expect(window.electronAPI.chatRespondToolApproval).toHaveBeenCalledWith({
      paneId: 'chat-pane-1',
      toolCallId: 'tool-1',
      approved: true,
    });

    await act(async () => {
      listeners.result.forEach((listener) => listener({}, {
        paneId: 'chat-pane-1',
        toolCallId: 'tool-1',
        content: 'nginx.service is active (running)',
        isError: false,
      }));
    });

    const toolResults = await screen.findAllByText('nginx.service is active (running)');
    expect(toolResults).toHaveLength(2);
    expect(screen.getByText('已完成')).toBeInTheDocument();
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
      expect(screen.getAllByText('Claude API').length).toBeGreaterThan(0);
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
    vi.mocked(window.electronAPI.chatSend).mockResolvedValue({
      success: true,
      data: {
        messageId: 'assistant-ssh-default',
      },
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
      expect(window.electronAPI.chatSend).toHaveBeenCalledWith(expect.objectContaining({
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
    vi.mocked(window.electronAPI.chatSend).mockResolvedValue({
      success: true,
      data: {
        messageId: 'assistant-provider-switch',
      },
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
      expect(window.electronAPI.chatSend).toHaveBeenCalledWith(expect.objectContaining({
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
      expect(screen.getByText('开始一段新对话')).toBeInTheDocument();
    });
    expect((input as HTMLTextAreaElement).value).toBe('');
  });

  it('rolls back later rounds from the per-round undo button', async () => {
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
                        id: 'user-1',
                        role: 'user',
                        content: '第一轮提问',
                        timestamp: new Date().toISOString(),
                      },
                      {
                        id: 'assistant-1',
                        role: 'assistant',
                        content: '第一轮回答',
                        timestamp: new Date().toISOString(),
                        model: 'claude-sonnet-4-5',
                      },
                      {
                        id: 'user-2',
                        role: 'user',
                        content: '第二轮提问',
                        timestamp: new Date().toISOString(),
                      },
                      {
                        id: 'assistant-2',
                        role: 'assistant',
                        content: '第二轮回答',
                        timestamp: new Date().toISOString(),
                        model: 'claude-sonnet-4-5',
                      },
                      {
                        id: 'user-3',
                        role: 'user',
                        content: '第三轮提问',
                        timestamp: new Date().toISOString(),
                      },
                      {
                        id: 'assistant-3',
                        role: 'assistant',
                        content: '第三轮回答',
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

    expect(await screen.findByText('第三轮回答')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '回退到第 2 轮对话' }));

    await waitFor(() => {
      expect(screen.queryByText('第三轮提问')).not.toBeInTheDocument();
      expect(screen.queryByText('第三轮回答')).not.toBeInTheDocument();
    });
    expect(screen.getByText('第一轮回答')).toBeInTheDocument();
    expect(screen.getByText('第二轮回答')).toBeInTheDocument();
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
});
