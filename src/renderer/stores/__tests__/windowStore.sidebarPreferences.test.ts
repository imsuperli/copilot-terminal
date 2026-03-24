import { beforeEach, describe, expect, it, vi } from 'vitest';

const TERMINAL_SIDEBAR_PREFERENCES_STORAGE_KEY = 'copilot-terminal:terminal-sidebar-preferences';

describe('windowStore terminal sidebar preferences', () => {
  beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
  });

  it('loads persisted terminal sidebar preferences from localStorage', async () => {
    window.localStorage.setItem(TERMINAL_SIDEBAR_PREFERENCES_STORAGE_KEY, JSON.stringify({
      filter: 'archived',
      sections: {
        archived: true,
        local: false,
        ssh: false,
      },
    }));

    const { useWindowStore } = await import('../windowStore');

    expect(useWindowStore.getState().terminalSidebarFilter).toBe('archived');
    expect(useWindowStore.getState().terminalSidebarSections).toEqual({
      archived: true,
      local: false,
      ssh: false,
    });
  });

  it('persists terminal sidebar preferences when they change', async () => {
    const { useWindowStore } = await import('../windowStore');

    useWindowStore.getState().setTerminalSidebarFilter('local');
    useWindowStore.getState().setTerminalSidebarSectionExpanded('ssh', false);
    useWindowStore.getState().setTerminalSidebarSectionExpanded('local', false);

    expect(JSON.parse(window.localStorage.getItem(TERMINAL_SIDEBAR_PREFERENCES_STORAGE_KEY) || '{}')).toEqual({
      filter: 'local',
      sections: {
        archived: false,
        local: false,
        ssh: false,
      },
    });
  });
});
