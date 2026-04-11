import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderApp } from './appTestUtils';

function hasClassToken(container: HTMLElement, token: string) {
  return Array.from(container.querySelectorAll('*')).some((element) => (
    typeof element.className === 'string' && element.className.split(/\s+/).includes(token)
  ));
}

describe('App - Dark Theme and Design Tokens', () => {
  it('uses the dark custom title bar chrome', async () => {
    const { container } = await renderApp();
    const titleBar = Array.from(container.querySelectorAll('div')).find((element) => (
      typeof element.className === 'string'
      && element.className.split(/\s+/).includes('bg-[rgb(var(--titlebar))]')
    ));
    expect(titleBar).toHaveClass('flex', 'items-center', 'justify-between');
  });

  it('styles the title bar app name with the current text token', async () => {
    await renderApp();
    expect(screen.getByText('Copilot-Terminal')).toHaveClass(
      'text-sm',
      'font-medium',
      'text-[rgb(var(--titlebar-foreground))]',
    );
  });

  it('applies background tokens to the split layout shell', async () => {
    await renderApp();
    const main = screen.getByRole('main');
    expect(main).toHaveClass('bg-[rgb(var(--background))]');
    expect(main.parentElement).toHaveClass('flex', 'h-full', 'bg-[rgb(var(--background))]');
  });

  it('applies sidebar background and border tokens', async () => {
    await renderApp();
    expect(screen.getByRole('complementary')).toHaveClass(
      'bg-[rgb(var(--sidebar))]',
      'border-r',
      'border-[rgb(var(--border))]',
    );
  });

  it('styles section headings with the muted foreground token', async () => {
    await renderApp();
    expect(screen.getByRole('heading', { level: 3, name: '状态统计' })).toHaveClass(
      'text-[rgb(var(--muted-foreground))]',
      'tracking-wide',
    );
  });

  it('styles the empty state heading and description with current tokens', async () => {
    await renderApp();
    expect(screen.getByRole('heading', { level: 2, name: '欢迎使用 Copilot-Terminal' })).toHaveClass(
      'text-[rgb(var(--foreground))]',
      'mb-2',
    );
    expect(screen.getByText('创建你的第一个终端窗口开始工作')).toHaveClass(
      'text-[rgb(var(--muted-foreground))]',
      'mb-8',
    );
  });

  it('styles primary create buttons with the primary color tokens', async () => {
    await renderApp();
    const buttons = await screen.findAllByRole('button', { name: '新建终端' });
    buttons.forEach((button) => {
      expect(button).toHaveClass('bg-[rgb(var(--primary))]', 'text-[rgb(var(--primary-foreground))]');
    });
  });

  it('keeps the expected design-token classes present across the shell', async () => {
    const { container } = await renderApp();
    expect(hasClassToken(container, 'bg-[rgb(var(--background))]')).toBe(true);
    expect(hasClassToken(container, 'bg-[rgb(var(--sidebar))]')).toBe(true);
    expect(hasClassToken(container, 'text-[rgb(var(--foreground))]')).toBe(true);
    expect(hasClassToken(container, 'text-[rgb(var(--muted-foreground))]')).toBe(true);
  });
});
