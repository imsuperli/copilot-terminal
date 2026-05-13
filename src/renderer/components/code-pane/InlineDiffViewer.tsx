import React from 'react';
import { useI18n } from '../../i18n';

export type InlineDiffLineKind = 'context' | 'added' | 'deleted';

const INLINE_DIFF_LCS_CELL_LIMIT = 1_000_000;

export interface InlineDiffLine {
  key: string;
  kind: InlineDiffLineKind;
  beforeLineNumber: number | null;
  afterLineNumber: number | null;
  text: string;
}

interface InlineDiffViewerProps {
  beforeContent: string | null | undefined;
  afterContent: string | null | undefined;
  maxHeightClassName?: string;
  emptyLabel?: string;
}

export function splitContentLines(content: string | null | undefined): string[] {
  if (content === null || content === undefined) {
    return [];
  }

  const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!normalizedContent) {
    return [];
  }

  const lines = normalizedContent.split('\n');
  if (normalizedContent.endsWith('\n')) {
    lines.pop();
  }
  return lines;
}

export function buildInlineDiffLines(beforeContent: string | null | undefined, afterContent: string | null | undefined): InlineDiffLine[] {
  const beforeLines = splitContentLines(beforeContent);
  const afterLines = splitContentLines(afterContent);
  const beforeCount = beforeLines.length;
  const afterCount = afterLines.length;
  const diffLines: InlineDiffLine[] = [];
  const pushLine = (
    kind: InlineDiffLineKind,
    beforeLineNumber: number | null,
    afterLineNumber: number | null,
    text: string,
  ) => {
    diffLines.push({
      key: `${diffLines.length}:${kind}:${beforeLineNumber ?? ''}:${afterLineNumber ?? ''}`,
      kind,
      beforeLineNumber,
      afterLineNumber,
      text,
    });
  };

  let prefixCount = 0;
  while (
    prefixCount < beforeCount
    && prefixCount < afterCount
    && beforeLines[prefixCount] === afterLines[prefixCount]
  ) {
    pushLine('context', prefixCount + 1, prefixCount + 1, beforeLines[prefixCount] ?? '');
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

  if (beforeMiddleCount * afterMiddleCount > INLINE_DIFF_LCS_CELL_LIMIT) {
    for (let beforeIndex = beforeMiddleStart; beforeIndex < beforeMiddleEnd; beforeIndex += 1) {
      pushLine('deleted', beforeIndex + 1, null, beforeLines[beforeIndex] ?? '');
    }
    for (let afterIndex = afterMiddleStart; afterIndex < afterMiddleEnd; afterIndex += 1) {
      pushLine('added', null, afterIndex + 1, afterLines[afterIndex] ?? '');
    }
  } else {
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
        pushLine('context', beforeIndex + 1, afterIndex + 1, beforeLines[beforeIndex] ?? '');
        beforeOffset += 1;
        afterOffset += 1;
        continue;
      }

      if (table[beforeOffset + 1][afterOffset] >= table[beforeOffset][afterOffset + 1]) {
        pushLine('deleted', beforeIndex + 1, null, beforeLines[beforeIndex] ?? '');
        beforeOffset += 1;
      } else {
        pushLine('added', null, afterIndex + 1, afterLines[afterIndex] ?? '');
        afterOffset += 1;
      }
    }

    while (beforeOffset < beforeMiddleCount) {
      const beforeIndex = beforeMiddleStart + beforeOffset;
      pushLine('deleted', beforeIndex + 1, null, beforeLines[beforeIndex] ?? '');
      beforeOffset += 1;
    }

    while (afterOffset < afterMiddleCount) {
      const afterIndex = afterMiddleStart + afterOffset;
      pushLine('added', null, afterIndex + 1, afterLines[afterIndex] ?? '');
      afterOffset += 1;
    }
  }

  for (let suffixIndex = 0; suffixIndex < suffixCount; suffixIndex += 1) {
    const beforeIndex = beforeMiddleEnd + suffixIndex;
    const afterIndex = afterMiddleEnd + suffixIndex;
    pushLine('context', beforeIndex + 1, afterIndex + 1, beforeLines[beforeIndex] ?? '');
  }

  return diffLines;
}

function getDiffLineClassName(kind: InlineDiffLineKind): string {
  switch (kind) {
    case 'added':
      return 'border-[rgb(var(--success))/0.22] bg-[rgb(var(--success))/0.10] text-[rgb(var(--foreground))]';
    case 'deleted':
      return 'border-[rgb(var(--error))/0.24] bg-[rgb(var(--error))/0.16] text-[rgb(var(--foreground))]';
    case 'context':
    default:
      return 'border-transparent text-[rgb(var(--foreground))]';
  }
}

function getDiffMarkerClassName(kind: InlineDiffLineKind): string {
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

export function InlineDiffViewer({
  beforeContent,
  afterContent,
  maxHeightClassName = 'max-h-80',
  emptyLabel,
}: InlineDiffViewerProps) {
  const { t } = useI18n();
  const lines = React.useMemo(
    () => buildInlineDiffLines(beforeContent, afterContent),
    [afterContent, beforeContent],
  );
  const resolvedEmptyLabel = emptyLabel ?? t('codePane.emptyContent');

  if (lines.length === 0) {
    return (
      <div className="rounded border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--background))_76%,transparent)] px-3 py-3 text-xs text-[rgb(var(--muted-foreground))]">
        {resolvedEmptyLabel}
      </div>
    );
  }

  return (
    <div className={`min-h-0 overflow-auto rounded border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--background))_76%,transparent)] ${maxHeightClassName}`}>
      <div className="min-w-full py-1 font-mono text-[11px] leading-5">
        {lines.map((line) => {
          const marker = line.kind === 'added' ? '+' : line.kind === 'deleted' ? '-' : ' ';
          const lineNumber = line.kind === 'added'
            ? line.afterLineNumber
            : line.kind === 'deleted'
              ? line.beforeLineNumber
              : line.afterLineNumber ?? line.beforeLineNumber;

          return (
            <div
              key={line.key}
              className={`grid grid-cols-[22px_44px_minmax(0,1fr)] gap-2 border-l-2 px-2 ${getDiffLineClassName(line.kind)}`}
            >
              <span className={`select-none text-center font-semibold ${getDiffMarkerClassName(line.kind)}`}>
                {marker}
              </span>
              <span className="select-none text-right text-[rgb(var(--muted-foreground))]">
                {lineNumber ?? ''}
              </span>
              <code className="min-w-0 whitespace-pre-wrap break-words">
                {line.text || ' '}
              </code>
            </div>
          );
        })}
      </div>
    </div>
  );
}
