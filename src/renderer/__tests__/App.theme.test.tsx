import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';

describe('App - Dark Theme and Design Tokens', () => {
  it('should apply dark theme background color (#0a0a0a) to main layout', () => {
    const { container } = render(<App />);

    const layout = container.querySelector('.bg-bg-app');
    expect(layout).toBeInTheDocument();
  });

  it('should apply card background color to toolbar', () => {
    const { container } = render(<App />);

    const header = container.querySelector('header');
    expect(header).toHaveClass('bg-bg-card');
  });

  it('should apply primary text color to app name', () => {
    render(<App />);

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveClass('text-text-primary');
  });

  it('should apply secondary text color to version', () => {
    render(<App />);

    const version = screen.getByText('v0.1.0');
    expect(version).toHaveClass('text-text-secondary');
  });

  it('should apply primary text color to empty state guidance', () => {
    render(<App />);

    const guidance = screen.getByText('创建你的第一个任务窗口');
    expect(guidance).toHaveClass('text-text-primary');
  });

  it('should apply subtle border to toolbar', () => {
    const { container } = render(<App />);

    const header = container.querySelector('header');
    expect(header).toHaveClass('border-b', 'border-border-subtle');
  });

  it('should use correct spacing for toolbar height (56px / h-14)', () => {
    const { container } = render(<App />);

    const header = container.querySelector('header');
    expect(header).toHaveClass('h-14'); // 14 * 4px = 56px
  });

  it('should use correct spacing for toolbar padding', () => {
    const { container } = render(<App />);

    const header = container.querySelector('header');
    expect(header).toHaveClass('px-6'); // Horizontal padding
  });

  it('should use correct spacing for empty state text margin', () => {
    render(<App />);

    const guidance = screen.getByText('创建你的第一个任务窗口');
    expect(guidance).toHaveClass('mb-6'); // Bottom margin
  });

  it('should apply status-running color to primary button', () => {
    render(<App />);

    const button = screen.getByRole('button', { name: '+ 新建窗口' });
    // Button component uses bg-status-running for primary variant
    expect(button).toHaveClass('bg-status-running');
  });

  it('should maintain consistent design token usage across components', () => {
    const { container } = render(<App />);

    // Verify all components use design tokens (not hardcoded colors)
    const elementsWithBgApp = container.querySelectorAll('.bg-bg-app');
    expect(elementsWithBgApp.length).toBeGreaterThan(0);

    const elementsWithBgCard = container.querySelectorAll('.bg-bg-card');
    expect(elementsWithBgCard.length).toBeGreaterThan(0);

    const elementsWithTextPrimary = container.querySelectorAll('.text-text-primary');
    expect(elementsWithTextPrimary.length).toBeGreaterThan(0);

    const elementsWithTextSecondary = container.querySelectorAll('.text-text-secondary');
    expect(elementsWithTextSecondary.length).toBeGreaterThan(0);
  });
});
