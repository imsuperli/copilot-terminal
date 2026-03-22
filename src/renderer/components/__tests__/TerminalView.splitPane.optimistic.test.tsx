import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TerminalView } from '../TerminalView';
import { useWindowStore } from '../../stores/windowStore';
import { Window, WindowStatus } from '../../types/window';

const { mockSplitLayout } = vi.hoisted(() => ({
  mockSplitLayout: vi.fn(),
}));

vi.mock('../Sidebar', () => ({
  Sidebar: () => null,
}));

vi.mock('../QuickSwitcher', () => ({
  QuickSwitcher: () => null,
}));

vi.mock('../SettingsPanel', () => ({
  SettingsPanel: () => null,
}));

vi.mock('../dnd', () => ({
  DropZone: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../ProjectLinks', () => ({
  ProjectLinks: () => null,
}));

vi.mock('../icons/IDEIcons', () => ({
  IDEIcon: () => null,
}));

vi.mock('../../hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: () => undefined,
}));

vi.mock('../../hooks/useIDESettings', () => ({
  useIDESettings: () => ({ enabledIDEs: [] }),
}));

vi.mock('../../i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    language: 'en-US',
    setLanguage: vi.fn(),
  }),
}));

vi.mock('../SplitLayout', async () => {
  const React = require('react');
  const { getAllPanes } = await vi.importActual<typeof import('../../utils/layoutHelpers')>('../../utils/layoutHelpers');

  return {
    SplitLayout: (props: { layout: Window['layout'] }) => {
      mockSplitLayout(props);
      const panes = getAllPanes(props.layout);

      return React.createElement(
        'div',
        { 'data-testid': 'split-layout-state' },
        panes.map((pane: { id: string; status: string; pid: number | null }) =>
          `${pane.id}:${pane.status}:${pane.pid ?? 'none'}`
        ).join('|')
      );
    },
  };
});

function createWindow(): Window {
  const paneId = 'pane-1';

  return {
    id: 'win-1',
    name: 'Test Window',
    activePaneId: paneId,
    createdAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
    layout: {
      type: 'pane',
      id: paneId,
      pane: {
        id: paneId,
        cwd: 'D:\\tmp',
        command: 'pwsh.exe',
        status: WindowStatus.Running,
        pid: 111,
      },
    },
  };
}

function StoreBackedTerminalView() {
  const win = useWindowStore((state) => state.windows[0]);
  if (!win) {
    return null;
  }

  return (
    <TerminalView
      window={win}
      onReturn={vi.fn()}
      onWindowSwitch={vi.fn()}
      isActive
    />
  );
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

describe('TerminalView split pane optimistic update', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWindowStore.setState({
      windows: [createWindow()],
      activeWindowId: 'win-1',
      mruList: [],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });
  });

  it('renders the new pane immediately while split IPC is still pending', async () => {
    const deferred = createDeferred<{ success: boolean; data: { pid: number } }>();
    vi.mocked(window.electronAPI.splitPane).mockReturnValueOnce(deferred.promise as Promise<any>);

    render(<StoreBackedTerminalView />);

    await userEvent.click(screen.getByRole('button', { name: 'terminalView.splitHorizontal' }));

    expect(screen.getByTestId('split-layout-state').textContent).toContain('pane-1:running:111');
    expect(screen.getByTestId('split-layout-state').textContent).toContain(':restoring:none');

    deferred.resolve({ success: true, data: { pid: 222 } });

    await waitFor(() => {
      expect(screen.getByTestId('split-layout-state').textContent).toContain(':running:222');
    });
  });

  it('rolls back the optimistic pane when split IPC fails', async () => {
    const deferred = createDeferred<never>();
    vi.mocked(window.electronAPI.splitPane).mockReturnValueOnce(deferred.promise as Promise<any>);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(<StoreBackedTerminalView />);

    await userEvent.click(screen.getByRole('button', { name: 'terminalView.splitVertical' }));
    expect(screen.getByTestId('split-layout-state').textContent).toContain(':restoring:none');

    deferred.reject(new Error('split failed'));

    await waitFor(() => {
      expect(screen.getByTestId('split-layout-state').textContent).toBe('pane-1:running:111');
    });

    consoleErrorSpy.mockRestore();
  });
});
