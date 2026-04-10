import { describe, expect, it } from 'vitest';
import { closePane, collapseTmuxAgentPanesForPause, updateSplitSizes } from '../layoutHelpers';
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

describe('layoutHelpers.collapseTmuxAgentPanesForPause', () => {
  it('collapses tmux auto-created panes back to a single paused pane', () => {
    const layout: LayoutNode = {
      type: 'split',
      direction: 'horizontal',
      sizes: [0.3, 0.7],
      children: [
        createPaneNode('leader', {
          status: WindowStatus.Running,
          pid: 101,
          title: 'leader',
          borderColor: '#0087ff',
          lastOutput: 'old-output',
        }),
        {
          type: 'split',
          direction: 'vertical',
          sizes: [0.5, 0.5],
          children: [
            createPaneNode('agent-a', {
              status: WindowStatus.Running,
              pid: 201,
              title: 'agent-a',
              teamName: 'team-1',
              agentName: 'agent-a',
              agentColor: 'green',
              borderColor: '#00ff00',
            }),
            createPaneNode('agent-b', {
              status: WindowStatus.WaitingForInput,
              pid: 202,
              title: 'agent-b',
              teamName: 'team-1',
              agentName: 'agent-b',
              agentColor: 'blue',
              borderColor: '#0000ff',
            }),
          ],
        },
      ],
    };

    const collapsed = collapseTmuxAgentPanesForPause(layout);

    expect(collapsed).not.toBeNull();
    expect(collapsed?.activePaneId).toBe('leader');
    expect(collapsed?.layout).toMatchObject({
      type: 'pane',
      id: 'leader',
      pane: {
        id: 'leader',
        cwd: 'C:/workspace',
        command: 'pwsh.exe',
        status: WindowStatus.Paused,
        pid: null,
      },
    });

    if (!collapsed || collapsed.layout.type !== 'pane') {
      throw new Error('expected collapsed pane layout');
    }

    expect(collapsed.layout.pane.lastOutput).toBeUndefined();
    expect(collapsed.layout.pane.title).toBeUndefined();
    expect(collapsed.layout.pane.borderColor).toBeUndefined();
    expect(collapsed.layout.pane.teamName).toBeUndefined();
    expect(collapsed.layout.pane.agentName).toBeUndefined();
  });

  it('does not collapse a manual multi-pane layout without tmux markers', () => {
    const layout: LayoutNode = {
      type: 'split',
      direction: 'horizontal',
      sizes: [0.5, 0.5],
      children: [
        createPaneNode('left', { status: WindowStatus.Running, pid: 100 }),
        createPaneNode('right', { status: WindowStatus.WaitingForInput, pid: 200 }),
      ],
    };

    expect(collapseTmuxAgentPanesForPause(layout)).toBeNull();
  });

  it('collapses only the tmux subtree and preserves browser siblings', () => {
    const layout: LayoutNode = {
      type: 'split',
      direction: 'horizontal',
      sizes: [0.6, 0.4],
      children: [
        {
          type: 'split',
          direction: 'vertical',
          sizes: [0.5, 0.5],
          children: [
            createPaneNode('leader', {
              status: WindowStatus.Running,
              pid: 101,
              tmuxScopeId: 'scope-1',
              teamName: 'team-1',
            }),
            createPaneNode('agent-a', {
              status: WindowStatus.WaitingForInput,
              pid: 202,
              tmuxScopeId: 'scope-1',
              teamName: 'team-1',
              agentName: 'agent-a',
            }),
          ],
        },
        createPaneNode('browser', {
          kind: 'browser',
          command: '',
          cwd: '',
          status: WindowStatus.Paused,
          browser: { url: 'https://example.com' },
        }),
      ],
    };

    const collapsed = collapseTmuxAgentPanesForPause(layout, 'agent-a');

    expect(collapsed).not.toBeNull();
    if (!collapsed || collapsed.layout.type !== 'split') {
      throw new Error('expected root split layout');
    }

    expect(collapsed.activePaneId).toBe('leader');
    expect(collapsed.layout.children[1]).toMatchObject({
      type: 'pane',
      id: 'browser',
      pane: {
        kind: 'browser',
        browser: { url: 'https://example.com' },
      },
    });
    expect(collapsed.layout.children[0]).toMatchObject({
      type: 'pane',
      id: 'leader',
      pane: {
        id: 'leader',
        status: WindowStatus.Paused,
        pid: null,
      },
    });
  });
});
