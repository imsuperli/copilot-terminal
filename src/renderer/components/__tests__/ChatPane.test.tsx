import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { useMemo } from 'react';
import { I18nProvider } from '../../i18n';
import { ChatPane } from '../ChatPane';
import { useWindowStore } from '../../stores/windowStore';
import { WindowStatus } from '../../types/window';
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
        result: 'nginx.service is active (running)',
        isError: false,
      }));
    });

    const toolResults = await screen.findAllByText('nginx.service is active (running)');
    expect(toolResults).toHaveLength(2);
    expect(screen.getByText('已完成')).toBeInTheDocument();
  });
});
