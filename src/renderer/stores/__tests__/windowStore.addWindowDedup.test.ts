import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWindowStore } from '../windowStore';
import { createSinglePaneWindow } from '../../utils/layoutHelpers';

describe('windowStore addWindow deduplication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWindowStore.setState({
      windows: [],
      groups: [],
      activeWindowId: null,
      activeGroupId: null,
      mruList: [],
      groupMruList: [],
      sidebarExpanded: false,
      sidebarWidth: 200,
      terminalSidebarSections: {
        archived: false,
        local: true,
        ssh: true,
      },
      terminalSidebarFilter: 'all',
      customCategories: [],
    });
  });

  it('replaces an existing window when addWindow receives the same id again', () => {
    const originalWindow = createSinglePaneWindow('Original Window', 'D:\\repo', 'pwsh.exe');
    const updatedWindow = {
      ...originalWindow,
      name: 'Updated Window',
      lastActiveAt: '2026-04-11T10:20:00.000Z',
    };

    useWindowStore.getState().addWindow(originalWindow);
    useWindowStore.getState().addWindow(updatedWindow);

    const state = useWindowStore.getState();
    expect(state.windows).toHaveLength(1);
    expect(state.windows[0].id).toBe(originalWindow.id);
    expect(state.windows[0].name).toBe('Updated Window');
    expect(state.mruList).toEqual([originalWindow.id]);
  });
});
