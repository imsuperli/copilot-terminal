import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NewWindowCard } from '../NewWindowCard';

describe('NewWindowCard', () => {
  it('renders the + icon', () => {
    render(<NewWindowCard onClick={vi.fn()} />);
    expect(screen.getByText('+')).toBeInTheDocument();
  });

  it('renders the label text', () => {
    render(<NewWindowCard onClick={vi.fn()} />);
    expect(screen.getByText('新建终端')).toBeInTheDocument();
  });

  it('has correct aria-label', () => {
    render(<NewWindowCard onClick={vi.fn()} />);
    expect(screen.getByRole('button', { name: '新建窗口' })).toBeInTheDocument();
  });

  it('has tabIndex 0 for keyboard navigation', () => {
    render(<NewWindowCard onClick={vi.fn()} />);
    const card = screen.getByRole('button', { name: '新建窗口' });
    expect(card).toHaveAttribute('tabindex', '0');
  });

  it('calls onClick when clicked', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<NewWindowCard onClick={handleClick} />);

    await user.click(screen.getByRole('button', { name: '新建窗口' }));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('calls onClick when Enter key is pressed', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<NewWindowCard onClick={handleClick} />);

    const card = screen.getByRole('button', { name: '新建窗口' });
    card.focus();
    await user.keyboard('{Enter}');
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('calls onClick when Space key is pressed', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<NewWindowCard onClick={handleClick} />);

    const card = screen.getByRole('button', { name: '新建窗口' });
    card.focus();
    await user.keyboard(' ');
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('has dashed border classes', () => {
    render(<NewWindowCard onClick={vi.fn()} />);
    const card = screen.getByTestId('new-window-card');
    expect(card).toHaveClass('border-dashed');
    expect(card).toHaveClass('border-[rgb(var(--border))]');
  });

  it('has correct height class matching WindowCard (h-56)', () => {
    render(<NewWindowCard onClick={vi.fn()} />);
    const card = screen.getByTestId('new-window-card');
    expect(card).toHaveClass('h-56');
  });

  it('has hover classes for visual feedback', () => {
    render(<NewWindowCard onClick={vi.fn()} />);
    const card = screen.getByTestId('new-window-card');
    expect(card).toHaveClass('hover:border-[rgb(var(--primary))]');
    expect(card).toHaveClass('hover:shadow-[0_22px_44px_rgba(0,0,0,0.16)]');
  });

  it('has focus ring class for accessibility', () => {
    render(<NewWindowCard onClick={vi.fn()} />);
    const card = screen.getByTestId('new-window-card');
    expect(card).toHaveClass('focus:ring-2');
    expect(card).toHaveClass('focus:ring-[rgb(var(--ring))]');
  });
});
