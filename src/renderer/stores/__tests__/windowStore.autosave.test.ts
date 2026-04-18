import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __flushWindowStoreAutoSaveForTests,
  __resetWindowStoreAutoSaveStateForTests,
  useWindowStore,
  WindowStatus,
} from '../windowStore';
import { createSinglePaneWindow, getAllPanes } from '../../utils/layoutHelpers';

describe('windowStore auto-save gating', () => {
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
    vi.useRealTimers();
  });

  it('does not auto-save when switching the active pane', () => {
    const terminalWindow = createSinglePaneWindow('Team Lead', 'D:\\repo', 'pwsh.exe');
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
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    useWindowStore.getState().setActivePane(terminalWindow.id, teammatePaneId);

    expect(useWindowStore.getState().windows[0].activePaneId).toBe(teammatePaneId);
    expect(useWindowStore.getState().windows[0].activePaneId).not.toBe(originalPaneId);
    expect(window.electronAPI.setActivePane).toHaveBeenCalledWith(terminalWindow.id, teammatePaneId);
    expect(window.electronAPI.triggerAutoSave).not.toHaveBeenCalled();
  });

  it('does not auto-save when switching the active window', () => {
    const windowOne = createSinglePaneWindow('One', 'D:\\repo-one', 'pwsh.exe');
    const windowTwo = createSinglePaneWindow('Two', 'D:\\repo-two', 'pwsh.exe');

    useWindowStore.setState({
      windows: [windowOne, windowTwo],
      activeWindowId: windowOne.id,
      mruList: [windowOne.id, windowTwo.id],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    useWindowStore.getState().setActiveWindow(windowTwo.id);

    expect(useWindowStore.getState().activeWindowId).toBe(windowTwo.id);
    expect(useWindowStore.getState().mruList[0]).toBe(windowTwo.id);
    expect(window.electronAPI.triggerAutoSave).not.toHaveBeenCalled();
  });

  it('does not auto-save runtime-only pane updates', () => {
    const terminalWindow = createSinglePaneWindow('Pane Runtime', 'D:\\repo', 'pwsh.exe');
    const paneId = terminalWindow.activePaneId;

    useWindowStore.setState({
      windows: [terminalWindow],
      activeWindowId: terminalWindow.id,
      mruList: [terminalWindow.id],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    useWindowStore.getState().updatePane(terminalWindow.id, paneId, {
      status: WindowStatus.Running,
      pid: 4321,
      title: 'team-lead',
    });

    const pane = useWindowStore.getState().getPaneById(terminalWindow.id, paneId);
    expect(pane).toMatchObject({
      status: WindowStatus.Running,
      pid: 4321,
      title: 'team-lead',
    });
    expect(window.electronAPI.triggerAutoSave).not.toHaveBeenCalled();
  });

  it('does not auto-save when updating claude runtime fields', () => {
    const terminalWindow = createSinglePaneWindow('Claude', 'D:\\repo', 'pwsh.exe');

    useWindowStore.setState({
      windows: [terminalWindow],
      activeWindowId: terminalWindow.id,
      mruList: [terminalWindow.id],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    useWindowStore.getState().updateClaudeModel(
      terminalWindow.id,
      'Claude Opus 4',
      'claude-opus-4',
      82,
      1.23,
    );

    const storedWindow = useWindowStore.getState().windows[0] as typeof terminalWindow & {
      claudeModel?: string;
      claudeModelId?: string;
      claudeContextPercentage?: number;
      claudeCost?: number;
    };

    expect(storedWindow.claudeModel).toBe('Claude Opus 4');
    expect(storedWindow.claudeModelId).toBe('claude-opus-4');
    expect(storedWindow.claudeContextPercentage).toBe(82);
    expect(storedWindow.claudeCost).toBe(1.23);
    expect(window.electronAPI.triggerAutoSave).not.toHaveBeenCalled();
  });

  it('does not auto-save runtime-only window metadata updates', () => {
    const terminalWindow = createSinglePaneWindow('Metadata', 'D:\\repo', 'pwsh.exe');

    useWindowStore.setState({
      windows: [terminalWindow],
      activeWindowId: terminalWindow.id,
      mruList: [terminalWindow.id],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    const originalLastActiveAt = terminalWindow.lastActiveAt;

    useWindowStore.getState().updateWindowRuntime(terminalWindow.id, {
      gitBranch: 'main',
      projectConfig: {
        version: '1.0',
        links: [{ name: 'Repo', url: 'https://example.com/repo' }],
      },
    });

    const storedWindow = useWindowStore.getState().windows[0];
    expect(storedWindow.gitBranch).toBe('main');
    expect(storedWindow.projectConfig).toEqual({
      version: '1.0',
      links: [{ name: 'Repo', url: 'https://example.com/repo' }],
    });
    expect(storedWindow.lastActiveAt).toBe(originalLastActiveAt);
    expect(window.electronAPI.triggerAutoSave).not.toHaveBeenCalled();
  });

  it('excludes ephemeral ssh clone tabs from auto-save payloads', () => {
    const ownerWindow = createSinglePaneWindow('Owner', 'D:\\repo-owner', 'pwsh.exe');
    const cloneWindow = {
      ...createSinglePaneWindow('Clone', 'D:\\repo-clone', 'pwsh.exe'),
      ephemeral: true,
      sshTabOwnerWindowId: ownerWindow.id,
    };

    useWindowStore.setState({
      windows: [ownerWindow, cloneWindow],
      activeWindowId: ownerWindow.id,
      mruList: [ownerWindow.id, cloneWindow.id],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    useWindowStore.getState().updateWindow(ownerWindow.id, {
      name: 'Owner Updated',
    });
    __flushWindowStoreAutoSaveForTests();

    expect(window.electronAPI.triggerAutoSave).toHaveBeenCalledTimes(1);
    expect(window.electronAPI.triggerAutoSave).toHaveBeenLastCalledWith(
      [
        expect.objectContaining({
          id: ownerWindow.id,
          name: 'Owner Updated',
        }),
      ],
      expect.anything(),
    );
  });

  it('collapses tmux agent panes and auto-saves the new single-pane layout on pause', () => {
    const terminalWindow = createSinglePaneWindow('Agent Team', 'D:\\repo', 'pwsh.exe');
    const leaderPaneId = terminalWindow.activePaneId;

    terminalWindow.layout = {
      type: 'split',
      direction: 'horizontal',
      sizes: [0.35, 0.65],
      children: [
        {
          type: 'pane',
          id: leaderPaneId,
          pane: {
            id: leaderPaneId,
            cwd: 'D:\\repo',
            command: 'pwsh.exe',
            status: WindowStatus.Running,
            pid: 111,
            title: 'leader',
            borderColor: '#0087ff',
          },
        },
        {
          type: 'split',
          direction: 'vertical',
          sizes: [0.5, 0.5],
          children: [
            {
              type: 'pane',
              id: 'agent-a',
              pane: {
                id: 'agent-a',
                cwd: 'D:\\repo',
                command: 'pwsh.exe',
                status: WindowStatus.Running,
                pid: 222,
                title: 'agent-a',
                teamName: 'team-1',
                agentName: 'agent-a',
                agentColor: 'green',
                borderColor: '#00ff00',
              },
            },
            {
              type: 'pane',
              id: 'agent-b',
              pane: {
                id: 'agent-b',
                cwd: 'D:\\repo',
                command: 'pwsh.exe',
                status: WindowStatus.WaitingForInput,
                pid: 333,
                title: 'agent-b',
                teamName: 'team-1',
                agentName: 'agent-b',
                agentColor: 'blue',
                borderColor: '#0000ff',
              },
            },
          ],
        },
      ],
    };
    terminalWindow.activePaneId = 'agent-a';

    useWindowStore.setState({
      windows: [terminalWindow],
      activeWindowId: terminalWindow.id,
      mruList: [terminalWindow.id],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    useWindowStore.getState().pauseWindowState(terminalWindow.id);
    __flushWindowStoreAutoSaveForTests();

    const storedWindow = useWindowStore.getState().windows[0];
    expect(storedWindow.activePaneId).toBe(leaderPaneId);
    expect(storedWindow.layout).toMatchObject({
      type: 'pane',
      id: leaderPaneId,
      pane: {
        id: leaderPaneId,
        status: WindowStatus.Paused,
        pid: null,
      },
    });

    if (storedWindow.layout.type !== 'pane') {
      throw new Error('expected single pane layout');
    }

    expect(storedWindow.layout.pane.title).toBeUndefined();
    expect(storedWindow.layout.pane.borderColor).toBeUndefined();
    expect(window.electronAPI.triggerAutoSave).toHaveBeenCalledTimes(1);
  });

  it('keeps manual split layouts intact when pausing a non-tmux multi-pane window', () => {
    const terminalWindow = createSinglePaneWindow('Manual Split', 'D:\\repo', 'pwsh.exe');
    const leaderPaneId = terminalWindow.activePaneId;
    const teammatePaneId = 'pane-teammate';

    terminalWindow.layout = {
      type: 'split',
      direction: 'horizontal',
      sizes: [0.5, 0.5],
      children: [
        {
          type: 'pane',
          id: leaderPaneId,
          pane: {
            id: leaderPaneId,
            cwd: 'D:\\repo',
            command: 'pwsh.exe',
            status: WindowStatus.Running,
            pid: 444,
          },
        },
        {
          type: 'pane',
          id: teammatePaneId,
          pane: {
            id: teammatePaneId,
            cwd: 'D:\\repo',
            command: 'pwsh.exe',
            status: WindowStatus.WaitingForInput,
            pid: 555,
          },
        },
      ],
    };
    terminalWindow.activePaneId = teammatePaneId;

    useWindowStore.setState({
      windows: [terminalWindow],
      activeWindowId: terminalWindow.id,
      mruList: [terminalWindow.id],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    useWindowStore.getState().pauseWindowState(terminalWindow.id);

    const storedWindow = useWindowStore.getState().windows[0];
    expect(storedWindow.layout.type).toBe('split');
    expect(storedWindow.activePaneId).toBe(teammatePaneId);
    expect(getAllPanes(storedWindow.layout)).toHaveLength(2);
    expect(getAllPanes(storedWindow.layout)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: leaderPaneId, status: WindowStatus.Paused, pid: null }),
        expect.objectContaining({ id: teammatePaneId, status: WindowStatus.Paused, pid: null }),
      ]),
    );
    expect(window.electronAPI.triggerAutoSave).not.toHaveBeenCalled();
  });

  it('coalesces repeated persisted updates into a single auto-save payload', () => {
    vi.useFakeTimers();
    const terminalWindow = createSinglePaneWindow('Coalesce', 'D:\\repo', 'pwsh.exe');

    useWindowStore.setState({
      windows: [terminalWindow],
      activeWindowId: terminalWindow.id,
      mruList: [terminalWindow.id],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    useWindowStore.getState().updateWindow(terminalWindow.id, {
      name: 'Coalesce 1',
    });
    useWindowStore.getState().updateWindow(terminalWindow.id, {
      name: 'Coalesce 2',
    });

    expect(window.electronAPI.triggerAutoSave).not.toHaveBeenCalled();

    vi.advanceTimersByTime(80);

    expect(window.electronAPI.triggerAutoSave).toHaveBeenCalledTimes(1);
    expect(window.electronAPI.triggerAutoSave).toHaveBeenLastCalledWith(
      [
        expect.objectContaining({
          id: terminalWindow.id,
          name: 'Coalesce 2',
        }),
      ],
      [],
    );
  });

  it('skips sending auto-save when the persisted snapshot is unchanged', () => {
    vi.useFakeTimers();
    const terminalWindow = createSinglePaneWindow('Noop', 'D:\\repo', 'pwsh.exe');

    useWindowStore.setState({
      windows: [terminalWindow],
      activeWindowId: terminalWindow.id,
      mruList: [terminalWindow.id],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    useWindowStore.getState().updateWindow(terminalWindow.id, {
      name: 'Noop Updated',
    });
    vi.advanceTimersByTime(80);
    expect(window.electronAPI.triggerAutoSave).toHaveBeenCalledTimes(1);

    useWindowStore.getState().updateWindow(terminalWindow.id, {
      name: 'Noop Updated',
    });
    vi.advanceTimersByTime(80);

    expect(window.electronAPI.triggerAutoSave).toHaveBeenCalledTimes(1);
  });

  it('does not auto-save when updating a window with unchanged persisted fields', () => {
    const terminalWindow = createSinglePaneWindow('Stable', 'D:\\repo', 'pwsh.exe');

    useWindowStore.setState({
      windows: [terminalWindow],
      activeWindowId: terminalWindow.id,
      mruList: [terminalWindow.id],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    useWindowStore.getState().updateWindow(terminalWindow.id, {
      name: terminalWindow.name,
    });

    expect(window.electronAPI.triggerAutoSave).not.toHaveBeenCalled();
  });
});
