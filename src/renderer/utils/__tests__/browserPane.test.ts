import { describe, expect, it } from 'vitest';
import { getSmartBrowserSplitDirection } from '../browserPane';
import { LayoutNode, WindowStatus } from '../../types/window';

function createPaneNode(id: string): LayoutNode {
  return {
    type: 'pane',
    id,
    pane: {
      id,
      cwd: 'D:\\tmp',
      command: 'pwsh.exe',
      status: WindowStatus.Running,
      pid: 1001,
    },
  };
}

describe('getSmartBrowserSplitDirection', () => {
  it('defaults to horizontal when there is only one pane', () => {
    expect(getSmartBrowserSplitDirection(createPaneNode('solo'), 'solo')).toBe('horizontal');
  });

  it('ignores collapsed single-child splits when choosing a direction', () => {
    const layout: LayoutNode = {
      type: 'split',
      direction: 'horizontal',
      sizes: [0.5, 0.5],
      children: [
        createPaneNode('left'),
        {
          type: 'split',
          direction: 'vertical',
          sizes: [1],
          children: [createPaneNode('right')],
        },
      ],
    };

    expect(getSmartBrowserSplitDirection(layout, 'right')).toBe('vertical');
  });
});
