import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CardGrid } from '../CardGrid';
import { useWindowStore } from '../../stores/windowStore';
import { WindowStatus } from '../../types/window';

describe('CardGrid Integration', () => {
  beforeEach(() => {
    // 清空 store
    useWindowStore.setState({ windows: [], activeWindowId: null });
  });

  it('renders empty when no windows', () => {
    const { container } = render(<CardGrid />);
    expect(container.firstChild).toBeNull();
  });

  it('renders multiple window cards', () => {
    const { addWindow } = useWindowStore.getState();

    addWindow({
      id: '1',
      name: 'Window 1',
      workingDirectory: '/path/1',
      command: 'claude',
      status: WindowStatus.Running,
      pid: 1001,
      createdAt: '2024-01-01T10:00:00Z',
      lastActiveAt: '2024-01-01T10:00:00Z',
    });

    addWindow({
      id: '2',
      name: 'Window 2',
      workingDirectory: '/path/2',
      command: 'claude',
      status: WindowStatus.Completed,
      pid: 1002,
      createdAt: '2024-01-01T10:00:00Z',
      lastActiveAt: '2024-01-01T10:00:00Z',
    });

    render(<CardGrid />);

    expect(screen.getByText('Window 1')).toBeInTheDocument();
    expect(screen.getByText('Window 2')).toBeInTheDocument();
  });

  it('sets active window on card click', async () => {
    const { addWindow, setActiveWindow } = useWindowStore.getState();
    const setActiveWindowSpy = vi.spyOn(useWindowStore.getState(), 'setActiveWindow');

    addWindow({
      id: '1',
      name: 'Test Window',
      workingDirectory: '/test',
      command: 'claude',
      status: WindowStatus.Running,
      pid: 1001,
      createdAt: '2024-01-01T10:00:00Z',
      lastActiveAt: '2024-01-01T10:00:00Z',
    });

    const user = userEvent.setup();
    render(<CardGrid />);

    const card = screen.getByRole('button');
    await user.click(card);

    expect(setActiveWindowSpy).toHaveBeenCalledWith('1');
  });

  it('renders cards with different statuses', () => {
    const { addWindow } = useWindowStore.getState();

    const statuses = [
      WindowStatus.Running,
      WindowStatus.WaitingForInput,
      WindowStatus.Completed,
      WindowStatus.Error,
      WindowStatus.Restoring,
    ];

    statuses.forEach((status, index) => {
      addWindow({
        id: `${index}`,
        name: `Window ${index}`,
        workingDirectory: `/path/${index}`,
        command: 'claude',
        status,
        pid: 1000 + index,
        createdAt: '2024-01-01T10:00:00Z',
        lastActiveAt: '2024-01-01T10:00:00Z',
      });
    });

    render(<CardGrid />);

    expect(screen.getByText('运行中')).toBeInTheDocument();
    expect(screen.getByText('等待输入')).toBeInTheDocument();
    expect(screen.getByText('已完成')).toBeInTheDocument();
    expect(screen.getByText('出错')).toBeInTheDocument();
    expect(screen.getByText('恢复中')).toBeInTheDocument();
  });
});
