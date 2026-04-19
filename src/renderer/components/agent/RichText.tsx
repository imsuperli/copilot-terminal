import React from 'react';

function sanitizeHref(rawHref: string): string | null {
  const href = rawHref.trim();
  if (!href) {
    return null;
  }

  if (href.startsWith('/') || href.startsWith('#')) {
    return href;
  }

  try {
    const url = new URL(href);
    if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:') {
      return href;
    }
  } catch {
    return null;
  }

  return null;
}

function renderInlineFragments(content: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  let nodeIndex = 0;
  let textBuffer = '';

  const flushText = () => {
    if (!textBuffer) {
      return;
    }

    nodes.push(
      <React.Fragment key={`${keyPrefix}-text-${nodeIndex}`}>
        {textBuffer}
      </React.Fragment>,
    );
    nodeIndex += 1;
    textBuffer = '';
  };

  while (cursor < content.length) {
    const remaining = content.slice(cursor);

    if (remaining.startsWith('\\') && cursor + 1 < content.length) {
      textBuffer += content[cursor + 1];
      cursor += 2;
      continue;
    }

    if (remaining.startsWith('`')) {
      const closeIndex = content.indexOf('`', cursor + 1);
      if (closeIndex > cursor + 1) {
        flushText();
        nodes.push(
          <code
            key={`${keyPrefix}-code-${nodeIndex}`}
            className="rounded bg-[color-mix(in_srgb,rgb(var(--secondary))_86%,transparent)] px-1.5 py-0.5 font-mono text-[12px] text-[rgb(var(--primary))]"
          >
            {content.slice(cursor + 1, closeIndex)}
          </code>,
        );
        nodeIndex += 1;
        cursor = closeIndex + 1;
        continue;
      }
    }

    if (remaining.startsWith('**') || remaining.startsWith('__')) {
      const marker = remaining.slice(0, 2);
      const closeIndex = content.indexOf(marker, cursor + 2);
      if (closeIndex > cursor + 2) {
        flushText();
        nodes.push(
          <strong key={`${keyPrefix}-strong-${nodeIndex}`} className="font-semibold text-inherit">
            {renderInlineFragments(content.slice(cursor + 2, closeIndex), `${keyPrefix}-strong-${nodeIndex}`)}
          </strong>,
        );
        nodeIndex += 1;
        cursor = closeIndex + 2;
        continue;
      }
    }

    if (remaining.startsWith('~~')) {
      const closeIndex = content.indexOf('~~', cursor + 2);
      if (closeIndex > cursor + 2) {
        flushText();
        nodes.push(
          <del key={`${keyPrefix}-del-${nodeIndex}`} className="opacity-80">
            {renderInlineFragments(content.slice(cursor + 2, closeIndex), `${keyPrefix}-del-${nodeIndex}`)}
          </del>,
        );
        nodeIndex += 1;
        cursor = closeIndex + 2;
        continue;
      }
    }

    if (remaining.startsWith('*') || remaining.startsWith('_')) {
      const marker = remaining[0];
      const closeIndex = content.indexOf(marker, cursor + 1);
      if (closeIndex > cursor + 1) {
        flushText();
        nodes.push(
          <em key={`${keyPrefix}-em-${nodeIndex}`} className="italic text-inherit">
            {renderInlineFragments(content.slice(cursor + 1, closeIndex), `${keyPrefix}-em-${nodeIndex}`)}
          </em>,
        );
        nodeIndex += 1;
        cursor = closeIndex + 1;
        continue;
      }
    }

    if (remaining.startsWith('[')) {
      const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
      if (linkMatch) {
        const safeHref = sanitizeHref(linkMatch[2]);
        if (safeHref) {
          flushText();
          nodes.push(
            <a
              key={`${keyPrefix}-link-${nodeIndex}`}
              href={safeHref}
              target="_blank"
              rel="noreferrer"
              className="text-[rgb(var(--primary))] underline decoration-[rgba(var(--primary),0.45)] underline-offset-4 transition-opacity hover:opacity-85"
            >
              {renderInlineFragments(linkMatch[1], `${keyPrefix}-link-${nodeIndex}`)}
            </a>,
          );
          nodeIndex += 1;
          cursor += linkMatch[0].length;
          continue;
        }
      }
    }

    textBuffer += content[cursor];
    cursor += 1;
  }

  flushText();
  return nodes;
}

function renderInlineContent(content: string, keyPrefix: string): React.ReactNode[] {
  const lines = content.split('\n');

  return lines.flatMap((line, lineIndex) => {
    const lineNodes = renderInlineFragments(line, `${keyPrefix}-line-${lineIndex}`);
    if (lineIndex === lines.length - 1) {
      return lineNodes;
    }

    return [
      ...lineNodes,
      <br key={`${keyPrefix}-br-${lineIndex}`} />,
    ];
  });
}

