import React, { useMemo } from 'react';
import { GitCommitHorizontal } from 'lucide-react';
import type { CodePaneGitGraphCommit } from '../../../shared/types/electron-api';
import { buildGitGraphLayout, type GitGraphLineSegment } from '../../utils/gitGraphLayout';
import { idePopupMicroButtonClassName } from '../ui/ide-popup';

const GIT_GRAPH_COLORS = [
  '#60a5fa',
  '#f472b6',
  '#f59e0b',
  '#34d399',
  '#a78bfa',
  '#fb7185',
  '#22d3ee',
  '#facc15',
];

const LANE_WIDTH = 16;
const ROW_HEIGHT = 32;
const NODE_RADIUS = 4.5;

interface GitBranchGraphProps {
  commits: CodePaneGitGraphCommit[];
  onCherryPick?: (commitSha: string) => void | Promise<void>;
}

export function GitBranchGraph({
  commits,
  onCherryPick,
}: GitBranchGraphProps) {
  const layout = useMemo(() => buildGitGraphLayout(commits), [commits]);
  const graphWidth = Math.max(layout.maxColumns, 1) * LANE_WIDTH;

  if (layout.rows.length === 0) {
    return null;
  }

  return (
    <div className="overflow-x-auto overflow-y-hidden">
      <div className="min-w-max">
        {layout.rows.map((row) => {
          const visibleRefs = row.commit.refs.slice(0, 4);
          const nodeColor = getGraphColor(row.nodeColorIndex);
          return (
            <div
              key={row.commit.sha}
              className="group flex min-h-8 items-stretch rounded px-1 hover:bg-[rgb(var(--accent))]"
            >
              <div className="shrink-0" style={{ width: `${graphWidth}px` }}>
                <svg
                  width={graphWidth}
                  height={ROW_HEIGHT}
                  viewBox={`0 0 ${graphWidth} ${ROW_HEIGHT}`}
                  className="block h-8 w-full"
                  aria-hidden="true"
                >
                  {row.segments.map((segment, index) => (
                    <path
                      key={`${row.commit.sha}-segment-${index}`}
                      d={toSegmentPath(segment)}
                      fill="none"
                      stroke={getGraphColor(segment.colorIndex)}
                      strokeWidth={2.2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={0.95}
                    />
                  ))}
                  <circle
                    cx={getLaneCenter(row.nodeLane)}
                    cy={ROW_HEIGHT / 2}
                    r={row.commit.isMergeCommit ? NODE_RADIUS + 0.5 : NODE_RADIUS}
                    fill={nodeColor}
                    stroke={row.commit.isHead ? '#ecfccb' : '#18181b'}
                    strokeWidth={row.commit.isHead ? 1.8 : 1.4}
                  />
                  {row.commit.isHead && (
                    <circle
                      cx={getLaneCenter(row.nodeLane)}
                      cy={ROW_HEIGHT / 2}
                      r={NODE_RADIUS + 2}
                      fill="none"
                      stroke={nodeColor}
                      strokeWidth={1.1}
                      opacity={0.45}
                    />
                  )}
                </svg>
              </div>

              <div className="min-w-0 flex-1 py-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-xs text-[rgb(var(--foreground))]">{row.commit.subject || row.commit.shortSha}</span>
                  {visibleRefs.map((ref) => (
                    <span
                      key={`${row.commit.sha}-${ref}`}
                      className={`rounded px-1 py-0.5 text-[10px] ${getRefClassName(ref)}`}
                    >
                      {ref}
                    </span>
                  ))}
                  {row.commit.refs.length > visibleRefs.length && (
                    <span className="text-[10px] text-[rgb(var(--muted-foreground))]">+{row.commit.refs.length - visibleRefs.length}</span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-[rgb(var(--muted-foreground))]">
                  <span>{row.commit.author}</span>
                  <span>{new Date(row.commit.timestamp * 1000).toLocaleString()}</span>
                  <span>{row.commit.shortSha}</span>
                </div>
              </div>

              {onCherryPick && (
                <div className="flex shrink-0 items-center pl-2">
                  <button
                    type="button"
                    onClick={() => {
                      void onCherryPick(row.commit.sha);
                    }}
                    className={idePopupMicroButtonClassName('neutral')}
                    aria-label={`Cherry-pick ${row.commit.shortSha}`}
                  >
                    <GitCommitHorizontal size={12} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function toSegmentPath(segment: GitGraphLineSegment): string {
  const startX = getLaneCenter(segment.fromLane);
  const endX = getLaneCenter(segment.toLane);
  const startY = segment.fromY * ROW_HEIGHT;
  const endY = segment.toY * ROW_HEIGHT;

  if (segment.fromLane === segment.toLane) {
    return `M ${startX} ${startY} L ${endX} ${endY}`;
  }

  const controlY = startY + ((endY - startY) * 0.5);
  return `M ${startX} ${startY} C ${startX} ${controlY}, ${endX} ${controlY}, ${endX} ${endY}`;
}

function getLaneCenter(lane: number): number {
  return (lane * LANE_WIDTH) + (LANE_WIDTH / 2);
}

function getGraphColor(colorIndex: number): string {
  return GIT_GRAPH_COLORS[colorIndex % GIT_GRAPH_COLORS.length];
}

function getRefClassName(ref: string): string {
  if (ref.startsWith('HEAD ->')) {
    return 'bg-[rgb(var(--success)/0.14)] text-[rgb(var(--success))]';
  }

  if (ref.startsWith('origin/')) {
    return 'bg-[rgb(var(--info)/0.14)] text-[rgb(var(--info))]';
  }

  if (ref.startsWith('tag:')) {
    return 'bg-[rgb(var(--warning)/0.14)] text-[rgb(var(--warning))]';
  }

  return 'bg-[color-mix(in_srgb,rgb(var(--secondary))_74%,transparent)] text-[rgb(var(--muted-foreground))]';
}
