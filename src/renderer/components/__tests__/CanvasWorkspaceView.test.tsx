import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasWorkspaceView } from '../CanvasWorkspaceView';
import { useWindowStore } from '../../stores/windowStore';
import { createSinglePaneWindow, getAllPanes } from '../../utils/layoutHelpers';
import { WindowStatus, type Window } from '../../types/window';
import type { CanvasWorkspace } from '../../../shared/types/canvas';

function createCanvasWorkspace(): CanvasWorkspace {
  return {
    id: 'canvas-1',
    name: 'Incident Map',
    createdAt: '2026-05-03T00:00:00.000Z',
    updatedAt: '2026-05-03T00:00:00.000Z',
    blocks: [
      {
        id: 'note-1',
        type: 'note',
        x: 20,
        y: 20,
        width: 320,
        height: 200,
        zIndex: 1,
        label: 'Checklist',
        content: 'Investigate disk usage',
      },
      {
        id: 'window-1',
        type: 'window',
        windowId: 'terminal-1',
        x: 420,
        y: 40,
        width: 360,
        height: 220,
        zIndex: 2,
        label: 'Prod Host',
      },
      {
        id: 'window-missing',
        type: 'window',
        windowId: 'missing-terminal',
        x: 420,
        y: 320,
        width: 360,
        height: 220,
        zIndex: 3,
        label: 'Missing Host',
      },
    ],
    viewport: { tx: 0, ty: 0, zoom: 1 },
    nextZIndex: 4,
  };
}

function createSshWindow(): Window {
  return {
    id: 'ssh-window-1',
    name: 'SSH Window',
    activePaneId: 'ssh-pane-1',
    createdAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
    kind: 'ssh',
    layout: {
      type: 'pane',
      id: 'ssh-pane-1',
      pane: {
        id: 'ssh-pane-1',
        cwd: '/srv/app',
        command: '',
        status: WindowStatus.Running,
        pid: 101,
        backend: 'ssh',
        lastOutput: 'df -h',
        ssh: {
          profileId: 'profile-1',
          host: '10.0.0.20',
          user: 'root',
          remoteCwd: '/srv/app',
        },
      },
    },
  };
}

