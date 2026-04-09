import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { StatusBar } from '../StatusBar';
import { useWindowStore } from '../../stores/windowStore';
import { createSinglePaneWindow } from '../../utils/layoutHelpers';
import { Window, WindowStatus } from '../../types/window';

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

describe('StatusBar', () => {
  beforeEach(() => {
    useWindowStore.setState({
      windows: [],
      activeWindowId: null,
    });
  });

  it('shows zero counts when no windows exist', () => {
    render(<StatusBar />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);
    expect(screen.getAllByText('0')).toHaveLength(3);
  });

  it('counts running, waiting, and paused panes from visible windows', () => {
    useWindowStore.setState({
      windows: [
        makeWindow(WindowStatus.Running),
        makeWindow(WindowStatus.WaitingForInput),
        makeWindow(WindowStatus.WaitingForInput),
        makeWindow(WindowStatus.Paused),
      ],
    });

    render(<StatusBar />);

    expect(screen.getByRole('button', { name: /运行中/ })).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: /等待输入/ })).toHaveTextContent('2');
    expect(screen.getByRole('button', { name: /已暂停/ })).toHaveTextContent('1');
  });

  it('ignores archived and ephemeral windows when counting panes', () => {
    useWindowStore.setState({
      windows: [
        makeWindow(WindowStatus.Running),
        makeWindow(WindowStatus.WaitingForInput, { archived: true }),
        makeWindow(WindowStatus.Paused, {
          ephemeral: true,
          sshTabOwnerWindowId: 'owner-window',
        }),
      ],
    });

    render(<StatusBar />);

    expect(screen.getByRole('button', { name: /运行中/ })).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: /等待输入/ })).toHaveTextContent('0');
    expect(screen.getByRole('button', { name: /已暂停/ })).toHaveTextContent('0');
  });

  it('uses the current color classes for each visible status', () => {
    const { container } = render(<StatusBar />);

    expect(container.querySelectorAll('.text-green-500').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.text-blue-500').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.text-gray-500').length).toBeGreaterThan(0);
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
    expect(liveRegion?.getAttribute('aria-label')).toContain('暂停 0');
  });
});
