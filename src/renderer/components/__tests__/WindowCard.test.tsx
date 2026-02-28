import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WindowCard } from '../WindowCard';
import { Window, WindowStatus } from '../../types/window';

describe('WindowCard', () => {
  const mockWindow: Window = {
    id: '123',
    name: 'Test Window',
    workingDirectory: '/home/user/project',
    command: 'claude',
    status: WindowStatus.Running,
    pid: 1234,
    createdAt: '2024-01-01T10:00:00Z',
    lastActiveAt: '2024-01-01T10:30:00Z',
    model: 'Claude Opus 4.6',
    lastOutput: 'Some output text'
  };

  it('renders window name', () => {
    render(<WindowCard window={mockWindow} />);
    expect(screen.getByText('Test Window')).toBeInTheDocument();
  });

  it('renders working directory', () => {
    render(<WindowCard window={mockWindow} />);
    expect(screen.getByText('/home/user/project')).toBeInTheDocument();
  });

  it('renders model name', () => {
    render(<WindowCard window={mockWindow} />);
    expect(screen.getByText('Claude Opus 4.6')).toBeInTheDocument();
  });

  it('renders last output', () => {
    render(<WindowCard window={mockWindow} />);
    expect(screen.getByText('Some output text')).toBeInTheDocument();
  });

  it('renders status label for running status', () => {
    render(<WindowCard window={mockWindow} />);
    expect(screen.getByText('运行中')).toBeInTheDocument();
  });

  it('renders status label for waiting status', () => {
    const waitingWindow = { ...mockWindow, status: WindowStatus.WaitingForInput };
    render(<WindowCard window={waitingWindow} />);
    expect(screen.getByText('等待输入')).toBeInTheDocument();
  });

  it('renders status label for completed status', () => {
    const completedWindow = { ...mockWindow, status: WindowStatus.Completed };
    render(<WindowCard window={completedWindow} />);
    expect(screen.getByText('已完成')).toBeInTheDocument();
  });

  it('renders status label for error status', () => {
    const errorWindow = { ...mockWindow, status: WindowStatus.Error };
    render(<WindowCard window={errorWindow} />);
    expect(screen.getByText('出错')).toBeInTheDocument();
  });

  it('renders status label for restoring status', () => {
    const restoringWindow = { ...mockWindow, status: WindowStatus.Restoring };
    render(<WindowCard window={restoringWindow} />);
    expect(screen.getByText('恢复中')).toBeInTheDocument();
  });

  it('applies correct status color for running', () => {
    const { container } = render(<WindowCard window={mockWindow} />);
    const statusBar = container.querySelector('[data-testid="status-bar"]');
    expect(statusBar).toHaveClass('bg-blue-500');
  });

  it('applies correct status color for waiting', () => {
    const waitingWindow = { ...mockWindow, status: WindowStatus.WaitingForInput };
    const { container } = render(<WindowCard window={waitingWindow} />);
    const statusBar = container.querySelector('[data-testid="status-bar"]');
    expect(statusBar).toHaveClass('bg-amber-500');
  });

  it('applies correct status color for completed', () => {
    const completedWindow = { ...mockWindow, status: WindowStatus.Completed };
    const { container } = render(<WindowCard window={completedWindow} />);
    const statusBar = container.querySelector('[data-testid="status-bar"]');
    expect(statusBar).toHaveClass('bg-green-500');
  });

  it('applies correct status color for error', () => {
    const errorWindow = { ...mockWindow, status: WindowStatus.Error };
    const { container } = render(<WindowCard window={errorWindow} />);
    const statusBar = container.querySelector('[data-testid="status-bar"]');
    expect(statusBar).toHaveClass('bg-red-500');
  });

  it('applies correct status color for restoring', () => {
    const restoringWindow = { ...mockWindow, status: WindowStatus.Restoring };
    const { container } = render(<WindowCard window={restoringWindow} />);
    const statusBar = container.querySelector('[data-testid="status-bar"]');
    expect(statusBar).toHaveClass('bg-gray-500');
  });

  it('calls onClick when clicked', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<WindowCard window={mockWindow} onClick={onClick} />);

    const card = screen.getByRole('button');
    await user.click(card);

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('calls onClick when Enter key is pressed', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<WindowCard window={mockWindow} onClick={onClick} />);

    const card = screen.getByRole('button');
    card.focus();
    await user.keyboard('{Enter}');

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('calls onClick when Space key is pressed', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<WindowCard window={mockWindow} onClick={onClick} />);

    const card = screen.getByRole('button');
    card.focus();
    await user.keyboard(' ');

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('has correct accessibility attributes', () => {
    render(<WindowCard window={mockWindow} />);
    const card = screen.getByRole('button');

    expect(card).toHaveAttribute('tabIndex', '0');
    expect(card).toHaveAttribute('aria-label');
    expect(card.getAttribute('aria-label')).toContain('Test Window');
    expect(card.getAttribute('aria-label')).toContain('运行中');
  });

  it('truncates long working directory path', () => {
    const longPathWindow = {
      ...mockWindow,
      workingDirectory: '/very/long/path/that/should/be/truncated/in/the/display'
    };
    const { container } = render(<WindowCard window={longPathWindow} />);
    const pathElement = container.querySelector('[data-testid="working-directory"]');
    expect(pathElement).toHaveClass('truncate');
  });
});

