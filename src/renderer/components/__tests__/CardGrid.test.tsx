import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { CardGrid } from '../CardGrid';
import { useWindowStore } from '../../stores/windowStore';
import { Window, WindowStatus } from '../../types/window';

vi.mock('../../hooks/useIDESettings', () => ({
  useIDESettings: () => ({
    enabledIDEs: [],
  }),
}));

type MakeWindowOptions = Partial<Window> & {
  id: string;
  status?: WindowStatus;
  cwd?: string;
  command?: string;
  pid?: number | null;
};

const makeWindow = (overrides: MakeWindowOptions): Window => {
  const {
    id,
    status = WindowStatus.Running,
    cwd = `/path/${overrides.id}`,
    command = 'claude',
    pid = status === WindowStatus.Paused ? null : 1000,
    ...windowOverrides
  } = overrides;
  const paneId = windowOverrides.activePaneId ?? `pane-${id}`;

  return {
    id,
    name: `Window ${id}`,
    activePaneId: paneId,
    createdAt: '2024-01-01T10:00:00Z',
    lastActiveAt: '2024-01-01T10:00:00Z',
    layout: {
      type: 'pane',
      id: paneId,
      pane: {
        id: paneId,
        cwd,
        command,
        status,
        pid,
        backend: 'local',
      },
    },
    ...windowOverrides,
  };
};

function renderCardGrid(props: React.ComponentProps<typeof CardGrid> = {}) {
  return render(
    <DndProvider backend={HTML5Backend}>
      <CardGrid {...props} />
    </DndProvider>,
  );
}

