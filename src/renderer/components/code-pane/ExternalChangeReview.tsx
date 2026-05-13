import React from 'react';
import { Check, RotateCcw } from 'lucide-react';
import type { InlineDiffLine } from './InlineDiffViewer';
import { buildInlineDiffLines } from './InlineDiffViewer';
import { useI18n } from '../../i18n';

export type ExternalChangeReviewBlock = {
  id: string;
  startDiffLineIndex: number;
  endDiffLineIndex: number;
  beforeStartIndex: number;
  beforeDeleteCount: number;
  afterStartIndex: number;
  afterDeleteCount: number;
  deletedLines: string[];
  addedLines: string[];
  deletedStartLineNumber: number | null;
  deletedEndLineNumber: number | null;
  addedStartLineNumber: number | null;
  addedEndLineNumber: number | null;
};

type ExternalChangeReviewProps = {
  filePath: string;
  beforeContent: string | null | undefined;
  afterContent: string | null | undefined;
  onAcceptAll: () => void;
  onRevertAll: () => void;
  onAcceptBlock: (block: ExternalChangeReviewBlock) => void;
  onRevertBlock: (block: ExternalChangeReviewBlock) => void;
};

function getLineToneClassName(kind: InlineDiffLine['kind']): string {
  switch (kind) {
    case 'added':
      return 'bg-[rgb(var(--success))/0.22] text-[rgb(var(--foreground))]';
    case 'deleted':
      return 'bg-[rgb(var(--error))/0.18] text-[rgb(var(--foreground))]';
    case 'context':
    default:
      return 'text-[rgb(var(--foreground))]';
  }
}

function getMarkerClassName(kind: InlineDiffLine['kind']): string {
  switch (kind) {
    case 'added':
      return 'text-[rgb(var(--success))]';
    case 'deleted':
      return 'text-[rgb(var(--error))]';
    case 'context':
    default:
      return 'text-[rgb(var(--muted-foreground))]';
  }
}

export function buildExternalChangeReviewBlocks(lines: InlineDiffLine[]): ExternalChangeReviewBlock[] {
  const blocks: ExternalChangeReviewBlock[] = [];
  let index = 0;
  let beforeIndex = 0;
  let afterIndex = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line) {
      index += 1;
      continue;
    }
    if (line.kind === 'context') {
      beforeIndex += 1;
      afterIndex += 1;
      index += 1;
      continue;
    }

    const startDiffLineIndex = index;
    let endDiffLineIndex = index;
    const beforeStartIndex = beforeIndex;
    const afterStartIndex = afterIndex;
    const deletedLines: string[] = [];
    const addedLines: string[] = [];
    let deletedStartLineNumber: number | null = null;
    let deletedEndLineNumber: number | null = null;
    let addedStartLineNumber: number | null = null;
    let addedEndLineNumber: number | null = null;

    while (endDiffLineIndex < lines.length) {
      const candidate = lines[endDiffLineIndex];
      if (!candidate || candidate.kind === 'context') {
        break;
      }
      if (candidate.kind === 'deleted') {
        deletedLines.push(candidate.text);
        deletedStartLineNumber ??= candidate.beforeLineNumber;
        deletedEndLineNumber = candidate.beforeLineNumber;
        beforeIndex += 1;
      }
      if (candidate.kind === 'added') {
        addedLines.push(candidate.text);
        addedStartLineNumber ??= candidate.afterLineNumber;
        addedEndLineNumber = candidate.afterLineNumber;
        afterIndex += 1;
      }
      endDiffLineIndex += 1;
    }

    blocks.push({
      id: `${startDiffLineIndex}:${endDiffLineIndex}`,
      startDiffLineIndex,
      endDiffLineIndex: endDiffLineIndex - 1,
      beforeStartIndex,
      beforeDeleteCount: deletedLines.length,
      afterStartIndex,
      afterDeleteCount: addedLines.length,
      deletedLines,
      addedLines,
      deletedStartLineNumber,
      deletedEndLineNumber,
      addedStartLineNumber,
      addedEndLineNumber,
    });
    index = endDiffLineIndex;
  }

  return blocks;
}

function formatRangeLabel(start: number | null, end: number | null): string | null {
  if (start === null || end === null) {
    return null;
  }
  return start === end ? `${start}` : `${start}-${end}`;
}

