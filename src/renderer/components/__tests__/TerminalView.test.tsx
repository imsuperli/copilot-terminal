import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TerminalView } from '../TerminalView';
import { Window, WindowStatus } from '../../types/window';

// Mock @xterm/xterm and @xterm/addon-fit — jsdom has no canvas/WebGL
vi.mock('@xterm/xterm', () => {
  const onDataCallbacks: Array<(data: string) => void> = [];
  const onSelectionChangeCallbacks: Array<() => void> = [];

  const Terminal = vi.fn().mockImplementation(() => ({
    loadAddon: vi.fn(),
    open: vi.fn(),
    focus: vi.fn(),
    dispose: vi.fn(),
    write: vi.fn(),
    getSelection: vi.fn().mockReturnValue(''),
    onData: vi.fn((cb: (data: string) => void) => {
      onDataCallbacks.push(cb);
      return { dispose: vi.fn() };
    }),
    onSelectionChange: vi.fn((cb: () => void) => {
      onSelectionChangeCallbacks.push(cb);
      return { dispose: vi.fn() };
    }),
    cols: 80,
    rows: 30,
  }));

  return { Terminal };
});

vi.mock('../../utils/xtermAddonFit', () => {
  const FitAddon = vi.fn().mockImplementation(() => ({
    fit: vi.fn(),
  }));
  return { FitAddon };
});

// Mock xterm CSS import
vi.mock('../../styles/xterm.css', () => ({}));

const mockWindow: Window = {
  id: 'win-001',
  name: 'Test Terminal',
  workingDirectory: '/home/user/project',
  command: 'claude',
  status: WindowStatus.Running,
  pid: 1234,
  createdAt: '2024-01-01T10:00:00Z',
  lastActiveAt: '2024-01-01T10:30:00Z',
};

describe('TerminalView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the terminal view container', () => {
    const onReturn = vi.fn();
    render(<TerminalView window={mockWindow} onReturn={onReturn} />);
    expect(screen.getByTestId('terminal-view')).toBeInTheDocument();
  });

  it('renders the top bar with 40px height', () => {
    const onReturn = vi.fn();
    render(<TerminalView window={mockWindow} onReturn={onReturn} />);
    const topbar = screen.getByTestId('terminal-topbar');
    expect(topbar).toBeInTheDocument();
    expect(topbar).toHaveStyle({ height: '40px' });
  });

  it('renders the return button', () => {
    const onReturn = vi.fn();
    render(<TerminalView window={mockWindow} onReturn={onReturn} />);
    expect(screen.getByTestId('return-button')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '返回统一视图' })).toBeInTheDocument();
  });

  it('renders the window name', () => {
    const onReturn = vi.fn();
    render(<TerminalView window={mockWindow} onReturn={onReturn} />);
    expect(screen.getByTestId('window-name')).toHaveTextContent('Test Terminal');
  });

  it('renders the status label', () => {
    const onReturn = vi.fn();
    render(<TerminalView window={mockWindow} onReturn={onReturn} />);
    expect(screen.getByTestId('status-label')).toHaveTextContent('运行中');
  });

  it('renders the terminal container', () => {
    const onReturn = vi.fn();
    render(<TerminalView window={mockWindow} onReturn={onReturn} />);
    expect(screen.getByTestId('terminal-container')).toBeInTheDocument();
  });

  it('calls onReturn when return button is clicked', async () => {
    const onReturn = vi.fn();
    const user = userEvent.setup();
    render(<TerminalView window={mockWindow} onReturn={onReturn} />);

    await user.click(screen.getByTestId('return-button'));
    expect(onReturn).toHaveBeenCalledTimes(1);
  });

  it('calls onReturn when Esc key is pressed', () => {
    const onReturn = vi.fn();
    render(<TerminalView window={mockWindow} onReturn={onReturn} />);

    const view = screen.getByTestId('terminal-view');
    fireEvent.keyDown(view, { key: 'Escape', code: 'Escape' });
    expect(onReturn).toHaveBeenCalledTimes(1);
  });

  it('shows correct status label for waiting status', () => {
    const onReturn = vi.fn();
    const waitingWindow = { ...mockWindow, status: WindowStatus.WaitingForInput };
    render(<TerminalView window={waitingWindow} onReturn={onReturn} />);
    expect(screen.getByTestId('status-label')).toHaveTextContent('等待输入');
  });

  it('shows correct status label for completed status', () => {
    const onReturn = vi.fn();
    const completedWindow = { ...mockWindow, status: WindowStatus.Completed };
    render(<TerminalView window={completedWindow} onReturn={onReturn} />);
    expect(screen.getByTestId('status-label')).toHaveTextContent('已完成');
  });

  it('shows correct status label for error status', () => {
    const onReturn = vi.fn();
    const errorWindow = { ...mockWindow, status: WindowStatus.Error };
    render(<TerminalView window={errorWindow} onReturn={onReturn} />);
    expect(screen.getByTestId('status-label')).toHaveTextContent('出错');
  });

  it('registers PTY data listener on mount', () => {
    const onReturn = vi.fn();
    render(<TerminalView window={mockWindow} onReturn={onReturn} />);
    expect(window.electronAPI.onPtyData).toHaveBeenCalledTimes(1);
  });

  it('unregisters PTY data listener on unmount', () => {
    const onReturn = vi.fn();
    const { unmount } = render(<TerminalView window={mockWindow} onReturn={onReturn} />);
    unmount();
    expect(window.electronAPI.offPtyData).toHaveBeenCalledTimes(1);
  });

  it('return button has accessible aria-label', () => {
    const onReturn = vi.fn();
    render(<TerminalView window={mockWindow} onReturn={onReturn} />);
    const btn = screen.getByTestId('return-button');
    expect(btn).toHaveAttribute('aria-label', '返回统一视图');
  });

  it('return button has focus ring class for keyboard navigation', () => {
    const onReturn = vi.fn();
    render(<TerminalView window={mockWindow} onReturn={onReturn} />);
    const btn = screen.getByTestId('return-button');
    expect(btn.className).toContain('focus:ring-2');
  });

  it('prevents default on context menu (right-click paste)', () => {
    const onReturn = vi.fn();
    render(<TerminalView window={mockWindow} onReturn={onReturn} />);
    const container = screen.getByTestId('terminal-container');
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    container.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
