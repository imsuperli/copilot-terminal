import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    ).toHaveClass('mb-6', 'text-xl', 'font-semibold', 'text-[rgb(var(--foreground))]');
    expect(screen.getByText('创建你的第一个终端窗口开始工作')).toBeInTheDocument();
  });

  it('renders the primary create actions in the unified view', async () => {
    await renderApp();
    expect(await screen.findAllByRole('button', { name: '新建终端' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: '批量添加' })).toBeInTheDocument();
  });

  it('opens only one create dialog from the unified home screen', async () => {
    const user = userEvent.setup();

    await renderApp();
    await user.click((await screen.findAllByRole('button', { name: '新建终端' }))[0]!);

    const dialogs = await screen.findAllByRole('dialog');
    const createDialogs = dialogs.filter((dialog) => (
      within(dialog).queryByText('新建终端或 SSH 连接') !== null
    ));

    expect(createDialogs).toHaveLength(1);
    expect(within(createDialogs[0]!).getAllByRole('button', { name: '取消' })).toHaveLength(1);
    expect(within(createDialogs[0]!).getAllByRole('button', { name: '创建' })).toHaveLength(1);
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