export function ExternalChangeReview({
  filePath,
  beforeContent,
  afterContent,
  onAcceptAll,
  onRevertAll,
  onAcceptBlock,
  onRevertBlock,
}: ExternalChangeReviewProps) {
  const { t } = useI18n();
  const lines = React.useMemo(
    () => buildInlineDiffLines(beforeContent, afterContent),
    [afterContent, beforeContent],
  );
  const blocks = React.useMemo(
    () => buildExternalChangeReviewBlocks(lines),
    [lines],
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--background))_84%,transparent)]">
      <div className="flex items-center justify-between gap-3 border-b border-[rgb(var(--border))] px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-[rgb(var(--foreground))]">
            {filePath}
          </div>
          <div className="mt-1 text-[11px] text-[rgb(var(--muted-foreground))]">
            {t('codePane.externalReviewPending', { count: blocks.length })}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRevertAll}
            className="inline-flex items-center gap-1 rounded border border-[rgb(var(--error))/0.36] bg-[rgb(var(--error))/0.12] px-2 py-1 text-[11px] text-[rgb(var(--error))] transition-colors hover:bg-[rgb(var(--error))/0.18]"
          >
            <RotateCcw size={12} />
            {t('codePane.externalReviewRevertAll')}
          </button>
          <button
            type="button"
            onClick={onAcceptAll}
            className="inline-flex items-center gap-1 rounded border border-[rgb(var(--success))/0.34] bg-[rgb(var(--success))/0.12] px-2 py-1 text-[11px] text-[rgb(var(--success))] transition-colors hover:bg-[rgb(var(--success))/0.18]"
          >
            <Check size={12} />
            {t('codePane.externalReviewAcceptAll')}
          </button>
        </div>
      </div>
      {blocks.length === 0 ? (
        <div className="px-3 py-3 text-xs text-[rgb(var(--muted-foreground))]">
          {t('codePane.externalChangeNoLineChanges')}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto py-2">
          {blocks.map((block) => {
            const blockLines = lines.slice(block.startDiffLineIndex, block.endDiffLineIndex + 1);
            const deletedRangeLabel = formatRangeLabel(block.deletedStartLineNumber, block.deletedEndLineNumber);
            const addedRangeLabel = formatRangeLabel(block.addedStartLineNumber, block.addedEndLineNumber);

            return (
              <section
                key={block.id}
                className="mx-2 mb-3 overflow-hidden rounded border border-[rgb(var(--border))]"
                data-testid="external-change-review-block"
              >
                <div className="flex items-center justify-between gap-3 border-b border-[rgb(var(--border))] bg-[rgb(var(--secondary))/0.32] px-3 py-1.5">
                  <div className="flex min-w-0 items-center gap-3 text-[11px] text-[rgb(var(--muted-foreground))]">
                    {deletedRangeLabel && (
                      <span>{t('codePane.externalReviewDeletedRange', { range: deletedRangeLabel })}</span>
                    )}
                    {addedRangeLabel && (
                      <span>{t('codePane.externalReviewAddedRange', { range: addedRangeLabel })}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onRevertBlock(block);
                      }}
                      className="inline-flex items-center gap-1 rounded border border-[rgb(var(--error))/0.32] bg-[rgb(var(--error))/0.10] px-2 py-0.5 text-[11px] text-[rgb(var(--error))] transition-colors hover:bg-[rgb(var(--error))/0.16]"
                    >
                      <RotateCcw size={11} />
                      {t('codePane.externalReviewRevert')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onAcceptBlock(block);
                      }}
                      className="inline-flex items-center gap-1 rounded border border-[rgb(var(--success))/0.32] bg-[rgb(var(--success))/0.10] px-2 py-0.5 text-[11px] text-[rgb(var(--success))] transition-colors hover:bg-[rgb(var(--success))/0.16]"
                    >
                      <Check size={11} />
                      {t('codePane.externalReviewAccept')}
                    </button>
                  </div>
                </div>
                <div className="font-mono text-[11px] leading-5">
                  {blockLines.map((line) => {
                    const marker = line.kind === 'added' ? '+' : line.kind === 'deleted' ? '-' : ' ';
                    const lineNumber = line.kind === 'added'
                      ? line.afterLineNumber
                      : line.kind === 'deleted'
                        ? line.beforeLineNumber
                        : line.afterLineNumber ?? line.beforeLineNumber;

                    return (
                      <div
                        key={line.key}
                        className={`grid grid-cols-[18px_36px_minmax(0,1fr)] gap-2 px-2 ${getLineToneClassName(line.kind)}`}
                      >
                        <span className={`select-none text-center font-semibold ${getMarkerClassName(line.kind)}`}>
                          {marker}
                        </span>
                        <span className="select-none text-right text-[rgb(var(--muted-foreground))]">
                          {lineNumber ?? ''}
                        </span>
                        <code className="min-w-0 whitespace-pre-wrap break-words py-0.5">
                          {line.text || ' '}
                        </code>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
