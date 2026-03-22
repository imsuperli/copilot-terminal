import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { CardGrid } from '../CardGrid';
import { useWindowStore } from '../../stores/windowStore';
import { Window, WindowStatus } from '../../types/window';

function makeWindow(overrides: Partial<Window> = {}): Window {
  const paneId = overrides.activePaneId || 'pane-1';

  return {
    id: 'win-1',
    name: 'Test Window',
    activePaneId: paneId,
    createdAt: '2024-01-01T10:00:00Z',
    lastActiveAt: '2024-01-01T10:00:00Z',
    layout: {
      type: 'pane',
      id: paneId,
      pane: {
        id: paneId,
        cwd: 'D:\\missing\\repo',
        command: 'pwsh.exe',
        status: WindowStatus.Paused,
        pid: null,
      },
    },
    ...overrides,
  };
}

function renderCardGrid(props: ComponentProps<typeof CardGrid> = {}) {
  return render(
    <DndProvider backend={HTML5Backend}>
      <CardGrid {...props} />
    </DndProvider>,
  );
}

describe('CardGrid missing working directory guard', () => {
  beforeEach(() => {
    useWindowStore.setState({
      windows: [],
      activeWindowId: null,
      mruList: [],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });
    vi.clearAllMocks();
    vi.mocked(window.electronAPI.getSettings).mockResolvedValue({
      success: true,
      data: {
        language: 'zh-CN',
        ides: [
          { id: 'vscode', name: 'VS Code', command: 'code', enabled: true, icon: '' },
        ],
        quickNav: { items: [] },
        terminal: { useBundledConptyDll: false, defaultShellProgram: '' },
      },
    });
  });

  it('enters terminal immediately when working directory exists', async () => {
    const user = userEvent.setup();
    const handleEnterTerminal = vi.fn();
    const terminalWindow = makeWindow();

    useWindowStore.getState().addWindow(terminalWindow);
    vi.mocked(window.electronAPI.validatePath).mockResolvedValueOnce({ success: true, data: true });

    renderCardGrid({ onEnterTerminal: handleEnterTerminal });

    await user.click(screen.getByRole('button', { name: /Test Window/ }));

    await waitFor(() => {
      expect(handleEnterTerminal).toHaveBeenCalledWith(terminalWindow);
    });
    expect(screen.queryByText('工作目录不存在')).not.toBeInTheDocument();
  });

  it('creates the missing directory and then enters terminal', async () => {
    const user = userEvent.setup();
    const handleEnterTerminal = vi.fn();
    const terminalWindow = makeWindow();

    useWindowStore.getState().addWindow(terminalWindow);
    vi.mocked(window.electronAPI.validatePath).mockResolvedValueOnce({ success: true, data: false });
    vi.mocked(window.electronAPI.createDirectory).mockResolvedValueOnce({
      success: true,
      data: 'D:\\missing\\repo',
    });

    renderCardGrid({ onEnterTerminal: handleEnterTerminal });

    await user.click(screen.getByRole('button', { name: /Test Window/ }));

    expect(await screen.findByText('工作目录不存在')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '自动创建目录' }));

    await waitFor(() => {
      expect(window.electronAPI.createDirectory).toHaveBeenCalledWith('D:\\missing\\repo');
      expect(handleEnterTerminal).toHaveBeenCalledWith(terminalWindow);
    });
  });

  it('deletes the window when user chooses delete', async () => {
    const user = userEvent.setup();
    const handleEnterTerminal = vi.fn();

    useWindowStore.getState().addWindow(makeWindow());
    vi.mocked(window.electronAPI.validatePath).mockResolvedValueOnce({ success: true, data: false });
    vi.mocked(window.electronAPI.deleteWindow).mockResolvedValueOnce({ success: true });

    renderCardGrid({ onEnterTerminal: handleEnterTerminal });

    await user.click(screen.getByRole('button', { name: /Test Window/ }));
    await user.click(await screen.findByRole('button', { name: '删除该窗口' }));

    await waitFor(() => {
      expect(window.electronAPI.deleteWindow).toHaveBeenCalledWith('win-1');
      expect(useWindowStore.getState().windows).toHaveLength(0);
    });
    expect(handleEnterTerminal).not.toHaveBeenCalled();
  });

  it('applies the same missing-directory guard to the start button', async () => {
    const user = userEvent.setup();

    useWindowStore.getState().addWindow(makeWindow());
    vi.mocked(window.electronAPI.validatePath).mockResolvedValueOnce({ success: true, data: false });

    renderCardGrid();

    await user.click(screen.getByRole('button', { name: '启动' }));

    expect(await screen.findByText('工作目录不存在')).toBeInTheDocument();
    expect(window.electronAPI.startWindow).not.toHaveBeenCalled();
  });

  it('applies the same missing-directory guard to the open folder button', async () => {
    const user = userEvent.setup();
    const runningWindow = makeWindow({
      layout: {
        type: 'pane',
        id: 'pane-1',
        pane: {
          id: 'pane-1',
          cwd: 'D:\\missing\\repo',
          command: 'pwsh.exe',
          status: WindowStatus.Running,
          pid: 42,
        },
      },
    });

    useWindowStore.getState().addWindow(runningWindow);
    vi.mocked(window.electronAPI.validatePath).mockResolvedValueOnce({ success: true, data: false });

    renderCardGrid();

    await user.click(screen.getByRole('button', { name: '打开文件夹' }));

    expect(await screen.findByText('工作目录不存在')).toBeInTheDocument();
    expect(window.electronAPI.openFolder).not.toHaveBeenCalled();
  });

  it('applies the same missing-directory guard to the IDE button', async () => {
    const user = userEvent.setup();
    const runningWindow = makeWindow({
      layout: {
        type: 'pane',
        id: 'pane-1',
        pane: {
          id: 'pane-1',
          cwd: 'D:\\missing\\repo',
          command: 'pwsh.exe',
          status: WindowStatus.Running,
          pid: 42,
        },
      },
    });

    useWindowStore.getState().addWindow(runningWindow);
    vi.mocked(window.electronAPI.validatePath).mockResolvedValueOnce({ success: true, data: false });

    renderCardGrid();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '在 VS Code 中打开' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: '在 VS Code 中打开' }));

    expect(await screen.findByText('工作目录不存在')).toBeInTheDocument();
    expect(window.electronAPI.openInIDE).not.toHaveBeenCalled();
  });
});
