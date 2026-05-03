import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasWorkspaceView } from '../CanvasWorkspaceView';
import { useWindowStore } from '../../stores/windowStore';
import { createSinglePaneWindow } from '../../utils/layoutHelpers';
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
});
