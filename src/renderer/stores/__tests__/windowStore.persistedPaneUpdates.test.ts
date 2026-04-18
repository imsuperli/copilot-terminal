import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __flushWindowStoreAutoSaveForTests,
  __resetWindowStoreAutoSaveStateForTests,
  useWindowStore,
} from '../windowStore';
import { createSinglePaneWindow } from '../../utils/layoutHelpers';

describe('windowStore persisted pane updates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetWindowStoreAutoSaveStateForTests();
    useWindowStore.setState({
      windows: [],
      activeWindowId: null,
      mruList: [],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });
  });

  afterEach(() => {
    __resetWindowStoreAutoSaveStateForTests();
  });

  it('auto-saves persisted pane cwd changes', () => {
    const terminalWindow = createSinglePaneWindow('Pane Cwd', 'D:\\repo', 'pwsh.exe');
    const paneId = terminalWindow.activePaneId;

    useWindowStore.setState({
      windows: [terminalWindow],
      activeWindowId: terminalWindow.id,
      mruList: [terminalWindow.id],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    useWindowStore.getState().updatePane(terminalWindow.id, paneId, {
      cwd: 'D:\\repo\\next',
    });
    __flushWindowStoreAutoSaveForTests();

    const pane = useWindowStore.getState().getPaneById(terminalWindow.id, paneId);
    expect(pane?.cwd).toBe('D:\\repo\\next');
    expect(window.electronAPI.triggerAutoSave).toHaveBeenCalledTimes(1);
  });

  it('does not auto-save runtime-only ssh cwd changes', () => {
    const terminalWindow = createSinglePaneWindow('SSH Pane Cwd', '/srv/app', '');
    const paneId = terminalWindow.activePaneId;

    if (terminalWindow.layout.type !== 'pane') {
      throw new Error('Expected single pane layout');
    }

    terminalWindow.layout.pane.backend = 'ssh';
    terminalWindow.layout.pane.ssh = {
      profileId: 'profile-1',
      remoteCwd: '/srv/app',
    };

    useWindowStore.setState({
      windows: [terminalWindow],
      activeWindowId: terminalWindow.id,
      mruList: [terminalWindow.id],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    useWindowStore.getState().updatePaneRuntime(terminalWindow.id, paneId, {
      cwd: '/srv/app/releases',
    });

    const pane = useWindowStore.getState().getPaneById(terminalWindow.id, paneId);
    expect(pane?.cwd).toBe('/srv/app/releases');
    expect(window.electronAPI.triggerAutoSave).not.toHaveBeenCalled();
  });
});
