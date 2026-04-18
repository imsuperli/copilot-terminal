import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWindowStore, WindowStatus } from '../windowStore';
import { createSinglePaneWindow } from '../../utils/layoutHelpers';

describe('windowStore active pane sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWindowStore.setState({ windows: [], activeWindowId: null, mruList: [] });
  });

  it('syncs active pane changes to the main process', () => {
    const terminalWindow = createSinglePaneWindow('Test', 'D:\\repo', 'pwsh.exe');
    const originalPaneId = terminalWindow.activePaneId;
    const teammatePaneId = 'pane-teammate';

    terminalWindow.layout = {
      type: 'split',
      direction: 'horizontal',
      sizes: [0.5, 0.5],
      children: [
        terminalWindow.layout,
        {
          type: 'pane',
          id: teammatePaneId,
          pane: {
            id: teammatePaneId,
            cwd: 'D:\\repo',
            command: 'pwsh.exe',
            status: WindowStatus.Paused,
            pid: null,
          },
        },
      ],
    };

    useWindowStore.setState({
      windows: [terminalWindow],
      activeWindowId: terminalWindow.id,
      mruList: [terminalWindow.id],
    });

    useWindowStore.getState().setActivePane(terminalWindow.id, teammatePaneId);

    expect(useWindowStore.getState().windows[0].activePaneId).toBe(teammatePaneId);
    expect(useWindowStore.getState().windows[0].activePaneId).not.toBe(originalPaneId);
    expect(window.electronAPI.setActivePane).toHaveBeenCalledWith(terminalWindow.id, teammatePaneId);
  });

  it('does not sync when the requested pane is already active', () => {
    const terminalWindow = createSinglePaneWindow('Noop', 'D:\\repo', 'pwsh.exe');

    useWindowStore.setState({
      windows: [terminalWindow],
      activeWindowId: terminalWindow.id,
      mruList: [terminalWindow.id],
    });

    useWindowStore.getState().setActivePane(terminalWindow.id, terminalWindow.activePaneId);

    expect(window.electronAPI.setActivePane).not.toHaveBeenCalled();
  });
});
