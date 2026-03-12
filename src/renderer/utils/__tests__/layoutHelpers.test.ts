import { describe, expect, it } from 'vitest';
import { closePane, updateSplitSizes } from '../layoutHelpers';
import { LayoutNode, Pane, WindowStatus } from '../../types/window';

function createPane(id: string): Pane {
  return {
    id,
    cwd: 'C:/workspace',
    command: 'pwsh.exe',
    status: WindowStatus.WaitingForInput,
    pid: null,
  };
}

function createPaneNode(id: string): LayoutNode {
  return {
    type: 'pane',
    id,
    pane: createPane(id),
  };
}

describe('layoutHelpers.closePane', () => {
  it('preserves ancestor split sizes when closing a nested pane', () => {
    const layout: LayoutNode = {
      type: 'split',
      direction: 'horizontal',
      sizes: [0.3, 0.7],
      children: [
        createPaneNode('leader'),
        {
          type: 'split',
          direction: 'vertical',
          sizes: [0.2, 0.3, 0.5],
          children: [
            createPaneNode('teammate-a'),
            createPaneNode('teammate-b'),
            createPaneNode('teammate-c'),
          ],
        },
      ],
    };

    const nextLayout = closePane(layout, 'teammate-b');

    expect(nextLayout).not.toBeNull();
    expect(nextLayout).toMatchObject({
      type: 'split',
      direction: 'horizontal',
      sizes: [0.3, 0.7],
    });

    if (!nextLayout || nextLayout.type !== 'split') {
      throw new Error('expected split layout');
    }

    const rightSide = nextLayout.children[1];
    expect(rightSide.type).toBe('split');
    if (rightSide.type !== 'split') {
      throw new Error('expected nested split');
    }

    expect(rightSide.sizes[0]).toBeCloseTo(0.2 / 0.7);
    expect(rightSide.sizes[1]).toBeCloseTo(0.5 / 0.7);
    expect(rightSide.children).toHaveLength(2);
    expect(rightSide.children[0]).toMatchObject({ type: 'pane', id: 'teammate-a' });
    expect(rightSide.children[1]).toMatchObject({ type: 'pane', id: 'teammate-c' });
  });

  it('returns the original layout when the pane does not exist', () => {
    const layout: LayoutNode = {
      type: 'split',
      direction: 'horizontal',
      sizes: [0.3, 0.7],
      children: [createPaneNode('leader'), createPaneNode('teammate')],
    };

    expect(closePane(layout, 'missing-pane')).toBe(layout);
  });

  it('keeps a single-child split node after closing a sibling pane', () => {
    const layout: LayoutNode = {
      type: 'split',
      direction: 'horizontal',
      sizes: [0.3, 0.7],
      children: [
        createPaneNode('leader'),
        {
          type: 'split',
          direction: 'vertical',
          sizes: [0.5, 0.5],
          children: [
            createPaneNode('teammate-a'),
            createPaneNode('teammate-b'),
          ],
        },
      ],
    };

    const nextLayout = closePane(layout, 'teammate-a');
    expect(nextLayout).not.toBeNull();

    if (!nextLayout || nextLayout.type !== 'split') {
      throw new Error('expected split layout');
    }

    const rightSide = nextLayout.children[1];
    expect(rightSide.type).toBe('split');
    if (rightSide.type !== 'split') {
      throw new Error('expected nested split');
    }

    expect(rightSide.children).toHaveLength(1);
    expect(rightSide.sizes).toEqual([1]);
    expect(rightSide.children[0]).toMatchObject({ type: 'pane', id: 'teammate-b' });
  });
});

describe('layoutHelpers.updateSplitSizes', () => {
  it('updates nested split sizes without changing ancestor sizes', () => {
    const layout: LayoutNode = {
      type: 'split',
      direction: 'horizontal',
      sizes: [0.3, 0.7],
      children: [
        createPaneNode('leader'),
        {
          type: 'split',
          direction: 'vertical',
          sizes: [0.2, 0.3, 0.5],
          children: [
            createPaneNode('teammate-a'),
            createPaneNode('teammate-b'),
            createPaneNode('teammate-c'),
          ],
        },
      ],
    };

    const nextLayout = updateSplitSizes(layout, [1], [0.1, 0.2, 0.7]);

    expect(nextLayout).toMatchObject({
      type: 'split',
      direction: 'horizontal',
      sizes: [0.3, 0.7],
    });

    if (nextLayout.type !== 'split') {
      throw new Error('expected root split');
    }

    const nestedSplit = nextLayout.children[1];
    expect(nestedSplit.type).toBe('split');
    if (nestedSplit.type !== 'split') {
      throw new Error('expected nested split');
    }

    expect(nestedSplit.sizes).toEqual([0.1, 0.2, 0.7]);
  });

  it('returns the original layout when the split path is invalid', () => {
    const layout: LayoutNode = {
      type: 'split',
      direction: 'horizontal',
      sizes: [0.5, 0.5],
      children: [createPaneNode('left'), createPaneNode('right')],
    };

    expect(updateSplitSizes(layout, [1], [0.4, 0.6])).toBe(layout);
  });
});
