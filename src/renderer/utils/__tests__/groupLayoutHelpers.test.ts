import { describe, expect, it } from 'vitest';
import type { GroupLayoutNode } from '../../../shared/types/window-group';
import {
  addWindowToGroup,
  containsWindow,
  createGroup,
  findWindowNode,
  getAllWindowIds,
  getGroupLayoutDepth,
  getWindowCount,
  removeWindowFromGroup,
  replaceWindowId,
  updateGroupSplitSizes,
} from '../groupLayoutHelpers';

const nestedLayout: GroupLayoutNode = {
  type: 'split',
  direction: 'horizontal',
  sizes: [0.5, 0.5],
  children: [
    { type: 'window', id: 'window-1' },
    {
      type: 'split',
      direction: 'vertical',
      sizes: [0.3, 0.7],
      children: [
        { type: 'window', id: 'window-2' },
        { type: 'window', id: 'window-3' },
      ],
    },
  ],
};

describe('groupLayoutHelpers', () => {
  it('finds nested window nodes and reports containment', () => {
    expect(findWindowNode(nestedLayout, 'window-3')).toEqual({ type: 'window', id: 'window-3' });
    expect(findWindowNode(nestedLayout, 'missing')).toBeNull();
    expect(containsWindow(nestedLayout, 'window-2')).toBe(true);
    expect(containsWindow(nestedLayout, 'missing')).toBe(false);
  });

  it('collects all window ids in layout order and reports depth/count', () => {
    expect(getAllWindowIds(nestedLayout)).toEqual(['window-1', 'window-2', 'window-3']);
    expect(getWindowCount(nestedLayout)).toBe(3);
    expect(getGroupLayoutDepth(nestedLayout)).toBe(3);
  });

  it('creates a two-window group with balanced root split', () => {
    const group = createGroup('Backend', 'window-a', 'window-b', 'vertical');
    expect(group.name).toBe('Backend');
    expect(group.layout).toEqual({
      type: 'split',
      direction: 'vertical',
      sizes: [0.5, 0.5],
      children: [
        { type: 'window', id: 'window-a' },
        { type: 'window', id: 'window-b' },
      ],
    });
    expect(group.activeWindowId).toBe('window-a');
  });

  it('adds a window around the target node and preserves explicit insertion order', () => {
    const nextLayout = addWindowToGroup(nestedLayout, 'window-2', 'window-4', 'horizontal', true);
    expect(nextLayout).not.toBeNull();
    expect(getAllWindowIds(nextLayout!)).toEqual(['window-1', 'window-4', 'window-2', 'window-3']);

    const nestedSplit = (nextLayout as Extract<GroupLayoutNode, { type: 'split' }>).children[1];
    expect(nestedSplit.type).toBe('split');
    if (nestedSplit.type !== 'split') {
      throw new Error('expected split child');
    }

    expect(nestedSplit.children[0]).toEqual({
      type: 'split',
      direction: 'horizontal',
      sizes: [0.5, 0.5],
      children: [
        { type: 'window', id: 'window-4' },
        { type: 'window', id: 'window-2' },
      ],
    });
  });

  it('removes windows and flattens single-child splits', () => {
    const nextLayout = removeWindowFromGroup(nestedLayout, 'window-2');
    expect(nextLayout).not.toBeNull();
    expect(getAllWindowIds(nextLayout!)).toEqual(['window-1', 'window-3']);

    const rightChild = (nextLayout as Extract<GroupLayoutNode, { type: 'split' }>).children[1];
    expect(rightChild).toEqual({ type: 'window', id: 'window-3' });
  });

  it('returns null when removing the last remaining window', () => {
    const singleWindow: GroupLayoutNode = { type: 'window', id: 'window-only' };
    expect(removeWindowFromGroup(singleWindow, 'window-only')).toBeNull();
  });

  it('normalizes split sizes when updating a nested split node', () => {
    const updated = updateGroupSplitSizes(nestedLayout, [1], [3, 1]);
    expect(updated.type).toBe('split');
    if (updated.type !== 'split') {
      throw new Error('expected root split');
    }

    const nestedSplit = updated.children[1];
    expect(nestedSplit.type).toBe('split');
    if (nestedSplit.type !== 'split') {
      throw new Error('expected nested split');
    }

    expect(nestedSplit.sizes[0]).toBeCloseTo(0.75);
    expect(nestedSplit.sizes[1]).toBeCloseTo(0.25);
  });

  it('replaces referenced window ids recursively', () => {
    const replaced = replaceWindowId(nestedLayout, 'window-3', 'window-9');
    expect(getAllWindowIds(replaced)).toEqual(['window-1', 'window-2', 'window-9']);
    expect(findWindowNode(replaced, 'window-3')).toBeNull();
  });
});
