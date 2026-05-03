import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GroupManagerImpl } from '../GroupManager';
import { WindowGroup } from '../../../shared/types/window-group';

function createGroupFixture(overrides: Partial<WindowGroup> = {}): WindowGroup {
  return {
    id: 'group-1',
    name: 'Backend',
    layout: {
      type: 'split',
      direction: 'horizontal',
      sizes: [0.5, 0.5],
      children: [
        { type: 'window', id: 'window-1' },
        { type: 'window', id: 'window-2' },
      ],
    },
    activeWindowId: 'window-1',
    createdAt: '2026-05-03T00:00:00.000Z',
    lastActiveAt: '2026-05-03T00:00:00.000Z',
    ...overrides,
  };
}

function expectSizesToBeClose(actual: number[], expected: number[]) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((size, index) => {
    expect(size).toBeCloseTo(expected[index]!, 12);
  });
}

describe('GroupManager', () => {
  let manager: GroupManagerImpl;

  beforeEach(() => {
    vi.restoreAllMocks();
    manager = new GroupManagerImpl();
  });

  describe('createGroup', () => {
    it('creates a group with a horizontal split layout and the first window active', () => {
      const group = manager.createGroup('Ops', ['window-1', 'window-2']);

      expect(group.name).toBe('Ops');
      expect(group.activeWindowId).toBe('window-1');
      expect(group.layout).toEqual({
        type: 'split',
        direction: 'horizontal',
        sizes: [0.5, 0.5],
        children: [
          { type: 'window', id: 'window-1' },
          { type: 'window', id: 'window-2' },
        ],
      });
      expect(group.id).toBeTruthy();
    });

    it('rejects creating a group with fewer than two windows', () => {
      expect(() => manager.createGroup('Ops', ['window-1'])).toThrow('窗口组至少需要 2 个窗口');
    });

    it('generates unique ids for each new group', () => {
      const firstGroup = manager.createGroup('Ops', ['window-1', 'window-2']);
      const secondGroup = manager.createGroup('Ops', ['window-1', 'window-2']);

      expect(firstGroup.id).not.toBe(secondGroup.id);
    });
  });

  describe('group metadata operations', () => {
    it('deletes an existing group and leaves others untouched', () => {
      const groups = [
        createGroupFixture(),
        createGroupFixture({ id: 'group-2', name: 'Frontend' }),
      ];

      expect(manager.deleteGroup('group-1', groups)).toEqual([groups[1]]);
    });

    it('archives and unarchives a group', () => {
      const groups = [createGroupFixture()];

      const archived = manager.archiveGroup('group-1', groups);
      expect(archived[0]?.archived).toBe(true);

      const restored = manager.unarchiveGroup('group-1', archived);
      expect(restored[0]?.archived).toBe(false);
    });

    it('renames a group', () => {
      const renamed = manager.renameGroup('group-1', 'Platform', [createGroupFixture()]);
      expect(renamed[0]?.name).toBe('Platform');
    });
  });

  describe('addWindowToGroup', () => {
    it('appends a window to the root split when direction matches and no target is provided', () => {
      const group = createGroupFixture();
      const updated = manager.addWindowToGroup(group.id, 'window-3', 'horizontal', null, [group]);
      const layout = updated[0]?.layout;

      expect(layout).toMatchObject({
        type: 'split',
        direction: 'horizontal',
        children: [
          { type: 'window', id: 'window-1' },
          { type: 'window', id: 'window-2' },
          { type: 'window', id: 'window-3' },
        ],
      });
      expect(layout?.type).toBe('split');
      if (layout?.type === 'split') {
        expectSizesToBeClose(layout.sizes, [1 / 3, 1 / 3, 1 / 3]);
      }
    });

    it('wraps the root when appending with a different direction', () => {
      const group = createGroupFixture();
      const updated = manager.addWindowToGroup(group.id, 'window-3', 'vertical', null, [group]);

      expect(updated[0]?.layout).toEqual({
        type: 'split',
        direction: 'vertical',
        sizes: [0.5, 0.5],
        children: [
          group.layout,
          { type: 'window', id: 'window-3' },
        ],
      });
    });

    it('inserts a window next to the target when the target is a direct child of a matching split', () => {
      const group = createGroupFixture();
      const updated = manager.addWindowToGroup(group.id, 'window-3', 'horizontal', 'window-1', [group]);
      const layout = updated[0]?.layout;

      expect(layout).toMatchObject({
        type: 'split',
        direction: 'horizontal',
        children: [
          { type: 'window', id: 'window-1' },
          { type: 'window', id: 'window-3' },
          { type: 'window', id: 'window-2' },
        ],
      });
      expect(layout?.type).toBe('split');
      if (layout?.type === 'split') {
        expectSizesToBeClose(layout.sizes, [1 / 3, 1 / 3, 1 / 3]);
      }
    });

    it('recursively inserts around a nested target window', () => {
      const group = createGroupFixture({
        layout: {
          type: 'split',
          direction: 'vertical',
          sizes: [0.5, 0.5],
          children: [
            { type: 'window', id: 'window-1' },
            {
              type: 'split',
              direction: 'horizontal',
              sizes: [0.5, 0.5],
              children: [
                { type: 'window', id: 'window-2' },
                { type: 'window', id: 'window-4' },
              ],
            },
          ],
        },
      });

      const updated = manager.addWindowToGroup(group.id, 'window-3', 'horizontal', 'window-2', [group]);
      const nestedSplit = (updated[0]?.layout.type === 'split'
        ? updated[0].layout.children[1]
        : null);

      expect(nestedSplit).toMatchObject({
        type: 'split',
        direction: 'horizontal',
        children: [
          { type: 'window', id: 'window-2' },
          { type: 'window', id: 'window-3' },
          { type: 'window', id: 'window-4' },
        ],
      });
      expect(nestedSplit?.type).toBe('split');
      if (nestedSplit?.type === 'split') {
        expectSizesToBeClose(nestedSplit.sizes, [1 / 3, 1 / 3, 1 / 3]);
      }
    });
  });

  describe('removeWindowFromGroup', () => {
    it('removes a window and keeps the group when at least two windows remain', () => {
      const group = createGroupFixture({
        layout: {
          type: 'split',
          direction: 'horizontal',
          sizes: [0.2, 0.3, 0.5],
          children: [
            { type: 'window', id: 'window-1' },
            { type: 'window', id: 'window-2' },
            { type: 'window', id: 'window-3' },
          ],
        },
        activeWindowId: 'window-1',
      });

      const result = manager.removeWindowFromGroup(group.id, 'window-1', [group]);

      expect(result.dissolved).toBe(false);
      expect(result.groups).toHaveLength(1);
      expect(result.groups[0]?.activeWindowId).toBe('window-2');
      expect(result.groups[0]?.layout).toMatchObject({
        type: 'split',
        direction: 'horizontal',
        children: [
          { type: 'window', id: 'window-2' },
          { type: 'window', id: 'window-3' },
        ],
      });
      expect(result.groups[0]?.layout.type).toBe('split');
      if (result.groups[0]?.layout.type === 'split') {
        expectSizesToBeClose(result.groups[0].layout.sizes, [0.375, 0.625]);
      }
    });

    it('dissolves the group when fewer than two windows remain', () => {
      const result = manager.removeWindowFromGroup('group-1', 'window-1', [createGroupFixture()]);

      expect(result.dissolved).toBe(true);
      expect(result.groups).toEqual([]);
    });

    it('returns the original groups when the target group does not exist', () => {
      const groups = [createGroupFixture()];
      const result = manager.removeWindowFromGroup('missing-group', 'window-1', groups);

      expect(result.dissolved).toBe(false);
      expect(result.groups).toEqual(groups);
    });
  });

  describe('updateGroupSplitSizes', () => {
    it('updates root split sizes for the matching group', () => {
      const group = createGroupFixture();
      const updated = manager.updateGroupSplitSizes(group.id, [], [0.25, 0.75], [group]);

      expect(updated[0]?.layout).toEqual({
        type: 'split',
        direction: 'horizontal',
        sizes: [0.25, 0.75],
        children: [
          { type: 'window', id: 'window-1' },
          { type: 'window', id: 'window-2' },
        ],
      });
    });

    it('updates nested split sizes along the provided path', () => {
      const group = createGroupFixture({
        layout: {
          type: 'split',
          direction: 'vertical',
          sizes: [0.4, 0.6],
          children: [
            { type: 'window', id: 'window-1' },
            {
              type: 'split',
              direction: 'horizontal',
              sizes: [0.5, 0.5],
              children: [
                { type: 'window', id: 'window-2' },
                { type: 'window', id: 'window-3' },
              ],
            },
          ],
        },
      });

      const updated = manager.updateGroupSplitSizes(group.id, [1], [0.2, 0.8], [group]);
      const nestedSplit = updated[0]?.layout.type === 'split'
        ? updated[0].layout.children[1]
        : null;

      expect(nestedSplit).toEqual({
        type: 'split',
        direction: 'horizontal',
        sizes: [0.2, 0.8],
        children: [
          { type: 'window', id: 'window-2' },
          { type: 'window', id: 'window-3' },
        ],
      });
    });
  });
});
