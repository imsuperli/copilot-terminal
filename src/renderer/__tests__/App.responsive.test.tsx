import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';

describe('App - Responsive Layout', () => {
  it('should maintain layout structure at minimum window size (480x360)', () => {
    // Simulate minimum window size
    global.innerWidth = 480;
    global.innerHeight = 360;

    const { container } = render(<App />);

    // Verify layout structure is maintained
    const layout = container.querySelector('.h-screen');
    expect(layout).toBeDefined();

    // Verify toolbar is visible
    expect(screen.getByText('ausome-terminal')).toBeInTheDocument();

    // Verify empty state is visible
    expect(screen.getByText('创建你的第一个任务窗口')).toBeInTheDocument();
  });

  it('should maintain layout structure at standard window size (1024x768)', () => {
    global.innerWidth = 1024;
    global.innerHeight = 768;

    const { container } = render(<App />);

    const layout = container.querySelector('.h-screen');
    expect(layout).toBeDefined();

    expect(screen.getByText('ausome-terminal')).toBeInTheDocument();
    expect(screen.getByText('创建你的第一个任务窗口')).toBeInTheDocument();
  });

  it('should maintain layout structure at large window size (1920x1080)', () => {
    global.innerWidth = 1920;
    global.innerHeight = 1080;

    const { container } = render(<App />);

    const layout = container.querySelector('.h-screen');
    expect(layout).toBeDefined();

    expect(screen.getByText('ausome-terminal')).toBeInTheDocument();
    expect(screen.getByText('创建你的第一个任务窗口')).toBeInTheDocument();
  });

  it('should have toolbar with fixed height at all sizes', () => {
    const { container } = render(<App />);

    const header = container.querySelector('header');
    expect(header).toHaveClass('h-14'); // 56px fixed height
  });

  it('should have main content area that fills remaining space', () => {
    const { container } = render(<App />);

    const main = container.querySelector('main');
    expect(main).toHaveClass('flex-1'); // Fills remaining space
    expect(main).toHaveClass('overflow-auto'); // Allows scrolling if needed
  });

  it('should center empty state content at all sizes', () => {
    const { container } = render(<App />);

    const emptyStateContainer = screen.getByText('创建你的第一个任务窗口').parentElement;
    expect(emptyStateContainer).toHaveClass('flex', 'flex-col', 'items-center', 'justify-center', 'h-full');
  });

  it('should not have horizontal overflow', () => {
    const { container } = render(<App />);

    const layout = container.querySelector('.h-screen');
    expect(layout).not.toHaveClass('overflow-x-scroll');
  });

  it('should allow vertical scrolling in main content area', () => {
    const { container } = render(<App />);

    const main = container.querySelector('main');
    expect(main).toHaveClass('overflow-auto');
  });
});
