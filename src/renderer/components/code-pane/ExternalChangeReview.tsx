import React from 'react';
import { Check, RotateCcw } from 'lucide-react';
import type { InlineDiffLine } from './InlineDiffViewer';
import { splitContentLines } from './InlineDiffViewer';
import { useI18n } from '../../i18n';

const EXTERNAL_CHANGE_REVIEW_PREVIEW_LINE_LIMIT = 80;
const EXTERNAL_CHANGE_REVIEW_LCS_CELL_LIMIT = 250_000;
const EXTERNAL_CHANGE_REVIEW_MAX_RENDERED_LINES = 1_200;
const EXTERNAL_CHANGE_REVIEW_MAX_CONTENT_LENGTH = 120_000;

type ExternalChangeLineEntry = {
  lineNumber: number;
  text: string;
};

type ExternalChangeLineSummary = {
  addedCount: number;
  deletedCount: number;
  addedLines: ExternalChangeLineEntry[];
  deletedLines: ExternalChangeLineEntry[];
  hiddenAddedCount: number;
  hiddenDeletedCount: number;
  isApproximate: boolean;
};

export type ExternalChangeReviewBlock = {
  id: string;
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
  lines: InlineDiffLine[];
};

type ExternalChangeReviewRenderRow =
  | {
    id: string;
    kind: 'context';
    lineNumber: number;
    text: string;
  }
  | {
    id: string;
    kind: 'block';
    block: ExternalChangeReviewBlock;
  };

type ExternalChangeReviewProps = {
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
      return 'text-[rgb(var(--foreground))]';
    case 'deleted':
      return 'text-[rgb(var(--foreground))]';
    case 'context':
    default:
      return 'text-[rgb(var(--foreground))]';
  }
}

function getLineToneStyle(kind: InlineDiffLine['kind']): React.CSSProperties | undefined {
  switch (kind) {
    case 'added':
      return {
        backgroundColor: 'rgb(var(--success) / 0.22)',
      };
    case 'deleted':
      return {
        backgroundColor: 'rgb(var(--error) / 0.22)',
      };
    case 'context':
    default:
      return undefined;
  }
}

