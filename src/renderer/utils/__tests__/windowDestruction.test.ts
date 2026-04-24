import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWindowStore } from '../../stores/windowStore';
import { Window, WindowStatus } from '../../types/window';
import { destroyWindowResourcesKeepRecord } from '../windowDestruction';

function createRunningWindow(): Window {
  return {
    id: 'win-1',
    name: 'Window 1',
    activePaneId: 'pane-1',
    createdAt: '2026-04-23T00:00:00.000Z',
    lastActiveAt: '2026-04-23T00:00:00.000Z',
    layout: {
      type: 'pane',
      id: 'pane-1',
      pane: {
        id: 'pane-1',
        cwd: '/workspace',
        command: 'bash',
        status: WindowStatus.Running,
        pid: 1234,
        sessionId: 'session-1234',
        backend: 'local',
      },
    },
  };
}

describe('destroyWindowResourcesKeepRecord', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWindowStore.setState({
      windows: [],
      groups: [],
      customCategories: [],
      activeWindowId: null,
      activeGroupId: null,
      groupMruList: [],
    });
  });

  it('destroys main-process resources but keeps the renderer window record', async () => {
    const terminalWindow = createRunningWindow();
    useWindowStore.setState({ windows: [terminalWindow] });

    await destroyWindowResourcesKeepRecord(terminalWindow.id);

    expect(window.electronAPI.closeWindow).toHaveBeenCalledWith(terminalWindow.id);
    expect(window.electronAPI.deleteWindow).toHaveBeenCalledWith(terminalWindow.id);

    const storedWindow = useWindowStore.getState().windows.find((window) => window.id === terminalWindow.id);
    expect(storedWindow).toBeDefined();
    expect(storedWindow?.layout.type).toBe('pane');
    if (storedWindow?.layout.type === 'pane') {
      expect(storedWindow.layout.pane.status).toBe(WindowStatus.Completed);
      expect(storedWindow.layout.pane.pid).toBeNull();
      expect(storedWindow.layout.pane.sessionId).toBeUndefined();
    }
  });
});
