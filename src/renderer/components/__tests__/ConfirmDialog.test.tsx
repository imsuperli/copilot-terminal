import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from '../ConfirmDialog';

describe('ConfirmDialog', () => {
  const onConfirm = vi.fn();
  const onOpenChange = vi.fn();

  const defaultProps = {
    open: true,
    onConfirm,
    onOpenChange,
    title: '关闭窗口',
    description: '确定关闭？终端进程将被终止',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders when open', () => {
    render(<ConfirmDialog {...defaultProps} />);

    expect(screen.getByText('关闭窗口')).toBeInTheDocument();
    expect(screen.getByText('确定关闭？终端进程将被终止')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '确认' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<ConfirmDialog {...defaultProps} open={false} />);

    expect(screen.queryByText('关闭窗口')).not.toBeInTheDocument();
  });

  it('calls onConfirm and closes when confirm button is clicked', () => {
    render(<ConfirmDialog {...defaultProps} confirmText="关闭" />);

    fireEvent.click(screen.getByText('关闭', { selector: 'button' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes when cancel button is clicked', () => {
    render(<ConfirmDialog {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: '取消' }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes when escape is pressed', async () => {
    const user = userEvent.setup();
    render(<ConfirmDialog {...defaultProps} />);

    await user.keyboard('{Escape}');

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('focuses the cancel button on open', () => {
    render(<ConfirmDialog {...defaultProps} />);

    expect(screen.getByRole('button', { name: '取消' })).toHaveFocus();
  });

  it('triggers confirm when enter is pressed on the confirm button', async () => {
    const user = userEvent.setup();
    render(<ConfirmDialog {...defaultProps} confirmText="删除" />);

    const confirmButton = screen.getByRole('button', { name: '删除' });
    confirmButton.focus();
    await user.keyboard('{Enter}');

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('renders a custom cancel label', () => {
    render(<ConfirmDialog {...defaultProps} cancelText="稍后" />);

    expect(screen.getByRole('button', { name: '稍后' })).toBeInTheDocument();
  });
});
