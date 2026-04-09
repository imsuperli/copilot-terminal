import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWindowStore } from '../windowStore';
import { createSinglePaneWindow } from '../../utils/layoutHelpers';

describe('windowStore persisted pane updates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWindowStore.setState({
      windows: [],
      activeWindowId: null,
      mruList: [],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });
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

    const pane = useWindowStore.getState().getPaneById(terminalWindow.id, paneId);
    expect(pane?.cwd).toBe('D:\\repo\\next');
    expect(window.electronAPI.triggerAutoSave).toHaveBeenCalledTimes(1);
  });
});
