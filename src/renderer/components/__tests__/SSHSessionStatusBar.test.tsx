import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SSHSessionStatusBar } from '../SSHSessionStatusBar';
import { WindowStatus } from '../../types/window';

describe('SSHSessionStatusBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads and renders server metrics for the active ssh pane', async () => {
    vi.mocked(window.electronAPI.getSSHSessionMetrics).mockResolvedValueOnce({
      success: true,
      data: {
        hostname: 'prod-host',
        platform: 'Linux',
        loadAverage: [0.23, 0.31, 0.44],
        memory: {
          totalBytes: 8 * 1024 * 1024 * 1024,
          usedBytes: 3 * 1024 * 1024 * 1024,
          usedPercent: 37.5,
        },
        disk: {
          path: '/srv/app',
          totalBytes: 128 * 1024 * 1024 * 1024,
          usedBytes: 48 * 1024 * 1024 * 1024,
          usedPercent: 37.5,
        },
        sampledAt: '2026-03-23T09:00:00.000Z',
      },
    });

    render(
      <SSHSessionStatusBar
        windowId="win-1"
        paneId="pane-1"
        paneStatus={WindowStatus.WaitingForInput}
        currentCwd="/srv/app"
      />,
    );

    await waitFor(() => {
      expect(window.electronAPI.getSSHSessionMetrics).toHaveBeenCalledWith({
        windowId: 'win-1',
        paneId: 'pane-1',
        path: '/srv/app',
      });
    });

    expect(screen.getByTestId('ssh-session-status-bar')).toBeInTheDocument();
    expect(await screen.findByText('prod-host')).toBeInTheDocument();
    expect(screen.getByText('0.23 / 0.31 / 0.44')).toBeInTheDocument();
    expect(screen.getByText('/srv/app')).toBeInTheDocument();
  });

  it('shows a non-blocking error badge when metrics fail', async () => {
    vi.mocked(window.electronAPI.getSSHSessionMetrics).mockResolvedValueOnce({
      success: false,
      error: 'metrics unavailable',
    });

    render(
      <SSHSessionStatusBar
        windowId="win-1"
        paneId="pane-1"
        paneStatus={WindowStatus.Running}
        currentCwd="/srv/app"
      />,
    );

    expect(await screen.findByText('监控不可用')).toBeInTheDocument();
  });

  it('renders a close button when a close handler is provided', async () => {
    vi.mocked(window.electronAPI.getSSHSessionMetrics).mockResolvedValueOnce({
      success: true,
      data: {
        hostname: 'prod-host',
        platform: 'Linux',
        loadAverage: [],
        memory: null,
        disk: null,
        sampledAt: '2026-03-23T09:00:00.000Z',
      },
    });

    const onClose = vi.fn();

    render(
      <SSHSessionStatusBar
        windowId="win-1"
        paneId="pane-1"
        paneStatus={WindowStatus.Running}
        currentCwd="/srv/app"
        onClose={onClose}
      />,
    );

    expect(await screen.findByRole('button', { name: '隐藏 SSH 监控' })).toBeInTheDocument();
  });

  it('does not query metrics for paused panes', () => {
    render(
      <SSHSessionStatusBar
        windowId="win-1"
        paneId="pane-1"
        paneStatus={WindowStatus.Paused}
        currentCwd="/srv/app"
      />,
    );

    expect(window.electronAPI.getSSHSessionMetrics).not.toHaveBeenCalled();
    expect(screen.getAllByText('--').length).toBeGreaterThan(0);
  });

  it('keeps the status bar quiet when the main process reports no active metrics session', async () => {
    vi.mocked(window.electronAPI.getSSHSessionMetrics).mockResolvedValueOnce({
      success: true,
      data: null,
    });

    render(
      <SSHSessionStatusBar
        windowId="win-1"
        paneId="pane-1"
        paneStatus={WindowStatus.WaitingForInput}
        currentCwd="/srv/app"
      />,
    );

    await waitFor(() => {
      expect(window.electronAPI.getSSHSessionMetrics).toHaveBeenCalledWith({
        windowId: 'win-1',
        paneId: 'pane-1',
        path: '/srv/app',
      });
    });

    expect(screen.queryByText('监控不可用')).not.toBeInTheDocument();
  });
});
