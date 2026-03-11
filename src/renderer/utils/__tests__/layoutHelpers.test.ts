import { describe, expect, it } from 'vitest';
import { closePane } from '../layoutHelpers';
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
});
