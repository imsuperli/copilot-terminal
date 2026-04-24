import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { WindowCard } from '../WindowCard';
import { Window, WindowStatus } from '../../types/window';
import { createSinglePaneWindow } from '../../utils/layoutHelpers';

function createWindow(overrides: Partial<Window> = {}): Window {
  const baseWindow = createSinglePaneWindow('Test Window', '/home/user/project', 'bash');

  return {
    ...baseWindow,
    id: 'window-card-test',
    createdAt: '2024-01-01T10:00:00.000Z',
    lastActiveAt: '2024-01-01T10:30:00.000Z',
    layout: {
      type: 'pane',
      id: baseWindow.activePaneId,
      pane: {
        id: baseWindow.activePaneId,
        cwd: '/home/user/project',
        command: 'bash',
        status: WindowStatus.Running,
        pid: 1234,
        backend: 'local',
      },
    },
    ...overrides,
  };
}

describe('WindowCard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(window.electronAPI, 'getSettings').mockResolvedValue({
      success: true,
      data: {
        language: 'zh-CN',
        ides: [],
        quickNav: { items: [] },
        terminal: { useBundledConptyDll: false, defaultShellProgram: '' },
        features: { sshEnabled: true },
        chat: { providers: [], enableCommandSecurity: true },
      },
    });
  });

  it('renders the window name and working directory', () => {
    render(<WindowCard window={createWindow()} />);

    expect(screen.getByText('Test Window')).toBeInTheDocument();
    expect(screen.getByTestId('working-directory')).toHaveTextContent('/home/user/project');
  });

  it('uses the shared translucent interactive card surface', () => {
    render(<WindowCard window={createWindow()} />);

    const card = screen.getByRole('button', { name: /Test Window/ });
    expect(card.className).toContain('bg-[linear-gradient(180deg,var(--appearance-card-surface-top)_0%,var(--appearance-card-surface-bottom)_100%)]');
    expect(card.className).toContain('hover:bg-[linear-gradient(180deg,var(--appearance-card-hover-surface-top)_0%,var(--appearance-card-hover-surface-bottom)_100%)]');
  });

  it('renders pane count badge for multi-pane windows', () => {
    const multiPaneWindow = createWindow({
      activePaneId: 'pane-1',
      layout: {
        type: 'split',
        direction: 'horizontal',
        sizes: [0.5, 0.5],
        children: [
          {
            type: 'pane',
            id: 'layout-pane-1',
            pane: {
              id: 'pane-1',
              cwd: '/home/user/project',
              command: 'bash',
              status: WindowStatus.Running,
              pid: 1001,
              backend: 'local',
            },
          },
          {
            type: 'pane',
            id: 'layout-pane-2',
            pane: {
              id: 'pane-2',
              cwd: '/srv/project',
              command: 'bash',
              status: WindowStatus.WaitingForInput,
              pid: 1002,
              backend: 'ssh',
              ssh: {
                profileId: 'ssh-profile-1',
                host: '10.0.0.8',
                port: 22,
                user: 'root',
                authType: 'password',
              },
            },
          },
        ],
      },
    });

    render(<WindowCard window={multiPaneWindow} />);

    expect(screen.getByText('2 个窗格')).toBeInTheDocument();
    expect(screen.getByTestId('window-card-logo-mixed')).toHaveAttribute('data-terminal-type-logo', 'mixed');
  });

  it('shows the restoring overlay when the aggregated status is restoring', () => {
    const restoringWindow = createWindow({
      layout: {
        type: 'pane',
        id: 'layout-pane-restoring',
        pane: {
          id: 'pane-restoring',
          cwd: '/home/user/project',
          command: 'bash',
          status: WindowStatus.Restoring,
          pid: null,
          backend: 'local',
        },
      },
      activePaneId: 'pane-restoring',
    });

    render(<WindowCard window={restoringWindow} />);

    expect(screen.getByText('正在启动终端...')).toBeInTheDocument();
    expect(screen.getByText('请稍候')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Test Window/ })).toBeInTheDocument();
  });

  it('calls onClick when clicked', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<WindowCard window={createWindow()} onClick={onClick} />);

    await waitFor(() => {
      expect(window.electronAPI.getSettings).toHaveBeenCalled();
    });

    await user.click(screen.getByRole('button', { name: /Test Window/ }));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'window-card-test' }));
  });

  it('calls onClick when enter or space is pressed', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<WindowCard window={createWindow()} onClick={onClick} />);

    await waitFor(() => {
      expect(window.electronAPI.getSettings).toHaveBeenCalled();
    });

    const card = screen.getByRole('button', { name: /Test Window/ });
    card.focus();
    await act(async () => {
      await user.keyboard('{Enter}');
      await user.keyboard(' ');
    });

    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('exposes an accessible label with name, status, cwd, and pane count', async () => {
    render(<WindowCard window={createWindow()} />);

    await waitFor(() => {
      expect(window.electronAPI.getSettings).toHaveBeenCalled();
    });

    const card = screen.getByRole('button', { name: /Test Window/ });
    const ariaLabel = card.getAttribute('aria-label') ?? '';

    expect(ariaLabel).toContain('Test Window');
    expect(ariaLabel).toContain('运行中');
    expect(ariaLabel).toContain('/home/user/project');
    expect(ariaLabel).toContain('1 个窗格');
  });

  it('renders stop action for running windows and triggers it without bubbling', async () => {
    const onClick = vi.fn();
    const onDestroySession = vi.fn();
    const user = userEvent.setup();
    render(<WindowCard window={createWindow()} onClick={onClick} onDestroySession={onDestroySession} />);

    await user.click(screen.getByRole('button', { name: '销毁' }));

    expect(onDestroySession).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders start action for paused windows and triggers it without bubbling', async () => {
    const onClick = vi.fn();
    const onStart = vi.fn();
    const user = userEvent.setup();
    const pausedWindow = createWindow({
      layout: {
        type: 'pane',
        id: 'layout-pane-paused',
        pane: {
          id: 'pane-paused',
          cwd: '/home/user/project',
          command: 'bash',
          status: WindowStatus.Paused,
          pid: null,
          backend: 'local',
        },
      },
      activePaneId: 'pane-paused',
    });

    render(<WindowCard window={pausedWindow} onClick={onClick} onStart={onStart} />);

    await user.click(screen.getByRole('button', { name: '启动' }));

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('falls back when no working directory is available', () => {
    const missingCwdWindow = createWindow({
      layout: {
        type: 'pane',
        id: 'layout-pane-empty-cwd',
        pane: {
          id: 'pane-empty-cwd',
          cwd: '',
          command: 'bash',
          status: WindowStatus.Running,
          pid: 1234,
          backend: 'local',
        },
      },
      activePaneId: 'pane-empty-cwd',
    });

    render(<WindowCard window={missingCwdWindow} />);

    expect(screen.getByTestId('working-directory')).toHaveTextContent('(无工作目录)');
  });

  it('renders archive, edit and delete actions', async () => {
    render(<WindowCard window={createWindow()} />);

    await waitFor(() => {
      expect(window.electronAPI.getSettings).toHaveBeenCalled();
    });

    const card = screen.getByRole('button', { name: /Test Window/ });
    expect(within(card).getByRole('button', { name: '归档窗口' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: '编辑' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: '删除窗口' })).toBeInTheDocument();
  });
});