function getContextLineClassName() {
  return 'text-[rgb(var(--foreground))]';
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

function getContextMarkerClassName() {
  return 'text-[rgb(var(--muted-foreground))]';
}

function createEmptyExternalChangeLineSummary(): ExternalChangeLineSummary {
  return {
    addedCount: 0,
    deletedCount: 0,
    addedLines: [],
    deletedLines: [],
    hiddenAddedCount: 0,
    hiddenDeletedCount: 0,
    isApproximate: false,
  };
}

function createLinePreview(
  lines: string[],
  startLineNumber = 1,
): ExternalChangeLineEntry[] {
  return lines.slice(0, EXTERNAL_CHANGE_REVIEW_PREVIEW_LINE_LIMIT).map((text, index) => ({
    lineNumber: startLineNumber + index,
    text,
  }));
}

function createExternalChangeLineSummary(
  previousContent: string | null | undefined,
  currentContent: string | null | undefined,
): ExternalChangeLineSummary {
  if (previousContent === null && currentContent === null) {
    return createEmptyExternalChangeLineSummary();
  }

  if (previousContent === null || previousContent === undefined) {
    const addedLines = splitContentLines(currentContent);
    const previewLines = createLinePreview(addedLines);
    return {
      addedCount: addedLines.length,
      deletedCount: 0,
      addedLines: previewLines,
      deletedLines: [],
      hiddenAddedCount: Math.max(0, addedLines.length - previewLines.length),
      hiddenDeletedCount: 0,
      isApproximate: false,
    };
  }

  if (currentContent === null || currentContent === undefined) {
    const deletedLines = splitContentLines(previousContent);
    const previewLines = createLinePreview(deletedLines);
    return {
      addedCount: 0,
      deletedCount: deletedLines.length,
      addedLines: [],
      deletedLines: previewLines,
      hiddenAddedCount: 0,
      hiddenDeletedCount: Math.max(0, deletedLines.length - previewLines.length),
      isApproximate: false,
    };
  }

  const previousLines = splitContentLines(previousContent);
  const currentLines = splitContentLines(currentContent);
  let prefixLength = 0;
  while (
    prefixLength < previousLines.length
    && prefixLength < currentLines.length
    && previousLines[prefixLength] === currentLines[prefixLength]
  ) {
    prefixLength += 1;
  }

  let previousSuffixIndex = previousLines.length - 1;
  let currentSuffixIndex = currentLines.length - 1;
  while (
    previousSuffixIndex >= prefixLength
    && currentSuffixIndex >= prefixLength
    && previousLines[previousSuffixIndex] === currentLines[currentSuffixIndex]
  ) {
    previousSuffixIndex -= 1;
    currentSuffixIndex -= 1;
  }

  const deletedChangedLines = previousLines.slice(prefixLength, previousSuffixIndex + 1);
  const addedChangedLines = currentLines.slice(prefixLength, currentSuffixIndex + 1);

  return {
    addedCount: addedChangedLines.length,
    deletedCount: deletedChangedLines.length,
    addedLines: createLinePreview(addedChangedLines, prefixLength + 1),
    deletedLines: createLinePreview(deletedChangedLines, prefixLength + 1),
    hiddenAddedCount: Math.max(0, addedChangedLines.length - EXTERNAL_CHANGE_REVIEW_PREVIEW_LINE_LIMIT),
    hiddenDeletedCount: Math.max(0, deletedChangedLines.length - EXTERNAL_CHANGE_REVIEW_PREVIEW_LINE_LIMIT),
    isApproximate: true,
  };
}

function shouldRenderSummaryOnly(
  previousContent: string | null | undefined,
  currentContent: string | null | undefined,
  summary: ExternalChangeLineSummary,
): boolean {
  const totalContentLength = (previousContent?.length ?? 0) + (currentContent?.length ?? 0);
  if (totalContentLength > EXTERNAL_CHANGE_REVIEW_MAX_CONTENT_LENGTH) {
    return true;
  }

  return summary.addedCount + summary.deletedCount > EXTERNAL_CHANGE_REVIEW_MAX_RENDERED_LINES;
}

export function buildExternalChangeReviewBlocks(
  beforeContent: string | null | undefined,
  afterContent: string | null | undefined,
): ExternalChangeReviewBlock[] {
  const beforeLines = splitContentLines(beforeContent);
  const afterLines = splitContentLines(afterContent);
  const beforeCount = beforeLines.length;
  const afterCount = afterLines.length;
  const blocks: ExternalChangeReviewBlock[] = [];
  let prefixCount = 0;
  while (
    prefixCount < beforeCount
    && prefixCount < afterCount
    && beforeLines[prefixCount] === afterLines[prefixCount]
  ) {
    prefixCount += 1;
  }

  let suffixCount = 0;
  while (
    suffixCount < beforeCount - prefixCount
    && suffixCount < afterCount - prefixCount
    && beforeLines[beforeCount - suffixCount - 1] === afterLines[afterCount - suffixCount - 1]
  ) {
    suffixCount += 1;
  }

  const beforeMiddleStart = prefixCount;
  const beforeMiddleEnd = beforeCount - suffixCount;
  const afterMiddleStart = prefixCount;
  const afterMiddleEnd = afterCount - suffixCount;
  const beforeMiddleCount = beforeMiddleEnd - beforeMiddleStart;
  const afterMiddleCount = afterMiddleEnd - afterMiddleStart;

  let currentBlock: ExternalChangeReviewBlock | null = null;

  const ensureBlock = (beforeIndex: number, afterIndex: number) => {
    if (currentBlock) {
      return currentBlock;
    }

    currentBlock = {
      id: '',
      beforeStartIndex: beforeIndex,
      beforeDeleteCount: 0,
      afterStartIndex: afterIndex,
      afterDeleteCount: 0,
      deletedLines: [],
      addedLines: [],
      deletedStartLineNumber: null,
      deletedEndLineNumber: null,
      addedStartLineNumber: null,
      addedEndLineNumber: null,
      lines: [],
    };
    return currentBlock;
  };

  const flushBlock = () => {
    if (!currentBlock || currentBlock.lines.length === 0) {
      currentBlock = null;
      return;
    }

    currentBlock.id = `${blocks.length}:${currentBlock.beforeStartIndex}:${currentBlock.afterStartIndex}`;
    blocks.push(currentBlock);
    currentBlock = null;
  };

  const pushDeleted = (beforeIndex: number, afterIndex: number) => {
    const block = ensureBlock(beforeIndex, afterIndex);
    const text = beforeLines[beforeIndex] ?? '';
    const lineNumber = beforeIndex + 1;
    block.deletedLines.push(text);
    block.beforeDeleteCount = block.deletedLines.length;
    block.deletedStartLineNumber ??= lineNumber;
    block.deletedEndLineNumber = lineNumber;
    block.lines.push({
      key: `deleted:${lineNumber}:${block.lines.length}`,
      kind: 'deleted',
      beforeLineNumber: lineNumber,
      afterLineNumber: null,
      text,
    });
  };

  const pushAdded = (beforeIndex: number, afterIndex: number) => {
    const block = ensureBlock(beforeIndex, afterIndex);
    const text = afterLines[afterIndex] ?? '';
    const lineNumber = afterIndex + 1;
    block.addedLines.push(text);
    block.afterDeleteCount = block.addedLines.length;
    block.addedStartLineNumber ??= lineNumber;
    block.addedEndLineNumber = lineNumber;
    block.lines.push({
      key: `added:${lineNumber}:${block.lines.length}`,
      kind: 'added',
      beforeLineNumber: null,
      afterLineNumber: lineNumber,
      text,
    });
  };

  if (beforeMiddleCount * afterMiddleCount > EXTERNAL_CHANGE_REVIEW_LCS_CELL_LIMIT) {
    for (let beforeIndex = beforeMiddleStart; beforeIndex < beforeMiddleEnd; beforeIndex += 1) {
      pushDeleted(beforeIndex, afterMiddleStart);
    }
    for (let afterIndex = afterMiddleStart; afterIndex < afterMiddleEnd; afterIndex += 1) {
      pushAdded(beforeMiddleStart, afterIndex);
    }
    flushBlock();
    return blocks;
  }

  const table: number[][] = Array.from({ length: beforeMiddleCount + 1 }, () => Array(afterMiddleCount + 1).fill(0));

  for (let beforeOffset = beforeMiddleCount - 1; beforeOffset >= 0; beforeOffset -= 1) {
    for (let afterOffset = afterMiddleCount - 1; afterOffset >= 0; afterOffset -= 1) {
      table[beforeOffset][afterOffset] = beforeLines[beforeMiddleStart + beforeOffset] === afterLines[afterMiddleStart + afterOffset]
        ? table[beforeOffset + 1][afterOffset + 1] + 1
        : Math.max(table[beforeOffset + 1][afterOffset], table[beforeOffset][afterOffset + 1]);
    }
  }

  let beforeOffset = 0;
  let afterOffset = 0;

  while (beforeOffset < beforeMiddleCount && afterOffset < afterMiddleCount) {
    const beforeIndex = beforeMiddleStart + beforeOffset;
    const afterIndex = afterMiddleStart + afterOffset;
    if (beforeLines[beforeIndex] === afterLines[afterIndex]) {
      flushBlock();
      beforeOffset += 1;
      afterOffset += 1;
      continue;
    }

    if (table[beforeOffset + 1][afterOffset] >= table[beforeOffset][afterOffset + 1]) {
      pushDeleted(beforeIndex, afterIndex);
      beforeOffset += 1;
    } else {
      pushAdded(beforeIndex, afterIndex);
      afterOffset += 1;
    }
  }

  while (beforeOffset < beforeMiddleCount) {
    const beforeIndex = beforeMiddleStart + beforeOffset;
    pushDeleted(beforeIndex, afterMiddleStart + afterOffset);
    beforeOffset += 1;
  }

  while (afterOffset < afterMiddleCount) {
    const afterIndex = afterMiddleStart + afterOffset;
    pushAdded(beforeMiddleStart + beforeOffset, afterIndex);
    afterOffset += 1;
  }

  flushBlock();
  return blocks;
}

function buildExternalChangeReviewRows(
  beforeContent: string | null | undefined,
  blocks: ExternalChangeReviewBlock[],
): ExternalChangeReviewRenderRow[] {
  const beforeLines = splitContentLines(beforeContent);
  const rows: ExternalChangeReviewRenderRow[] = [];
  let nextContextIndex = 0;

  const pushContextLine = (lineIndex: number) => {
    rows.push({
      id: `context:${lineIndex}`,
      kind: 'context',
      lineNumber: lineIndex + 1,
      text: beforeLines[lineIndex] ?? '',
    });
  };

  for (const block of blocks) {
    while (nextContextIndex < block.beforeStartIndex) {
      pushContextLine(nextContextIndex);
      nextContextIndex += 1;
    }

    rows.push({
      id: `block:${block.id}`,
      kind: 'block',
      block,
    });

    nextContextIndex = Math.max(nextContextIndex, block.beforeStartIndex + block.beforeDeleteCount);
  }

  while (nextContextIndex < beforeLines.length) {
    pushContextLine(nextContextIndex);
    nextContextIndex += 1;
  }

  if (beforeLines.length === 0 && blocks.length === 0) {
    return [];
  }

  return rows;
}

function ExternalChangeReviewContextLine({
  lineNumber,
  text,
}: {
  lineNumber: number;
  text: string;
}) {
  return (
    <div
      className={`grid grid-cols-[12px_34px_minmax(0,1fr)] gap-1.5 px-2 ${getContextLineClassName()}`}
      data-testid="external-change-review-context-line"
    >
      <span className={`select-none text-center font-semibold ${getContextMarkerClassName()}`}>
        {' '}
      </span>
      <span className="select-none text-right text-[rgb(var(--muted-foreground))]">
        {lineNumber}
      </span>
      <code className="min-w-0 whitespace-pre-wrap break-words py-0.5">
        {text || ' '}
      </code>
    </div>
  );
}

export function ExternalChangeReview({
  beforeContent,
  afterContent,
  onAcceptAll,
  onRevertAll,
  onAcceptBlock,
  onRevertBlock,
}: ExternalChangeReviewProps) {
  const { t } = useI18n();
  const summary = React.useMemo(
    () => createExternalChangeLineSummary(beforeContent, afterContent),
    [afterContent, beforeContent],
  );
  const isSummaryOnly = React.useMemo(
    () => shouldRenderSummaryOnly(beforeContent, afterContent, summary),
    [afterContent, beforeContent, summary],
  );
  const blocks = React.useMemo(
    () => (isSummaryOnly ? [] : buildExternalChangeReviewBlocks(beforeContent, afterContent)),
    [afterContent, beforeContent, isSummaryOnly],
  );
  const rows = React.useMemo(
    () => (isSummaryOnly ? [] : buildExternalChangeReviewRows(beforeContent, blocks)),
    [beforeContent, blocks, isSummaryOnly],
  );

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-transparent">
      <div className="pointer-events-none absolute right-2 top-2 z-20 flex items-center gap-2">
        <div className="pointer-events-auto flex items-center gap-2 rounded bg-[rgb(var(--background))/0.94] px-2 py-1 shadow-sm backdrop-blur">
          <button
            type="button"
            onClick={onRevertAll}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-[rgb(var(--error))] transition-colors hover:bg-[rgb(var(--error))/0.10]"
          >
            <RotateCcw size={12} />
            {t('codePane.externalReviewRevertAll')}
          </button>
          <button
            type="button"
            onClick={onAcceptAll}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-[rgb(var(--success))] transition-colors hover:bg-[rgb(var(--success))/0.10]"
          >
            <Check size={12} />
            {t('codePane.externalReviewAcceptAll')}
          </button>
        </div>
      </div>
      {isSummaryOnly ? (
        <div
          className="min-h-0 flex-1 space-y-3 overflow-auto p-3"
          data-testid="external-change-review-summary-only"
        >
          <div className="px-1 py-1 text-xs text-[rgb(var(--muted-foreground))]">
            {t('codePane.externalReviewSummaryOnlyDetail')}
          </div>
          <ExternalChangeLineSummaryPanel summary={summary} />
        </div>
      ) : rows.length === 0 ? (
        <div className="px-2 py-2 text-xs text-[rgb(var(--muted-foreground))]">
          {t('codePane.externalChangeNoLineChanges')}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto px-1 pb-1">
          <div className="font-mono text-[11px] leading-5">
            {rows.map((row) => {
              if (row.kind === 'context') {
                return (
                  <ExternalChangeReviewContextLine
                    key={row.id}
                    lineNumber={row.lineNumber}
                    text={row.text}
                  />
                );
              }

              const { block } = row;

              return (
                <section
                  key={row.id}
                  className="group relative mt-5 first:mt-0"
                  data-testid="external-change-review-block"
                >
                  <div className="pointer-events-none absolute right-2 top-0 z-10 -translate-y-[calc(100%+2px)] opacity-0 transition-opacity group-hover:opacity-100">
                    <div className="pointer-events-auto flex items-center gap-2 rounded bg-[rgb(var(--background))/0.94] px-2 py-1 shadow-sm backdrop-blur">
                      <button
                        type="button"
                        onClick={() => {
                          onRevertBlock(block);
                        }}
                        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-[rgb(var(--error))] transition-colors hover:bg-[rgb(var(--error))/0.10]"
                        aria-label={t('codePane.externalReviewRevert')}
                      >
                        <RotateCcw size={11} />
                        {t('codePane.externalReviewRevert')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onAcceptBlock(block);
                        }}
                        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-[rgb(var(--success))] transition-colors hover:bg-[rgb(var(--success))/0.10]"
                        aria-label={t('codePane.externalReviewAccept')}
                      >
                        <Check size={11} />
                        {t('codePane.externalReviewAccept')}
                      </button>
                    </div>
                  </div>
                  <div>
                    {block.lines.map((line) => {
                      const marker = line.kind === 'added' ? '+' : line.kind === 'deleted' ? '-' : ' ';
                      const lineNumber = line.kind === 'added'
                        ? line.afterLineNumber
                        : line.kind === 'deleted'
                          ? line.beforeLineNumber
                          : line.afterLineNumber ?? line.beforeLineNumber;

                      return (
                        <div
                          key={line.key}
                          className={`grid grid-cols-[12px_34px_minmax(0,1fr)] gap-1.5 px-2 ${getLineToneClassName(line.kind)}`}
                          style={getLineToneStyle(line.kind)}
                          data-testid={`external-change-review-line-${line.kind}`}
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
        </div>
      )}
    </div>
  );
}

function ExternalChangeLinePreview({
  line,
  tone,
}: {
  line: ExternalChangeLineEntry;
  tone: 'added' | 'deleted';
}) {
  const toneClassName = tone === 'added'
    ? 'border-[rgb(var(--success))/0.28] bg-[rgb(var(--success))/0.08] text-[rgb(var(--foreground))]'
    : 'border-[rgb(var(--error))/0.28] bg-[rgb(var(--error))/0.08] text-[rgb(var(--foreground))]';
  const prefix = tone === 'added' ? '+' : '-';

  return (
    <div className={`grid grid-cols-[52px_minmax(0,1fr)] gap-2 border-b border-[rgb(var(--border))] px-2 py-1 last:border-b-0 ${toneClassName}`}>
      <span className="select-none text-right font-mono text-[10px] text-[rgb(var(--muted-foreground))]">
        {line.lineNumber}
      </span>
      <code className="min-w-0 whitespace-pre-wrap break-words font-mono text-[11px] leading-5">
        {prefix} {line.text || ' '}
      </code>
    </div>
  );
}

function ExternalChangeLineSummaryPanel({
  summary,
}: {
  summary: ExternalChangeLineSummary;
}) {
  const { t } = useI18n();

  if (summary.addedCount === 0 && summary.deletedCount === 0) {
    return (
      <div className="rounded border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--background))_76%,transparent)] px-3 py-2 text-xs text-[rgb(var(--muted-foreground))]">
        {t('codePane.externalChangeNoLineChanges')}
      </div>
    );
  }

  return (
    <div className="min-h-0">
      <div className="grid min-h-0 md:grid-cols-2">
        <div className="min-h-0 md:border-r md:border-[rgb(var(--border))/0.18]">
          <div className="max-h-52 overflow-auto">
            {summary.deletedLines.length > 0 ? (
              <>
                {summary.deletedLines.map((line) => (
                  <ExternalChangeLinePreview key={`deleted:${line.lineNumber}:${line.text}`} line={line} tone="deleted" />
                ))}
                {summary.hiddenDeletedCount > 0 && (
                  <div className="px-3 py-2 text-[11px] text-[rgb(var(--muted-foreground))]">
                    {t('codePane.externalChangeHiddenLines', { count: summary.hiddenDeletedCount })}
                  </div>
                )}
              </>
            ) : (
              <div className="px-3 py-3 text-xs text-[rgb(var(--muted-foreground))]">{t('codePane.externalChangeNoDeletedLines')}</div>
            )}
          </div>
        </div>
        <div className="min-h-0">
          <div className="max-h-52 overflow-auto">
            {summary.addedLines.length > 0 ? (
              <>
                {summary.addedLines.map((line) => (
                  <ExternalChangeLinePreview key={`added:${line.lineNumber}:${line.text}`} line={line} tone="added" />
                ))}
                {summary.hiddenAddedCount > 0 && (
                  <div className="px-3 py-2 text-[11px] text-[rgb(var(--muted-foreground))]">
                    {t('codePane.externalChangeHiddenLines', { count: summary.hiddenAddedCount })}
                  </div>
                )}
              </>
            ) : (
              <div className="px-3 py-3 text-xs text-[rgb(var(--muted-foreground))]">{t('codePane.externalChangeNoAddedLines')}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
