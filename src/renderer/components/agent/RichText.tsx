import React from 'react';

interface InlineCodeFragment {
  type: 'text' | 'code';
  value: string;
}

function splitInlineCode(content: string): InlineCodeFragment[] {
  if (!content.includes('`')) {
    return [{ type: 'text', value: content }];
  }

  const parts = content.split(/(`[^`]+`)/g).filter(Boolean);
  return parts.map((part) => (
    part.startsWith('`') && part.endsWith('`')
      ? { type: 'code', value: part.slice(1, -1) }
      : { type: 'text', value: part }
  ));
}

function renderTextBlock(content: string, keyPrefix: string): React.ReactNode {
  const paragraphs = content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return null;
  }

  return paragraphs.map((paragraph, paragraphIndex) => (
    <p
      key={`${keyPrefix}-paragraph-${paragraphIndex}`}
      className="whitespace-pre-wrap break-words leading-7 text-inherit"
    >
      {splitInlineCode(paragraph).map((fragment, fragmentIndex) => (
        fragment.type === 'code' ? (
          <code
            key={`${keyPrefix}-fragment-${fragmentIndex}`}
            className="rounded bg-zinc-900/90 px-1.5 py-0.5 font-mono text-[12px] text-[rgb(var(--primary))]"
          >
            {fragment.value}
          </code>
        ) : (
          <React.Fragment key={`${keyPrefix}-fragment-${fragmentIndex}`}>
            {fragment.value}
          </React.Fragment>
        )
      ))}
    </p>
  ));
}

export function renderMarkdownLike(content: string): React.ReactNode {
  if (!content.trim()) {
    return null;
  }

  const sections: React.ReactNode[] = [];
  const codeFencePattern = /```([^\n`]*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeFencePattern.exec(content)) !== null) {
    const [fullMatch, language, code] = match;
    const precedingText = content.slice(lastIndex, match.index);
    if (precedingText.trim()) {
      sections.push(
        <div key={`text-${lastIndex}`} className="space-y-3">
          {renderTextBlock(precedingText, `text-${lastIndex}`)}
        </div>,
      );
    }

    sections.push(
      <div
        key={`code-${match.index}`}
        className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/95"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-zinc-400">
          <span>{language || 'text'}</span>
        </div>
        <pre className="overflow-x-auto px-3 py-3 text-[12px] leading-6 text-zinc-100">
          <code>{code.replace(/\n$/, '')}</code>
        </pre>
      </div>,
    );

    lastIndex = match.index + fullMatch.length;
  }

  const trailingText = content.slice(lastIndex);
  if (trailingText.trim()) {
    sections.push(
      <div key={`text-${lastIndex}`} className="space-y-3">
        {renderTextBlock(trailingText, `text-${lastIndex}`)}
      </div>,
    );
  }

  return sections;
}
