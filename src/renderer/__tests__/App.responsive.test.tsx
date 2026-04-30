import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderApp, setViewport } from './appTestUtils';

async function renderAppAtSize(width: number, height: number) {
  setViewport(width, height);
  return renderApp();
}

describe('App - Responsive Layout', () => {
  it('maintains the shell layout at minimum window size (480x360)', async () => {
    const { container } = await renderAppAtSize(480, 360);
    const layout = container.querySelector('.h-screen');
    expect(layout).toBeInTheDocument();
    expect(screen.getByText('Synapse')).toBeInTheDocument();
    expect(screen.getByRole('complementary')).toHaveClass('w-64');
    expect(screen.getByRole('heading', { level: 2, name: '欢迎使用 Synapse' })).toBeInTheDocument();
  });

  it('maintains the shell layout at standard window size (1024x768)', async () => {
    const { container } = await renderAppAtSize(1024, 768);
    const layout = container.querySelector('.h-screen');
    expect(layout).toBeInTheDocument();
    expect(screen.getByText('Synapse')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveClass('flex-1', 'overflow-auto');
    expect(screen.getByRole('heading', { level: 2, name: '欢迎使用 Synapse' })).toBeInTheDocument();
  });

  it('maintains the shell layout at large window size (1920x1080)', async () => {
    const { container } = await renderAppAtSize(1920, 1080);
    const layout = container.querySelector('.h-screen');
    expect(layout).toBeInTheDocument();
    expect(screen.getByText('Synapse')).toBeInTheDocument();
    expect(screen.getByRole('complementary')).toHaveClass('flex', 'flex-col');
    expect(screen.getByRole('heading', { level: 2, name: '欢迎使用 Synapse' })).toBeInTheDocument();
  });

  it('keeps the custom title bar at a fixed height', async () => {
    const { container } = await renderApp();
    const titleBar = container.querySelector('.h-8.border-b.select-none');
    expect(titleBar).toHaveClass('h-8');
  });

  it('keeps the content wrapper filling the remaining height', async () => {
    const { container } = await renderApp();
    const contentWrapper = container.querySelector('.flex-1.overflow-hidden');
    expect(contentWrapper).toHaveClass('flex-1', 'overflow-hidden');
  });

  it('centers the empty state content', async () => {
    await renderApp();
    const emptyStateContainer = screen.getByRole('heading', {
      level: 2,
      name: '欢迎使用 Synapse',
    }).parentElement;
    expect(emptyStateContainer).toHaveClass('flex', 'flex-col', 'items-center', 'justify-center', 'h-full');
  });

  it('does not introduce horizontal scrolling on the root shell', async () => {
    const { container } = await renderApp();
    const layout = container.querySelector('.h-screen');
    expect(layout).not.toHaveClass('overflow-x-scroll');
  });

  it('allows vertical scrolling in the main content area', async () => {
    await renderApp();
    const main = screen.getByRole('main');
    expect(main).toHaveClass('overflow-auto');
  });
});