function isHorizontalRule(line: string): boolean {
  return /^(?:\s*)([-*_])(?:\s*\1){2,}\s*$/.test(line);
}

function matchHeading(line: string): RegExpMatchArray | null {
  return line.match(/^\s*(#{1,6})\s+(.*)$/);
}

function isBlockquoteLine(line: string): boolean {
  return /^\s*>\s?/.test(line);
}

function matchListItem(line: string): RegExpMatchArray | null {
  return line.match(/^(\s*)([-+*]|\d+\.)\s+(.*)$/);
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(line);
}

function looksLikeTableRow(line: string): boolean {
  return line.includes('|');
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function isFenceStart(line: string): RegExpMatchArray | null {
  return line.match(/^\s*```([^`]*)\s*$/);
}

function isSpecialBlockStart(lines: string[], index: number): boolean {
  const line = lines[index];

  return Boolean(
    isFenceStart(line)
      || matchHeading(line)
      || isHorizontalRule(line)
      || isBlockquoteLine(line)
      || matchListItem(line)
      || (index + 1 < lines.length && looksLikeTableRow(line) && isTableSeparator(lines[index + 1])),
  );
}

function renderNestedBlocks(content: string, keyPrefix: string): React.ReactNode {
  const blocks = renderMarkdownBlocks(content, keyPrefix);

  if (blocks.length === 0) {
    return null;
  }

  return <div className="space-y-2">{blocks}</div>;
}

function renderMarkdownBlocks(content: string, keyPrefix: string): React.ReactNode[] {
  const normalizedContent = content.replace(/\r\n?/g, '\n').trim();
  if (!normalizedContent) {
    return [];
  }

  const blocks: React.ReactNode[] = [];
  const lines = normalizedContent.split('\n');
  let index = 0;
  let blockIndex = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fenceMatch = isFenceStart(line);
    if (fenceMatch) {
      const language = fenceMatch[1].trim();
      const codeLines: string[] = [];
      let cursor = index + 1;

      while (cursor < lines.length && !/^\s*```/.test(lines[cursor])) {
        codeLines.push(lines[cursor]);
        cursor += 1;
      }

      const hasClosingFence = cursor < lines.length && /^\s*```/.test(lines[cursor]);
      blocks.push(
        <div
          key={`${keyPrefix}-codeblock-${blockIndex}`}
          className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--background))_86%,transparent)]"
        >
          <div className="flex items-center justify-between border-b border-[rgb(var(--border))] px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-[rgb(var(--muted-foreground))]">
            <span>{language || 'text'}</span>
          </div>
          <pre className="overflow-x-auto px-3 py-2.5 text-[12px] leading-5 text-[rgb(var(--foreground))]">
            <code>{codeLines.join('\n')}</code>
          </pre>
        </div>,
      );
      blockIndex += 1;
      index = hasClosingFence ? cursor + 1 : lines.length;
      continue;
    }

    if (index + 1 < lines.length && looksLikeTableRow(line) && isTableSeparator(lines[index + 1])) {
      const headerCells = splitTableRow(line);
      const bodyRows: string[][] = [];
      let cursor = index + 2;

      while (cursor < lines.length && lines[cursor].trim() && looksLikeTableRow(lines[cursor])) {
        bodyRows.push(splitTableRow(lines[cursor]));
        cursor += 1;
      }

      blocks.push(
        <div
          key={`${keyPrefix}-table-${blockIndex}`}
          className="overflow-x-auto rounded-2xl border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--background))_66%,transparent)]"
        >
          <table className="min-w-full border-collapse text-left text-[14px] leading-5 text-inherit">
            <thead className="bg-[color-mix(in_srgb,rgb(var(--secondary))_72%,transparent)]">
              <tr>
                {headerCells.map((cell, cellIndex) => (
                  <th
                    key={`${keyPrefix}-table-${blockIndex}-head-${cellIndex}`}
                    className="border-b border-[rgb(var(--border))] px-4 py-2.5 font-semibold text-[rgb(var(--foreground))]"
                  >
                    {renderInlineContent(cell, `${keyPrefix}-table-${blockIndex}-head-${cellIndex}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row, rowIndex) => (
                <tr key={`${keyPrefix}-table-${blockIndex}-row-${rowIndex}`} className="border-b border-[rgb(var(--border))]/70 last:border-b-0">
                  {headerCells.map((_, cellIndex) => (
                    <td
                      key={`${keyPrefix}-table-${blockIndex}-row-${rowIndex}-cell-${cellIndex}`}
                      className="px-4 py-2.5 align-top text-[rgb(var(--foreground))]"
                    >
                      {renderInlineContent(row[cellIndex] ?? '', `${keyPrefix}-table-${blockIndex}-row-${rowIndex}-cell-${cellIndex}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      blockIndex += 1;
      index = cursor;
      continue;
    }

    const headingMatch = matchHeading(line);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingClass = (
        level === 1 ? 'text-[1.65em]'
        : level === 2 ? 'text-[1.4em]'
        : level === 3 ? 'text-[1.22em]'
        : 'text-[1.05em]'
      );

      const HeadingTag = `h${Math.min(level, 6)}` as keyof JSX.IntrinsicElements;
      blocks.push(
        <HeadingTag
          key={`${keyPrefix}-heading-${blockIndex}`}
          className={`${headingClass} font-semibold tracking-tight text-inherit`}
        >
          {renderInlineContent(headingMatch[2].trim(), `${keyPrefix}-heading-${blockIndex}`)}
        </HeadingTag>,
      );
      blockIndex += 1;
      index += 1;
      continue;
    }

    if (isHorizontalRule(line)) {
      blocks.push(
        <hr
          key={`${keyPrefix}-rule-${blockIndex}`}
          className="border-[rgb(var(--border))]"
        />,
      );
      blockIndex += 1;
      index += 1;
      continue;
    }

    if (isBlockquoteLine(line)) {
      const quoteLines: string[] = [];
      let cursor = index;

      while (cursor < lines.length && (isBlockquoteLine(lines[cursor]) || !lines[cursor].trim())) {
        if (!lines[cursor].trim()) {
          quoteLines.push('');
        } else {
          quoteLines.push(lines[cursor].replace(/^\s*>\s?/, ''));
        }
        cursor += 1;
      }

      blocks.push(
        <blockquote
          key={`${keyPrefix}-quote-${blockIndex}`}
          className="border-l-2 border-[rgb(var(--border))] pl-3 text-[rgb(var(--muted-foreground))]"
        >
          {renderNestedBlocks(quoteLines.join('\n'), `${keyPrefix}-quote-${blockIndex}`)}
        </blockquote>,
      );
      blockIndex += 1;
      index = cursor;
      continue;
    }

    const listMatch = matchListItem(line);
    if (listMatch) {
      const ordered = /\d+\./.test(listMatch[2]);
      const items: string[] = [];
      let cursor = index;

      while (cursor < lines.length) {
        const currentMatch = matchListItem(lines[cursor]);
        if (!currentMatch || /\d+\./.test(currentMatch[2]) !== ordered) {
          break;
        }

        const itemIndent = currentMatch[1].length;
        const itemLines = [currentMatch[3]];
        cursor += 1;

        while (cursor < lines.length) {
          if (!lines[cursor].trim()) {
            break;
          }

          const nextMatch = matchListItem(lines[cursor]);
          if (nextMatch && nextMatch[1].length === itemIndent && /\d+\./.test(nextMatch[2]) === ordered) {
            break;
          }

          itemLines.push(lines[cursor].slice(Math.min(lines[cursor].length, itemIndent + 2)));
          cursor += 1;
        }

        items.push(itemLines.join('\n').trim());

        while (cursor < lines.length && !lines[cursor].trim()) {
          cursor += 1;
        }
      }

      const ListTag = ordered ? 'ol' : 'ul';
      blocks.push(
        <ListTag
          key={`${keyPrefix}-list-${blockIndex}`}
          className={`${ordered ? 'list-decimal' : 'list-disc'} space-y-1 pl-6 text-inherit`}
        >
          {items.map((item, itemIndex) => (
            <li key={`${keyPrefix}-list-${blockIndex}-item-${itemIndex}`} className="pl-1">
              {renderNestedBlocks(item, `${keyPrefix}-list-${blockIndex}-item-${itemIndex}`)}
            </li>
          ))}
        </ListTag>,
      );
      blockIndex += 1;
      index = cursor;
      continue;
    }

    const paragraphLines = [line.trimEnd()];
    let cursor = index + 1;

    while (cursor < lines.length && lines[cursor].trim() && !isSpecialBlockStart(lines, cursor)) {
      paragraphLines.push(lines[cursor].trimEnd());
      cursor += 1;
    }

    blocks.push(
      <p
        key={`${keyPrefix}-paragraph-${blockIndex}`}
        className="break-words leading-6 text-inherit"
      >
        {renderInlineContent(paragraphLines.join('\n'), `${keyPrefix}-paragraph-${blockIndex}`)}
      </p>,
    );
    blockIndex += 1;
    index = cursor;
  }

  return blocks;
}

export function renderMarkdownLike(content: string): React.ReactNode {
  const blocks = renderMarkdownBlocks(content, 'markdown');
  if (blocks.length === 0) {
    return null;
  }

  return blocks;
}
