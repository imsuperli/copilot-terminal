import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialog } from '../ConfirmDialog'

describe('ConfirmDialog', () => {
  const defaultProps = {
    open: true,
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    title: '关闭窗口',
    description: '确定关闭？终端进程将被终止',
    confirmLabel: '关闭',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render when open', () => {
    render(<ConfirmDialog {...defaultProps} />)
    expect(screen.getByText('关闭窗口')).toBeInTheDocument()
    expect(screen.getByText('确定关闭？终端进程将被终止')).toBeInTheDocument()
  })

  it('should not render when closed', () => {
    render(<ConfirmDialog {...defaultProps} open={false} />)
    expect(screen.queryByText('关闭窗口')).not.toBeInTheDocument()
  })

  it('should call onConfirm when confirm button clicked', () => {
    render(<ConfirmDialog {...defaultProps} />)
    fireEvent.click(screen.getByText('关闭'))
    expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1)
  })

  it('should call onCancel when cancel button clicked', () => {
    render(<ConfirmDialog {...defaultProps} />)
    fireEvent.click(screen.getByText('取消'))
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1)
  })

  it('should call onCancel when Esc key pressed', async () => {
    const user = userEvent.setup()
    render(<ConfirmDialog {...defaultProps} />)
    await user.keyboard('{Escape}')
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1)
  })

  it('should focus cancel button on open', () => {
    render(<ConfirmDialog {...defaultProps} />)
    const cancelButton = screen.getByText('取消')
    expect(cancelButton).toHaveFocus()
  })

  it('should call onConfirm when Enter key pressed on confirm button', async () => {
    const user = userEvent.setup()
    render(<ConfirmDialog {...defaultProps} />)
    const confirmButton = screen.getByText('关闭')
    confirmButton.focus()
    await user.keyboard('{Enter}')
    expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1)
  })

  it('should disable confirm button when processing', () => {
    render(<ConfirmDialog {...defaultProps} confirmLabel="处理中..." />)
    const confirmButton = screen.getByText('处理中...')
    expect(confirmButton).toBeDisabled()
  })

  it('should render custom confirmLabel', () => {
    render(<ConfirmDialog {...defaultProps} confirmLabel="删除" />)
    expect(screen.getByText('删除')).toBeInTheDocument()
  })
})