describe('CanvasWorkspaceView', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const terminalOne = createSinglePaneWindow('Terminal Alpha', '/srv/app', 'bash');
    terminalOne.id = 'terminal-1';
    terminalOne.activePaneId = terminalOne.layout.id;
    if (terminalOne.layout.type === 'pane') {
      terminalOne.layout.pane.lastOutput = 'df -h\nFilesystem 90%';
    }

    const terminalTwo = createSinglePaneWindow('Terminal Beta', '/srv/db', 'bash');
    terminalTwo.id = 'terminal-2';
    terminalTwo.activePaneId = terminalTwo.layout.id;

    useWindowStore.setState({
      windows: [terminalOne, terminalTwo],
      canvasWorkspaces: [createCanvasWorkspace()],
      activeCanvasWorkspaceId: 'canvas-1',
      activeWindowId: null,
      activeGroupId: null,
      groups: [],
    });
  });

  it('renames a note block from the canvas chrome', async () => {
    const user = userEvent.setup();

    render(
      <CanvasWorkspaceView
        canvasWorkspace={createCanvasWorkspace()}
      />,
    );

    const renameButtons = screen.getAllByTitle('重命名块');
    await user.click(renameButtons[0]);

    const titleInput = screen.getByLabelText('块标题');
    await user.clear(titleInput);
    await user.type(titleInput, 'Runbook{enter}');

    await waitFor(() => {
      const updated = useWindowStore.getState().getCanvasWorkspaceById('canvas-1');
      expect(updated?.blocks.find((block) => block.id === 'note-1')?.label).toBe('Runbook');
    });
  });

  it('relinks a missing window block to an existing terminal', async () => {
    const user = userEvent.setup();

    render(
      <CanvasWorkspaceView
        canvasWorkspace={createCanvasWorkspace()}
      />,
    );

    await user.click(screen.getByRole('button', { name: '重新绑定终端' }));
    await user.click(await screen.findByRole('button', { name: /Terminal Beta/i }));

    await waitFor(() => {
      const updated = useWindowStore.getState().getCanvasWorkspaceById('canvas-1');
      const missingBlock = updated?.blocks.find((block) => block.id === 'window-missing');
      expect(missingBlock?.type).toBe('window');
      if (missingBlock?.type === 'window') {
        expect(missingBlock.windowId).toBe('terminal-2');
        expect(missingBlock.label).toBe('Terminal Beta');
      }
    });
  });

  it('renames and deletes the workspace from canvas mode', async () => {
    const user = userEvent.setup();
    const onExitWorkspace = vi.fn().mockResolvedValue(undefined);

    render(
      <CanvasWorkspaceView
        canvasWorkspace={createCanvasWorkspace()}
        onExitWorkspace={onExitWorkspace}
      />,
    );

    await user.click(screen.getByRole('button', { name: '重命名画布' }));
    const workspaceNameInput = screen.getByLabelText('工作区名称');
    await user.clear(workspaceNameInput);
    await user.type(workspaceNameInput, 'Ops Board');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(useWindowStore.getState().getCanvasWorkspaceById('canvas-1')?.name).toBe('Ops Board');
    });

    await user.click(screen.getByRole('button', { name: '删除画布' }));
    await user.click(screen.getByRole('button', { name: '删除' }));

    await waitFor(() => {
      expect(useWindowStore.getState().getCanvasWorkspaceById('canvas-1')).toBeUndefined();
    });
    expect(onExitWorkspace).toHaveBeenCalledTimes(1);
  });

  it('creates a new local terminal block from the canvas toolbar', async () => {
    const user = userEvent.setup();

    render(
      <CanvasWorkspaceView
        canvasWorkspace={createCanvasWorkspace()}
      />,
    );

    await user.click(screen.getByRole('button', { name: '新建块' }));
    await user.click(screen.getByRole('button', { name: /本地终端/i }));
    await user.click(screen.getByRole('button', { name: '创建' }));

    await waitFor(() => {
      const updated = useWindowStore.getState().getCanvasWorkspaceById('canvas-1');
      expect(updated?.blocks.filter((block) => block.type === 'window')).toHaveLength(3);
    });
  });

  it('toggles a window block into live embedded mode', async () => {
    const user = userEvent.setup();
    const renderLiveWindow = vi.fn((windowId: string) => <div>Live:{windowId}</div>);

    const { rerender } = render(
      <CanvasWorkspaceView
        canvasWorkspace={createCanvasWorkspace()}
        renderLiveWindow={renderLiveWindow}
      />,
    );

    await user.click(screen.getByRole('button', { name: '实时嵌入' }));
    rerender(
      <CanvasWorkspaceView
        canvasWorkspace={useWindowStore.getState().getCanvasWorkspaceById('canvas-1')!}
        renderLiveWindow={renderLiveWindow}
      />,
    );

    await waitFor(() => {
      expect(renderLiveWindow).toHaveBeenCalledWith('terminal-1', expect.objectContaining({ isActive: false }));
      expect(screen.getByText('Live:terminal-1')).toBeInTheDocument();
    });

    const updated = useWindowStore.getState().getCanvasWorkspaceById('canvas-1');
    const liveBlock = updated?.blocks.find((block) => block.id === 'window-1');
    expect(liveBlock?.type).toBe('window');
    if (liveBlock?.type === 'window') {
      expect(liveBlock.displayMode).toBe('live');
    }
  });

  it('keeps terminal card action buttons above the summary overlay', async () => {
    render(
      <CanvasWorkspaceView
        canvasWorkspace={createCanvasWorkspace()}
      />,
    );

    const openTerminalButton = await screen.findByRole('button', { name: '打开终端' });
    const actionContainer = openTerminalButton.parentElement?.parentElement;
    expect(actionContainer?.className).toContain('z-10');
    expect(actionContainer?.className).toContain('absolute');
  });

  it('merges template blocks into the existing canvas instead of replacing current blocks', async () => {
    const user = userEvent.setup();

    render(
      <CanvasWorkspaceView
        canvasWorkspace={createCanvasWorkspace()}
      />,
    );

    await user.click(screen.getByRole('button', { name: '模板' }));
    const applyButtons = await screen.findAllByRole('button', { name: '应用模板' });
    await user.click(applyButtons[0]);

    await waitFor(() => {
      const updated = useWindowStore.getState().getCanvasWorkspaceById('canvas-1');
      expect(updated?.blocks.some((block) => block.id === 'note-1')).toBe(true);
      expect((updated?.blocks.length ?? 0)).toBeGreaterThan(3);
    });
  });

  it('sends selected evidence into a new note block with links', async () => {
    const user = userEvent.setup();

    render(
      <CanvasWorkspaceView
        canvasWorkspace={createCanvasWorkspace()}
      />,
    );

    await user.click(screen.getByText('Checklist'));
    await user.keyboard('{Control>}');
    await user.click(screen.getByText('Prod Host'));
    await user.keyboard('{/Control}');
    await user.click(screen.getByRole('button', { name: '发送到便签' }));

    await waitFor(() => {
      const updated = useWindowStore.getState().getCanvasWorkspaceById('canvas-1');
      const noteBlocks = updated?.blocks.filter((block) => block.type === 'note') ?? [];
      expect(noteBlocks).toHaveLength(2);
      const createdNote = noteBlocks.find((block) => block.id !== 'note-1');
      expect(createdNote?.type).toBe('note');
      if (createdNote?.type === 'note') {
        expect(createdNote.label).toBe('证据摘录');
        expect(createdNote.content).toContain('# Incident Map');
        expect(createdNote.content).toContain('## Checklist');
        expect(createdNote.content).toContain('## Prod Host');
      }
      expect(updated?.links?.length).toBe(2);
    });
  });

  it('creates and removes explicit links between selected blocks', async () => {
    const user = userEvent.setup();

    render(
      <CanvasWorkspaceView
        canvasWorkspace={createCanvasWorkspace()}
      />,
    );

    await user.click(screen.getByText('Checklist'));
    await user.keyboard('{Control>}');
    await user.click(screen.getByText('Prod Host'));
    await user.keyboard('{/Control}');
    await user.click(screen.getByTitle('连接选中块'));

    await waitFor(() => {
      expect(useWindowStore.getState().getCanvasWorkspaceById('canvas-1')?.links).toHaveLength(1);
    });

    await user.click(screen.getByTitle('连接选中块'));

    await waitFor(() => {
      expect(useWindowStore.getState().getCanvasWorkspaceById('canvas-1')?.links ?? []).toHaveLength(0);
    });
  });

  it('exports the canvas report to clipboard', async () => {
    const user = userEvent.setup();

    render(
      <CanvasWorkspaceView
        canvasWorkspace={createCanvasWorkspace()}
      />,
    );

    await user.click(screen.getByRole('button', { name: '导出报告' }));

    await waitFor(() => {
      expect(window.electronAPI.writeClipboardText).toHaveBeenCalledWith(expect.stringContaining('# Incident Map report'));
    });
  });

  it('sends selected blocks to AI through a chat block', async () => {
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

    render(
      <CanvasWorkspaceView
        canvasWorkspace={createCanvasWorkspace()}
      />,
    );

    await user.click(screen.getByText('Checklist'));
    await user.click(screen.getByRole('button', { name: '提问 AI' }));

    await waitFor(() => {
      expect(window.electronAPI.agentSend).toHaveBeenCalledWith(expect.objectContaining({
        providerId: 'provider-1',
        model: 'claude-sonnet-4-5',
        text: expect.stringContaining('## Checklist'),
        contextFragments: [
          expect.objectContaining({
            path: 'canvas://canvas-1/selection',
            content: expect.stringContaining('## Checklist'),
          }),
        ],
      }));
    });

    const updatedWindows = useWindowStore.getState().windows;
    expect(updatedWindows.some((windowItem) => windowItem.layout.type === 'pane' && windowItem.layout.pane.kind === 'chat')).toBe(true);
  });

  it('reuses a split chat pane in an ssh window and merges canvas defaults into the request', async () => {
    const user = userEvent.setup();
    const sshWindow = createSshWindow();

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
          defaultSystemPrompt: '默认 system',
          workspaceInstructions: '全局工作区指令',
          contextFilePaths: ['/workspace/project/README.md'],
          enableCommandSecurity: true,
        },
      } as any,
    });
    vi.mocked(window.electronAPI.agentSend).mockResolvedValue({
      success: true,
      data: {
        taskId: 'task-2',
        status: 'running',
      },
    });
    vi.mocked(window.electronAPI.codePaneReadFile)
      .mockResolvedValueOnce({
        success: true,
        data: {
          content: '# Project README',
          mtimeMs: Date.now(),
          size: 16,
          language: 'markdown',
          isBinary: false,
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          content: 'canvas-specific context',
          mtimeMs: Date.now(),
          size: 23,
          language: 'markdown',
          isBinary: false,
        },
      });

    const canvasWorkspace = {
      ...createCanvasWorkspace(),
      blocks: [
        {
          id: 'window-ssh',
          type: 'window' as const,
          windowId: sshWindow.id,
          x: 20,
          y: 20,
          width: 360,
          height: 220,
          zIndex: 1,
          label: 'Prod SSH',
        },
      ],
      chatDefaults: {
        workspaceInstructions: '画布级附加指令',
        contextFilePaths: ['/workspace/project/canvas.md'],
      },
    };

    useWindowStore.setState({
      windows: [sshWindow],
      canvasWorkspaces: [canvasWorkspace],
      activeCanvasWorkspaceId: 'canvas-1',
      activeWindowId: sshWindow.id,
      activeGroupId: null,
      groups: [],
    });

    render(
      <CanvasWorkspaceView
        canvasWorkspace={canvasWorkspace}
      />,
    );

    await user.click(screen.getByText('Prod SSH'));
    await user.click(screen.getByRole('button', { name: '提问 AI' }));

    await waitFor(() => {
      const updatedWindow = useWindowStore.getState().getWindowById('ssh-window-1');
      const chatPane = updatedWindow ? getAllPanes(updatedWindow.layout).find((pane) => pane.kind === 'chat') : null;
      expect(chatPane).toBeTruthy();
      expect(window.electronAPI.agentSend).toHaveBeenCalledWith(expect.objectContaining({
        windowId: 'ssh-window-1',
        paneId: chatPane?.id,
        linkedPaneId: 'ssh-pane-1',
        enableTools: true,
        systemPrompt: '默认 system\n\n全局工作区指令\n\n画布级附加指令',
        contextFragments: [
          expect.objectContaining({
            path: 'canvas://canvas-1/selection',
            content: expect.stringContaining('## Prod SSH'),
          }),
          {
            type: 'file',
            path: '/workspace/project/README.md',
            label: 'README.md',
            content: '# Project README',
          },
          {
            type: 'file',
            path: '/workspace/project/canvas.md',
            label: 'canvas.md',
            content: 'canvas-specific context',
          },
        ],
      }));
    });
  });
});
