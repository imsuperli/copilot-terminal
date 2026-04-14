import type { CodePaneGitGraphCommit } from '../../shared/types/electron-api';

export interface GitGraphLineSegment {
  fromLane: number;
  toLane: number;
  fromY: number;
  toY: number;
  colorIndex: number;
}

export interface GitGraphRowLayout {
  commit: CodePaneGitGraphCommit;
  nodeLane: number;
  nodeColorIndex: number;
  columnCount: number;
  segments: GitGraphLineSegment[];
}

export interface GitGraphLayout {
  rows: GitGraphRowLayout[];
  maxColumns: number;
}

export function buildGitGraphLayout(commits: CodePaneGitGraphCommit[]): GitGraphLayout {
  const colorByToken = new Map<string, number>();
  const rows: GitGraphRowLayout[] = [];
  let nextColorIndex = 0;
  let activeLanes: string[] = [];
  let maxColumns = 1;

  const ensureColor = (token: string, fallbackToken?: string): number => {
    const existingColor = colorByToken.get(token);
    if (existingColor !== undefined) {
      return existingColor;
    }

    if (fallbackToken) {
      const fallbackColor = colorByToken.get(fallbackToken);
      if (fallbackColor !== undefined) {
        colorByToken.set(token, fallbackColor);
        return fallbackColor;
      }
    }

    const nextColor = nextColorIndex;
    nextColorIndex += 1;
    colorByToken.set(token, nextColor);
    return nextColor;
  };

  for (const commit of commits) {
    const laneBeforeInsert = activeLanes.indexOf(commit.sha);
    const rowBefore = [...activeLanes];
    let nodeLane = laneBeforeInsert;
    if (nodeLane === -1) {
      nodeLane = rowBefore.length;
      rowBefore.push(commit.sha);
    }

    const [firstParent, ...otherParents] = commit.parents;
    const nodeColorIndex = ensureColor(commit.sha, firstParent);
    if (firstParent) {
      ensureColor(firstParent, commit.sha);
    }
    for (const parent of otherParents) {
      ensureColor(parent);
    }

    const rowAfter = [...rowBefore];
    if (firstParent) {
      rowAfter[nodeLane] = firstParent;
    } else {
      rowAfter.splice(nodeLane, 1);
    }

    let insertIndex = nodeLane + 1;
    for (const parent of otherParents) {
      if (!rowAfter.includes(parent)) {
        rowAfter.splice(insertIndex, 0, parent);
        insertIndex += 1;
      }
    }

    for (let index = rowAfter.length - 1; index >= 0; index -= 1) {
      if (rowAfter.indexOf(rowAfter[index]) !== index) {
        rowAfter.splice(index, 1);
      }
    }

    const segments: GitGraphLineSegment[] = [];
    if (laneBeforeInsert !== -1) {
      segments.push({
        fromLane: nodeLane,
        toLane: nodeLane,
        fromY: 0,
        toY: 0.5,
        colorIndex: nodeColorIndex,
      });
    }

    for (const [beforeLane, token] of rowBefore.entries()) {
      if (beforeLane === nodeLane && token === commit.sha) {
        continue;
      }

      const afterLane = rowAfter.indexOf(token);
      if (afterLane === -1) {
        continue;
      }

      segments.push({
        fromLane: beforeLane,
        toLane: afterLane,
        fromY: 0,
        toY: 1,
        colorIndex: ensureColor(token),
      });
    }

    for (const parent of commit.parents) {
      const parentLane = rowAfter.indexOf(parent);
      if (parentLane === -1) {
        continue;
      }

      segments.push({
        fromLane: nodeLane,
        toLane: parentLane,
        fromY: 0.5,
        toY: 1,
        colorIndex: parent === firstParent
          ? nodeColorIndex
          : ensureColor(parent),
      });
    }

    const columnCount = Math.max(rowBefore.length, rowAfter.length, 1);
    maxColumns = Math.max(maxColumns, columnCount);
    rows.push({
      commit,
      nodeLane,
      nodeColorIndex,
      columnCount,
      segments,
    });

    activeLanes = rowAfter;
  }

  return {
    rows,
    maxColumns,
  };
}
