import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { StatusBar } from '../StatusBar';
import { useWindowStore } from '../../stores/windowStore';
import { createSinglePaneWindow, splitPane } from '../../utils/layoutHelpers';
import { createGroup } from '../../utils/groupLayoutHelpers';
import { Pane, Window, WindowStatus } from '../../types/window';
import { SSHProfile } from '../../../shared/types/ssh';

function makeWindow(status: WindowStatus, overrides: Partial<Window> = {}): Window {
  const window = createSinglePaneWindow(`window-${status}`, '/workspace', 'bash');

  if (window.layout.type === 'pane') {
    window.layout.pane.status = status;
  }

  return {
    ...window,
    ...overrides,
  };
}

function makeSplitWindow(
  firstStatus: WindowStatus,
  secondStatus: WindowStatus,
  overrides: Partial<Window> = {},
): Window {
  const baseWindow = makeWindow(firstStatus, overrides);
  const extraPane: Pane = {
    id: `${baseWindow.id}-extra-pane`,
    cwd: '/workspace',
    command: 'bash',
    status: secondStatus,
    pid: null,
  };

  return {
    ...baseWindow,
    layout: splitPane(baseWindow.layout, baseWindow.activePaneId, 'horizontal', extraPane) ?? baseWindow.layout,
  };
}

function makeSSHProfile(overrides: Partial<SSHProfile> = {}): SSHProfile {
  return {
    id: 'ssh-profile-1',
    name: 'Prod',
    host: '10.0.0.21',
    port: 22,
    user: 'root',
    auth: 'password',
    privateKeys: [],
    keepaliveInterval: 30,
    keepaliveCountMax: 3,
    readyTimeout: null,
    verifyHostKeys: true,
    x11: false,
    skipBanner: false,
    agentForward: false,
    warnOnClose: true,
    reuseSession: true,
    forwardedPorts: [],
    remoteCommand: '',
    defaultRemoteCwd: '/srv/app',
    tags: [],
    createdAt: '2026-04-11T00:00:00.000Z',
    updatedAt: '2026-04-11T00:00:00.000Z',
    ...overrides,
  };
}

function makeStandaloneSSHWindow(profileId: string, status: WindowStatus, overrides: Partial<Window> = {}): Window {
  const window = makeWindow(status, { kind: 'ssh', ...overrides });

  if (window.layout.type === 'pane') {
    window.layout.pane.backend = 'ssh';
    window.layout.pane.ssh = {
      profileId,
      host: '10.0.0.21',
      port: 22,
      user: 'root',
      authType: 'password',
      remoteCwd: '/srv/app',
      reuseSession: true,
    };
  }

  return window;
}

describe('StatusBar', () => {
  beforeEach(() => {
    useWindowStore.setState({
      windows: [],
      groups: [],
      activeWindowId: null,
    });
  });

  it('shows zero counts when no windows exist', () => {
    render(<StatusBar />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);
    expect(screen.getAllByText('0')).toHaveLength(3);
  });

  it('counts rendered status cards instead of raw pane totals', () => {
    const runningWindow = makeWindow(WindowStatus.Running, { id: 'running-window' });
    const waitingWindow = makeSplitWindow(WindowStatus.WaitingForInput, WindowStatus.WaitingForInput, { id: 'waiting-window' });
    const pausedWindow = makeWindow(WindowStatus.Paused, { id: 'paused-window' });
    const completedWindow = makeWindow(WindowStatus.Completed, { id: 'completed-window' });
    const pausedGroup = createGroup('Paused Group', pausedWindow.id, completedWindow.id);

    useWindowStore.setState({
      windows: [
        runningWindow,
        waitingWindow,
        pausedWindow,
        completedWindow,
      ],
      groups: [pausedGroup],
    });

    render(<StatusBar />);

    expect(screen.getByRole('button', { name: /运行中/ })).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: /等待输入/ })).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: /未启动/ })).toHaveTextContent('1');
  });

  it('ignores archived, ephemeral, and profile-backed ssh runtime windows', () => {
    const profile = makeSSHProfile();

    useWindowStore.setState({
      windows: [
        makeWindow(WindowStatus.Running),
        makeWindow(WindowStatus.WaitingForInput, { archived: true }),
        makeWindow(WindowStatus.Paused, {
          ephemeral: true,
          sshTabOwnerWindowId: 'owner-window',
        }),
        makeStandaloneSSHWindow(profile.id, WindowStatus.WaitingForInput),
      ],
    });

    render(<StatusBar sshEnabled={true} sshProfiles={[profile]} />);

    expect(screen.getByRole('button', { name: /运行中/ })).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: /等待输入/ })).toHaveTextContent('0');
    expect(screen.getByRole('button', { name: /未启动/ })).toHaveTextContent('0');
  });

  it('uses the current color classes for each visible status', () => {
    const { container } = render(<StatusBar />);

    expect(container.querySelector('[class~="text-[rgb(var(--appearance-running-accent-rgb))]"]')).not.toBeNull();
    expect(container.querySelector('[class~="text-[rgb(var(--primary))]"]')).not.toBeNull();
    expect(container.querySelector('[class~="text-[rgb(var(--muted-foreground))]"]')).not.toBeNull();
  });

  it('updates the aria label when store windows change', () => {
    const { container, rerender } = render(<StatusBar />);
    const liveRegion = container.querySelector('[aria-live="polite"]');

    expect(liveRegion?.getAttribute('aria-label')).toContain('运行中 0');

    act(() => {
      useWindowStore.setState({
        windows: [makeWindow(WindowStatus.Running)],
      });
    });

    rerender(<StatusBar />);

    expect(liveRegion?.getAttribute('aria-label')).toContain('运行中 1');
    expect(liveRegion?.getAttribute('aria-label')).toContain('等待输入 0');
    expect(liveRegion?.getAttribute('aria-label')).toContain('未启动 0');
  });
});
