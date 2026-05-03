import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSinglePaneWindow } from '../../utils/layoutHelpers';
import { createGroup } from '../../utils/groupLayoutHelpers';
import { useWindowStore } from '../windowStore';

function addWindows(count: number) {
  const windows = Array.from({ length: count }, (_, index) => (
    createSinglePaneWindow(`Window ${index + 1}`, `/workspace/${index + 1}`, 'bash')
  ));

  windows.forEach((windowItem) => {
    useWindowStore.getState().addWindow(windowItem);
  });

  return windows;
}

describe('windowStore groups', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWindowStore.setState({
      windows: [],
      groups: [],
      activeWindowId: null,
      activeGroupId: null,
      groupMruList: [],
      mruList: [],
      canvasWorkspaces: [],
      customCategories: [],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds groups and keeps MRU order', () => {
    const [windowA, windowB, windowC] = addWindows(3);
    const groupOne = createGroup('Backend', windowA.id, windowB.id, 'horizontal');
    const groupTwo = createGroup('Ops', windowB.id, windowC.id, 'vertical');

    useWindowStore.getState().addGroup(groupOne);
    useWindowStore.getState().addGroup(groupTwo);

    expect(useWindowStore.getState().groups.map((group) => group.id)).toEqual([groupOne.id, groupTwo.id]);
    expect(useWindowStore.getState().groupMruList).toEqual([groupTwo.id, groupOne.id]);
  });

  it('removes groups and clears activeGroupId when deleting the active group', () => {
    const [windowA, windowB] = addWindows(2);
    const group = createGroup('Backend', windowA.id, windowB.id, 'horizontal');

    useWindowStore.getState().addGroup(group);
    useWindowStore.getState().setActiveGroup(group.id);
    useWindowStore.getState().removeGroup(group.id);

    expect(useWindowStore.getState().groups).toEqual([]);
    expect(useWindowStore.getState().activeGroupId).toBeNull();
  });

  it('updates group metadata and tracks active group MRU', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-03T00:00:00.000Z'));

    const [windowA, windowB] = addWindows(2);
    const group = createGroup('Backend', windowA.id, windowB.id, 'horizontal');

    useWindowStore.getState().addGroup(group);
    const previousLastActiveAt = useWindowStore.getState().getGroupById(group.id)?.lastActiveAt;

    vi.setSystemTime(new Date('2026-05-03T00:00:01.000Z'));
    useWindowStore.getState().updateGroup(group.id, { name: 'Backend Team' });
    vi.setSystemTime(new Date('2026-05-03T00:00:02.000Z'));
    useWindowStore.getState().setActiveGroup(group.id);

    const updatedGroup = useWindowStore.getState().getGroupById(group.id);
    expect(updatedGroup?.name).toBe('Backend Team');
    expect(updatedGroup?.lastActiveAt).not.toBe(previousLastActiveAt);
    expect(useWindowStore.getState().activeGroupId).toBe(group.id);
    expect(useWindowStore.getState().groupMruList[0]).toBe(group.id);
  });

  it('adds and removes windows from group layouts, dissolving groups that fall below two windows', () => {
    const [windowA, windowB, windowC] = addWindows(3);
    const group = createGroup('Backend', windowA.id, windowB.id, 'horizontal');
    useWindowStore.getState().addGroup(group);

    useWindowStore.getState().addWindowToGroupLayout(group.id, windowB.id, windowC.id, 'vertical');
    expect(useWindowStore.getState().getWindowsInGroup(group.id).map((windowItem) => windowItem.id)).toEqual([
      windowA.id,
      windowB.id,
      windowC.id,
    ]);

    useWindowStore.getState().removeWindowFromGroupLayout(group.id, windowA.id);
    expect(useWindowStore.getState().getWindowsInGroup(group.id).map((windowItem) => windowItem.id)).toEqual([
      windowB.id,
      windowC.id,
    ]);

    useWindowStore.getState().removeWindowFromGroupLayout(group.id, windowB.id);
    expect(useWindowStore.getState().getGroupById(group.id)).toBeUndefined();
    expect(useWindowStore.getState().getWindowById(windowC.id)).toBeDefined();
  });

  it('finds a group by member window id and returns windows in layout order', () => {
    const [windowA, windowB, windowC] = addWindows(3);
    const group = createGroup('Backend', windowA.id, windowB.id, 'horizontal');
    useWindowStore.getState().addGroup(group);
    useWindowStore.getState().addWindowToGroupLayout(group.id, windowB.id, windowC.id, 'vertical');

    expect(useWindowStore.getState().findGroupByWindowId(windowC.id)?.id).toBe(group.id);
    expect(useWindowStore.getState().getWindowsInGroup(group.id).map((windowItem) => windowItem.id)).toEqual([
      windowA.id,
      windowB.id,
      windowC.id,
    ]);
  });

  it('archives groups and their windows, and unarchives them together', () => {
    const [windowA, windowB] = addWindows(2);
    const group = createGroup('Backend', windowA.id, windowB.id, 'horizontal');
    useWindowStore.getState().addGroup(group);
    useWindowStore.getState().setActiveGroup(group.id);

    useWindowStore.getState().archiveGroup(group.id);

    expect(useWindowStore.getState().getGroupById(group.id)?.archived).toBe(true);
    expect(useWindowStore.getState().getWindowById(windowA.id)?.archived).toBe(true);
    expect(useWindowStore.getState().getWindowById(windowB.id)?.archived).toBe(true);
    expect(useWindowStore.getState().activeGroupId).toBeNull();

    useWindowStore.getState().unarchiveGroup(group.id);
    expect(useWindowStore.getState().getGroupById(group.id)?.archived).toBe(false);
    expect(useWindowStore.getState().getWindowById(windowA.id)?.archived).toBe(false);
    expect(useWindowStore.getState().getWindowById(windowB.id)?.archived).toBe(false);
  });

  it('removes grouped windows from the layout when deleting a window record', () => {
    const [windowA, windowB, windowC] = addWindows(3);
    const group = createGroup('Backend', windowA.id, windowB.id, 'horizontal');
    useWindowStore.getState().addGroup(group);
    useWindowStore.getState().addWindowToGroupLayout(group.id, windowB.id, windowC.id, 'vertical');

    useWindowStore.getState().removeWindow(windowA.id);
    expect(useWindowStore.getState().getWindowsInGroup(group.id).map((windowItem) => windowItem.id)).toEqual([
      windowB.id,
      windowC.id,
    ]);

    useWindowStore.getState().removeWindow(windowB.id);
    expect(useWindowStore.getState().getGroupById(group.id)).toBeUndefined();
    expect(useWindowStore.getState().getWindowById(windowC.id)).toBeDefined();
  });
});
