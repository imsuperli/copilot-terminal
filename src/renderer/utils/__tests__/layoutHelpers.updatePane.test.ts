import { describe, expect, it } from 'vitest';
import { updatePaneInLayout } from '../layoutHelpers';
import { LayoutNode, Pane, WindowStatus } from '../../types/window';

function createPane(id: string, overrides: Partial<Pane> = {}): Pane {
  return {
    id,
    cwd: 'C:/workspace',
    command: 'pwsh.exe',
    status: WindowStatus.WaitingForInput,
    pid: null,
    ...overrides,
  };
}

function createPaneNode(id: string, overrides: Partial<Pane> = {}): LayoutNode {
  return {
    type: 'pane',
    id,
    pane: createPane(id, overrides),
  };
}

describe('layoutHelpers.updatePaneInLayout', () => {
  it('preserves unaffected branches by reference', () => {
    const leftPane = createPaneNode('left');
    const rightPane = createPaneNode('right');
    const layout: LayoutNode = {
      type: 'split',
      direction: 'horizontal',
      sizes: [0.5, 0.5],
      children: [leftPane, rightPane],
    };

    const nextLayout = updatePaneInLayout(layout, 'left', {
      title: 'updated-left',
    });

    expect(nextLayout).not.toBe(layout);
    expect(nextLayout.type).toBe('split');
    if (nextLayout.type !== 'split') {
      throw new Error('expected split layout');
    }

    expect(nextLayout.children[0]).not.toBe(leftPane);
    expect(nextLayout.children[1]).toBe(rightPane);
  });

  it('returns the original layout when the pane does not exist', () => {
    const layout: LayoutNode = {
      type: 'split',
      direction: 'horizontal',
      sizes: [0.5, 0.5],
      children: [createPaneNode('left'), createPaneNode('right')],
    };

    expect(updatePaneInLayout(layout, 'missing-pane', { title: 'noop' })).toBe(layout);
  });
});
