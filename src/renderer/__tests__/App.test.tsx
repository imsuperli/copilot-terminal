import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderApp } from './appTestUtils';

describe('App - Main Window and Basic Layout', () => {
  it('renders the main shell layout with title bar, sidebar, and content area', async () => {
    const { container } = await renderApp();
    const mainLayout = container.querySelector('.h-screen');
    expect(mainLayout).toBeInTheDocument();
    expect(mainLayout?.className).toContain('flex');
    expect(mainLayout?.className).toContain('flex-col');
    expect(screen.getByRole('complementary')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveClass('flex-1', 'overflow-auto');
  });

  it('uses the app version API result for the title bar app name', async () => {
    vi.mocked(window.electronAPI.getAppVersion).mockResolvedValueOnce({
      success: true,
      data: {
        name: 'Terminal X',
        version: '9.9.9',
      },
    });

    await renderApp('Terminal X');
    expect(screen.getByText('Terminal X')).toBeInTheDocument();
  });

  it('renders the current empty state copy', async () => {
    await renderApp();
    expect(
      await screen.findByRole('heading', { level: 2, name: '欢迎使用 Synapse' }),
    ).toHaveClass('text-2xl', 'font-semibold', 'text-[rgb(var(--foreground))]', 'mb-2');
    expect(screen.getByText('创建你的第一个终端窗口开始工作')).toBeInTheDocument();
  });

  it('renders the primary create actions in the unified view', async () => {
    await renderApp();
    expect(await screen.findAllByRole('button', { name: '新建终端' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: '批量添加' })).toBeInTheDocument();
  });

  it('renders the current sidebar navigation tabs', async () => {
    await renderApp();
    expect(screen.getByRole('button', { name: '工作区' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '本地终端' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '远程终端' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '归档终端' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '全部终端' })).toBeInTheDocument();
  });
});
