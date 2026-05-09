import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { CanvasWorkspaceView } from '../CanvasWorkspaceView';
import { CustomTitleBar } from '../CustomTitleBar';
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

function createCanvasOwnedWindow(): Window {
  const windowItem = createSinglePaneWindow('Canvas Worker', '/srv/canvas', 'bash');
  windowItem.id = 'canvas-owned-1';
  windowItem.activePaneId = windowItem.layout.id;
  windowItem.ownerType = 'canvas-owned';
  windowItem.ownerCanvasWorkspaceId = 'canvas-1';
  if (windowItem.layout.type === 'pane') {
    windowItem.layout.pane.status = WindowStatus.Running;
    windowItem.layout.pane.pid = 202;
  }
  return windowItem;
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

  it('renames the workspace from canvas mode without exposing workspace deletion', async () => {
    const user = userEvent.setup();

    render(
      <CanvasWorkspaceView
        canvasWorkspace={createCanvasWorkspace()}
      />,
    );

    expect(screen.queryByRole('button', { name: '删除画布' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '重命名画布' }));
    const workspaceNameInput = screen.getByLabelText('工作区名称');
    await user.clear(workspaceNameInput);
    await user.type(workspaceNameInput, 'Ops Board');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(useWindowStore.getState().getCanvasWorkspaceById('canvas-1')?.name).toBe('Ops Board');
    });
  });

  it('renders a stop button on the header right side and stops the workspace runtime', async () => {
    const user = userEvent.setup();
    const onStopWorkspace = vi.fn().mockResolvedValue(undefined);
    const canvasWorkspace = {
      ...createCanvasWorkspace(),
      blocks: [
        ...createCanvasWorkspace().blocks,
        {
          id: 'window-canvas-owned',
          type: 'window' as const,
          windowId: 'canvas-owned-1',
          x: 820,
          y: 40,
          width: 360,
          height: 220,
          zIndex: 4,
          label: 'Canvas Worker',
        },
      ],
      nextZIndex: 5,
    };

    useWindowStore.setState({
      windows: [
        useWindowStore.getState().getWindowById('terminal-1')!,
        useWindowStore.getState().getWindowById('terminal-2')!,
        createCanvasOwnedWindow(),
      ],
      canvasWorkspaces: [canvasWorkspace],
      activeCanvasWorkspaceId: 'canvas-1',
      activeWindowId: null,
      activeGroupId: null,
      groups: [],
    });

    render(
      <>
        <CustomTitleBar title="Incident Map" />
        <CanvasWorkspaceView
          canvasWorkspace={canvasWorkspace}
          onStopWorkspace={onStopWorkspace}
        />
      </>,
    );

    const stopButton = screen.getByRole('button', { name: '停止画布' });
    const titleBarSlot = screen.getByTestId('custom-titlebar-actions-slot');

    expect(titleBarSlot).toContainElement(stopButton);
    expect(within(titleBarSlot).getByRole('button', { name: '停止画布' })).toBe(stopButton);
    expect(titleBarSlot.nextElementSibling).toHaveAttribute('aria-label', 'Minimize');

    await user.click(stopButton);

    await waitFor(() => {
      expect(onStopWorkspace).toHaveBeenCalledWith('canvas-1');
    });
  });

  it('creates a new local terminal block from the canvas toolbar', async () => {
    const user = userEvent.setup();

    render(
      <CanvasWorkspaceView
        canvasWorkspace={createCanvasWorkspace()}
      />,
    );

    await user.click(screen.getByRole('button', { name: '添加内容' }));
    await user.click(screen.getByRole('button', { name: /本地终端/i }));
    await user.click(screen.getByRole('button', { name: '创建' }));

    await waitFor(() => {
      const updated = useWindowStore.getState().getCanvasWorkspaceById('canvas-1');
      expect(updated?.blocks.filter((block) => block.type === 'window')).toHaveLength(3);
    });
  });

  it('creates chat blocks with a taller default height', async () => {
    const user = userEvent.setup();

    render(
      <CanvasWorkspaceView
        canvasWorkspace={createCanvasWorkspace()}
      />,
    );

    await user.click(screen.getByRole('button', { name: '添加内容' }));
    await user.click(screen.getByRole('button', { name: /AI Chat/i }));
    await user.click(screen.getByRole('button', { name: '创建' }));

    await waitFor(() => {
      const updated = useWindowStore.getState().getCanvasWorkspaceById('canvas-1');
      const chatBlock = updated?.blocks
        .filter((block) => block.type === 'window')
        .find((block) => {
          if (block.type !== 'window') {
            return false;
          }
          const windowItem = useWindowStore.getState().getWindowById(block.windowId);
          return windowItem?.layout.type === 'pane' && windowItem.layout.pane.kind === 'chat';
        });
      expect(chatBlock?.type).toBe('window');
      if (chatBlock?.type === 'window') {
        expect(chatBlock.height).toBeGreaterThan(220);
        expect(chatBlock.width).toBeGreaterThan(360);
      }
    });
  });

  it('places newly created window blocks away from the top-left overlay and avoids overlap', async () => {
    const user = userEvent.setup();

    render(
      <CanvasWorkspaceView
        canvasWorkspace={createCanvasWorkspace()}
      />,
    );

    await user.click(screen.getByRole('button', { name: '添加内容' }));
    await user.click(screen.getByRole('button', { name: /本地终端/i }));
    await user.click(screen.getByRole('button', { name: '创建' }));

    await user.click(screen.getByRole('button', { name: '添加内容' }));
    await user.click(screen.getByRole('button', { name: /AI Chat/i }));
    await user.click(screen.getByRole('button', { name: '创建' }));

    await waitFor(() => {
      const updated = useWindowStore.getState().getCanvasWorkspaceById('canvas-1');
      const blocks = updated?.blocks.filter((block) => block.type === 'window') ?? [];
      expect(blocks).toHaveLength(4);

      const createdBlocks = blocks.filter((block) => block.id !== 'window-1' && block.id !== 'window-missing');
      expect(createdBlocks).toHaveLength(2);

      for (const block of createdBlocks) {
        expect(block.x).toBeGreaterThanOrEqual(112);
        expect(block.y).toBeGreaterThanOrEqual(124);
      }

      const [firstBlock, secondBlock] = createdBlocks;
      const overlaps = !(
        firstBlock.x + firstBlock.width <= secondBlock.x
        || secondBlock.x + secondBlock.width <= firstBlock.x
        || firstBlock.y + firstBlock.height <= secondBlock.y
        || secondBlock.y + secondBlock.height <= firstBlock.y
      );
      expect(overlaps).toBe(false);
    });
  });

  it('opens the existing terminal picker from the canvas create dialog', async () => {
    const user = userEvent.setup();

    render(
      <CanvasWorkspaceView
        canvasWorkspace={createCanvasWorkspace()}
      />,
    );

    await user.click(screen.getByRole('button', { name: '添加内容' }));
    await user.click(screen.getByRole('button', { name: /引用终端/i }));
    await user.click(screen.getByRole('button', { name: '选择终端' }));

    expect(await screen.findByText('选择一个现有终端窗口加入画布。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Terminal Beta/i })).toBeInTheDocument();
  });

  it('keeps referenced terminal cards readable after picking an existing terminal', async () => {
    const user = userEvent.setup();

    const { rerender } = render(
      <CanvasWorkspaceView
        canvasWorkspace={createCanvasWorkspace()}
      />,
    );

    await user.click(screen.getByRole('button', { name: '添加内容' }));
    await user.click(screen.getByRole('button', { name: /引用终端/i }));
    await user.click(screen.getByRole('button', { name: '选择终端' }));
    await user.click(await screen.findByRole('button', { name: /Terminal Beta/i }));

    rerender(
      <CanvasWorkspaceView
        canvasWorkspace={useWindowStore.getState().getCanvasWorkspaceById('canvas-1')!}
      />,
    );

    await waitFor(() => {
      const updated = useWindowStore.getState().getCanvasWorkspaceById('canvas-1');
      expect(updated?.blocks.filter((block) => block.type === 'window')).toHaveLength(3);
    });

    const updated = useWindowStore.getState().getCanvasWorkspaceById('canvas-1');
    const referencedBlock = updated?.blocks.find((block) => block.type === 'window' && block.id !== 'window-1' && block.id !== 'window-missing');
    expect(referencedBlock?.type).toBe('window');
    if (referencedBlock?.type === 'window') {
      expect(screen.getByTestId(`canvas-window-footer-${referencedBlock.id}`)).toBeInTheDocument();
    }
    expect(screen.getByText(/Dir: \/srv\/db/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '打开终端' }).at(-1)?.className).toContain('min-w-[104px]');
    expect(screen.getAllByRole('button', { name: '实时嵌入' }).at(-1)?.className).toContain('min-w-[104px]');
  });

  it('starts an inactive referenced terminal in place when toggling a window block into live embedded mode', async () => {
    const user = userEvent.setup();
    const onOpenWindow = vi.fn();
    const renderLiveWindow = vi.fn((windowId: string) => <div>Live:{windowId}</div>);
    vi.mocked(window.electronAPI.startWindow).mockResolvedValueOnce({
      success: true,
      data: {
        pid: 1001,
        sessionId: 'session-terminal-1',
        status: WindowStatus.Running,
      },
    });

    const { rerender } = render(
      <CanvasWorkspaceView
        canvasWorkspace={createCanvasWorkspace()}
        onOpenWindow={onOpenWindow}
        renderLiveWindow={renderLiveWindow}
      />,
    );

    await user.click(screen.getByRole('button', { name: '实时嵌入' }));

    expect(onOpenWindow).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(window.electronAPI.startWindow).toHaveBeenCalledWith(expect.objectContaining({
        windowId: 'terminal-1',
      }));
    });
    await waitFor(() => {
      const updatedWindow = useWindowStore.getState().getWindowById('terminal-1');
      expect(updatedWindow ? getAllPanes(updatedWindow.layout)[0]?.status : null).toBe(WindowStatus.Running);
    });

    rerender(
      <CanvasWorkspaceView
        canvasWorkspace={useWindowStore.getState().getCanvasWorkspaceById('canvas-1')!}
        onOpenWindow={onOpenWindow}
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

  it('downgrades live terminal blocks to summary when the referenced terminal stops', async () => {
    const terminalOne = useWindowStore.getState().getWindowById('terminal-1')!;
    const terminalTwo = useWindowStore.getState().getWindowById('terminal-2')!;
    const paneId = terminalOne.activePaneId;
    const runningTerminalOne: Window = {
      ...terminalOne,
      layout: {
        type: 'pane',
        id: paneId,
        pane: {
          ...getAllPanes(terminalOne.layout)[0]!,
          status: WindowStatus.Running,
          pid: 1001,
        },
      },
    };
    const liveWorkspace: CanvasWorkspace = {
      ...createCanvasWorkspace(),
      blocks: createCanvasWorkspace().blocks.map((block) => (
        block.id === 'window-1' && block.type === 'window'
          ? { ...block, displayMode: 'live' as const }
          : block
      )),
    };
    const renderLiveWindow = vi.fn((windowId: string) => <div>Live:{windowId}</div>);

    useWindowStore.setState({
      windows: [runningTerminalOne, terminalTwo],
      canvasWorkspaces: [liveWorkspace],
      activeCanvasWorkspaceId: 'canvas-1',
      activeWindowId: null,
      activeGroupId: null,
      groups: [],
    });

    const { rerender } = render(
      <CanvasWorkspaceView
        canvasWorkspace={liveWorkspace}
        renderLiveWindow={renderLiveWindow}
      />,
    );

    expect(await screen.findByText('Live:terminal-1')).toBeInTheDocument();

    act(() => {
      useWindowStore.getState().updatePane('terminal-1', paneId, {
        status: WindowStatus.Completed,
        pid: null,
        sessionId: undefined,
      });
    });

    await waitFor(() => {
      const updated = useWindowStore.getState().getCanvasWorkspaceById('canvas-1');
      const liveBlock = updated?.blocks.find((block) => block.id === 'window-1');
      expect(liveBlock?.type).toBe('window');
      if (liveBlock?.type === 'window') {
        expect(liveBlock.displayMode).toBe('summary');
      }
    });

    rerender(
      <CanvasWorkspaceView
        canvasWorkspace={useWindowStore.getState().getCanvasWorkspaceById('canvas-1')!}
        renderLiveWindow={renderLiveWindow}
      />,
    );

    expect(screen.getByRole('button', { name: '实时嵌入' })).toBeInTheDocument();
  });

  it('renders terminal card actions in flow layout with a dedicated footer row', async () => {
    render(
      <CanvasWorkspaceView
        canvasWorkspace={createCanvasWorkspace()}
      />,
    );

    const openTerminalButton = await screen.findByRole('button', { name: '打开终端' });
    const liveButton = await screen.findByRole('button', { name: '实时嵌入' });
    const footer = screen.getByTestId('canvas-window-footer-window-1');
    expect(openTerminalButton.className).toContain('min-w-[104px]');
    expect(liveButton.className).toContain('min-w-[104px]');
    expect(footer.className).toContain('flex-col');
    expect(footer.className).not.toContain('absolute');
    expect(screen.getByText(/Dir: \/srv\/app/)).toBeInTheDocument();
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

    const updated = useWindowStore.getState().getCanvasWorkspaceById('canvas-1');
    const originalBlockIds = new Set(['note-1', 'window-1', 'window-missing']);
    const originalBlocks = updated?.blocks.filter((block) => originalBlockIds.has(block.id)) ?? [];
    const newBlocks = updated?.blocks.filter((block) => !originalBlockIds.has(block.id)) ?? [];

    expect(newBlocks.length).toBeGreaterThan(0);

    for (const newBlock of newBlocks) {
      for (const originalBlock of originalBlocks) {
        const overlaps = !(
          newBlock.x + newBlock.width <= originalBlock.x
          || originalBlock.x + originalBlock.width <= newBlock.x
          || newBlock.y + newBlock.height <= originalBlock.y
          || originalBlock.y + originalBlock.height <= newBlock.y
        );
        expect(overlaps).toBe(false);
      }
    }
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

  it('renders canvas links from block edges instead of from block centers', async () => {
    const user = userEvent.setup();

    const { container, rerender } = render(
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

    rerender(
      <CanvasWorkspaceView
        canvasWorkspace={useWindowStore.getState().getCanvasWorkspaceById('canvas-1')!}
      />,
    );

    const linkPath = container.querySelector('[data-testid="canvas-link-path"]');
    expect(linkPath).not.toBeNull();
    expect(linkPath?.getAttribute('d')).toContain('M 340 ');
    expect(linkPath?.getAttribute('d')).toContain(' 420 ');
    expect(linkPath?.getAttribute('d')).not.toContain('M 180 120');
    expect(linkPath?.getAttribute('d')).not.toContain(' 600 150');
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

  it('opens quick switcher from canvas mode and switches to another canvas', async () => {
    const user = userEvent.setup();
    const onOpenCanvasWorkspace = vi.fn();

    useWindowStore.setState({
      canvasWorkspaces: [
        createCanvasWorkspace(),
        {
          ...createCanvasWorkspace(),
          id: 'canvas-2',
          name: 'Follow-up Board',
        },
      ],
    });

    render(
      <CanvasWorkspaceView
        canvasWorkspace={createCanvasWorkspace()}
        onOpenCanvasWorkspace={onOpenCanvasWorkspace}
      />,
    );

    await user.keyboard('{Control>}{Tab}{/Control}');
    await screen.findByText('Follow-up Board');
    await user.click(screen.getByText('Follow-up Board'));

    expect(onOpenCanvasWorkspace).toHaveBeenCalledWith('canvas-2');
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
