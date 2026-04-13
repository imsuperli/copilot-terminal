import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import React from 'react';
import { renderMarkdownLike } from '../RichText';

function RichTextHarness({ content }: { content: string }) {
  return <div>{renderMarkdownLike(content)}</div>;
}

describe('RichText', () => {
  it('renders markdown headings, links, and lists as document content', () => {
    render(
      <RichTextHarness
        content={[
          '# Deployment Guide',
          '',
          'Visit the [status page](https://example.com/status).',
          '',
          '- Check nginx',
          '- **Review** error logs',
        ].join('\n')}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Deployment Guide', level: 1 })).toBeInTheDocument();
    expect(screen.queryByText('# Deployment Guide')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'status page' })).toHaveAttribute('href', 'https://example.com/status');

    const list = screen.getByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText('Check nginx')).toBeInTheDocument();
    expect(within(items[1]).getByText('Review', { selector: 'strong' })).toBeInTheDocument();
  });

  it('renders tables and keeps fenced code blocks in code view', () => {
    render(
      <RichTextHarness
        content={[
          '| Service | Status |',
          '| --- | --- |',
          '| nginx | running |',
          '| redis | healthy |',
          '',
          '```bash',
          'systemctl status nginx',
          '```',
        ].join('\n')}
      />,
    );

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('nginx')).toBeInTheDocument();
    expect(screen.getByText('healthy')).toBeInTheDocument();
    expect(screen.getByText('bash')).toBeInTheDocument();
    expect(screen.getByText('systemctl status nginx')).toBeInTheDocument();
  });

  it('keeps rendering while a streamed code fence is still incomplete', () => {
    render(
      <RichTextHarness
        content={[
          '## Live Output',
          '',
          '```json',
          '{',
          '  "status": "streaming"',
        ].join('\n')}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Live Output', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('json')).toBeInTheDocument();
    expect(screen.getByText((value) => value.includes('"status": "streaming"'))).toBeInTheDocument();
  });
});
