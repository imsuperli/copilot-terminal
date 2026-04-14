import { describe, expect, it } from 'vitest';
import type { CodePaneGitGraphCommit } from '../../../shared/types/electron-api';
import { buildGitGraphLayout } from '../gitGraphLayout';

function createCommit(
  sha: string,
  parents: string[],
  overrides: Partial<CodePaneGitGraphCommit> = {},
): CodePaneGitGraphCommit {
  return {
    sha,
    shortSha: sha.slice(0, 7),
    parents,
    subject: sha,
    author: 'Test User',
    timestamp: 1_710_000_000,
    refs: [],
    isHead: false,
    isMergeCommit: parents.length > 1,
    lane: 0,
    laneCount: 1,
    ...overrides,
  };
}

describe('buildGitGraphLayout', () => {
  it('builds merge connectors and lane collapse segments', () => {
    const layout = buildGitGraphLayout([
      createCommit('merge000', ['main002', 'feat001'], { isHead: true }),
      createCommit('feat001', ['base000']),
      createCommit('main002', ['base000']),
      createCommit('base000', []),
    ]);

    expect(layout.maxColumns).toBe(2);
    expect(layout.rows[0]).toMatchObject({
      nodeLane: 0,
    });
    expect(layout.rows[0]?.segments).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fromLane: 0,
        toLane: 0,
        fromY: 0.5,
        toY: 1,
      }),
      expect.objectContaining({
        fromLane: 0,
        toLane: 1,
        fromY: 0.5,
        toY: 1,
      }),
    ]));

    expect(layout.rows[1]).toMatchObject({
      nodeLane: 1,
    });

    expect(layout.rows[2]?.segments).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fromLane: 1,
        toLane: 0,
        fromY: 0,
        toY: 1,
      }),
    ]));
  });

  it('reuses the first-parent color for linear history', () => {
    const layout = buildGitGraphLayout([
      createCommit('head1111', ['mid1111']),
      createCommit('mid1111', ['base111']),
      createCommit('base111', []),
    ]);

    expect(layout.rows[0]?.nodeColorIndex).toBe(layout.rows[1]?.nodeColorIndex);
    expect(layout.rows[1]?.nodeColorIndex).toBe(layout.rows[2]?.nodeColorIndex);
  });
});