describe('CardGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWindowStore.setState({
      windows: [],
      groups: [],
      customCategories: [],
      activeWindowId: null,
      activeGroupId: null,
    });
  });

  // AC1, AC2: CSS Grid layout and gap
  it('renders grid container with correct CSS Grid classes', () => {
    useWindowStore.getState().addWindow(makeWindow({ id: '1' }));
    renderCardGrid();
    const grid = screen.getByTestId('card-grid');
    expect(grid.className).toContain('grid');
    expect(grid.className).toContain('gap-4');
    expect(grid.className).toContain('p-8');
    expect(grid.className).toContain('minmax(350px,1fr)');
  });

  // AC7: scroll support
  it('renders ScrollArea root for scroll support', () => {
    useWindowStore.getState().addWindow(makeWindow({ id: '1' }));
    renderCardGrid();
    expect(screen.getByTestId('card-grid-scroll-root')).toBeInTheDocument();
  });

  it('renders active window cards sorted by createdAt descending', () => {
    const { addWindow } = useWindowStore.getState();
    addWindow(makeWindow({ id: 'old', name: 'Old Window', createdAt: '2024-01-01T08:00:00Z' }));
    addWindow(makeWindow({ id: 'new', name: 'New Window', createdAt: '2024-01-01T12:00:00Z' }));
    addWindow(makeWindow({ id: 'mid', name: 'Mid Window', createdAt: '2024-01-01T10:00:00Z' }));

    renderCardGrid();

    const cardLabels = screen.getAllByRole('button')
      .map((button) => button.getAttribute('aria-label') ?? '')
      .filter((label) => ['New Window', 'Mid Window', 'Old Window'].some((name) => label.includes(name)));

    expect(cardLabels[0]).toContain('New Window');
    expect(cardLabels[1]).toContain('Mid Window');
    expect(cardLabels[2]).toContain('Old Window');
  });

  // Empty state
  it('renders nothing when windows array is empty', () => {
    const { container } = renderCardGrid();
    expect(container.firstChild).toBeNull();
  });

  // Renders all windows
  it('renders a WindowCard for each window', () => {
    const { addWindow } = useWindowStore.getState();
    addWindow(makeWindow({ id: '1', name: 'Window 1' }));
    addWindow(makeWindow({ id: '2', name: 'Window 2' }));
    addWindow(makeWindow({ id: '3', name: 'Window 3' }));

    renderCardGrid();

    expect(screen.getByText('Window 1')).toBeInTheDocument();
    expect(screen.getByText('Window 2')).toBeInTheDocument();
    expect(screen.getByText('Window 3')).toBeInTheDocument();
  });

  // 15+ windows scroll
  it('renders 15+ windows without error (scroll state)', () => {
    const { addWindow } = useWindowStore.getState();
    for (let i = 1; i <= 16; i++) {
      addWindow(makeWindow({ id: `${i}`, name: `Window ${i}` }));
    }

    renderCardGrid();

    const windowCards = screen.getAllByRole('button')
      .filter((button) => (button.getAttribute('aria-label') ?? '').includes('Window '));
    expect(windowCards).toHaveLength(16);
    expect(screen.getByTestId('new-window-card')).toBeInTheDocument();
    expect(screen.getByTestId('card-grid-scroll-root')).toBeInTheDocument();
  });

  it('calls onEnterTerminal when a window card is clicked', async () => {
    const user = userEvent.setup();
    const handleEnterTerminal = vi.fn();
    const clickableWindow = makeWindow({ id: 'win-1', name: 'Clickable Window' });
    useWindowStore.getState().addWindow(clickableWindow);

    renderCardGrid({ onEnterTerminal: handleEnterTerminal });

    const windowCard = screen.getByRole('button', { name: /Clickable Window/ });
    await user.click(windowCard);

    expect(handleEnterTerminal).toHaveBeenCalledWith(clickableWindow);
  });

  // NewWindowCard is rendered at the end of the grid
  it('renders NewWindowCard at the end of the grid when windows exist', () => {
    useWindowStore.getState().addWindow(makeWindow({ id: '1', name: 'Window 1' }));
    renderCardGrid();
    expect(screen.getByTestId('new-window-card')).toBeInTheDocument();
  });

  // NewWindowCard calls onCreateWindow
  it('calls onCreateWindow when NewWindowCard is clicked', async () => {
    const user = userEvent.setup();
    const handleCreate = vi.fn();
    useWindowStore.getState().addWindow(makeWindow({ id: '1' }));

    renderCardGrid({ onCreateWindow: handleCreate });

    await user.click(screen.getByRole('button', { name: '新建窗口' }));
    expect(handleCreate).toHaveBeenCalledTimes(1);
  });

  // NewWindowCard not shown when empty
  it('does not render NewWindowCard when windows array is empty', () => {
    renderCardGrid();
    expect(screen.queryByTestId('new-window-card')).not.toBeInTheDocument();
  });

  // Different statuses render correctly
  it('renders cards with different statuses', () => {
    const { addWindow } = useWindowStore.getState();
    const statuses = [
      WindowStatus.Running,
      WindowStatus.WaitingForInput,
      WindowStatus.Completed,
      WindowStatus.Error,
      WindowStatus.Restoring,
    ];
    statuses.forEach((status, i) => {
      addWindow(makeWindow({ id: `${i}`, name: `Window ${i}`, status }));
    });

    renderCardGrid();

    expect(screen.getByRole('button', { name: /运行中/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /等待输入/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /已完成/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /出错/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /恢复中/ })).toBeInTheDocument();
  });

  it('shows custom category empty state instead of active windows when the category has not synced yet', () => {
    useWindowStore.getState().addWindow(makeWindow({ id: '1', name: 'Window 1' }));

    renderCardGrid({ currentTab: 'category-persisted' });

    expect(screen.getByText('此分类暂无终端')).toBeInTheDocument();
    expect(screen.queryByText('Window 1')).not.toBeInTheDocument();
  });

  it('does not treat built-in status tabs as custom categories when empty', () => {
    const { container } = renderCardGrid({ currentTab: 'status:running' });

    expect(screen.queryByText('此分类暂无终端')).not.toBeInTheDocument();
    expect(container.firstChild).toBeNull();
  });
});
