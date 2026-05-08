import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WindowContextMenu } from '../WindowContextMenu'

describe('WindowContextMenu', () => {
  const defaultProps = {
    onClose: vi.fn(),
    onDelete: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render children', () => {
    render(
      <WindowContextMenu {...defaultProps}>
        <div>窗口卡片</div>
      </WindowContextMenu>
    )
    expect(screen.getByText('窗口卡片')).toBeInTheDocument()
  })

  it('should show context menu on right click', async () => {
    const user = userEvent.setup()
    render(
      <WindowContextMenu {...defaultProps}>
        <div>窗口卡片</div>
      </WindowContextMenu>
    )
    await user.pointer({ keys: '[MouseRight]', target: screen.getByText('窗口卡片') })
    expect(screen.getByText('停止窗口')).toBeInTheDocument()
    expect(screen.getByText('删除窗口')).toBeInTheDocument()
  })

  it('should call onClose when 停止窗口 is clicked', async () => {
    const user = userEvent.setup()
    render(
      <WindowContextMenu {...defaultProps}>
        <div>窗口卡片</div>
      </WindowContextMenu>
    )
    await user.pointer({ keys: '[MouseRight]', target: screen.getByText('窗口卡片') })
    await user.click(screen.getByText('停止窗口'))
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  })

  it('should call onDelete when 删除窗口 is clicked', async () => {
    const user = userEvent.setup()
    render(
      <WindowContextMenu {...defaultProps}>
        <div>窗口卡片</div>
      </WindowContextMenu>
    )
    await user.pointer({ keys: '[MouseRight]', target: screen.getByText('窗口卡片') })
    await user.click(screen.getByText('删除窗口'))
    expect(defaultProps.onDelete).toHaveBeenCalledTimes(1)
  })

  it('should support keyboard navigation with arrow keys', async () => {
    const user = userEvent.setup()
    render(
      <WindowContextMenu {...defaultProps}>
        <div>窗口卡片</div>
      </WindowContextMenu>
    )
    await user.pointer({ keys: '[MouseRight]', target: screen.getByText('窗口卡片') })

    const closeItem = screen.getByRole('menuitem', { name: '停止窗口' })
    const deleteItem = screen.getByRole('menuitem', { name: '删除窗口' })

    // Radix UI focuses the menu container first; ArrowDown moves focus to first item
    await user.keyboard('{ArrowDown}')
    expect(closeItem).toHaveFocus()

    // 按下箭头键导航到第二个菜单项
    await user.keyboard('{ArrowDown}')
    expect(deleteItem).toHaveFocus()

    // 按上箭头返回第一个菜单项
    await user.keyboard('{ArrowUp}')
    expect(closeItem).toHaveFocus()
  })

  it('should close menu on Escape key', async () => {
    const user = userEvent.setup()
    render(
      <WindowContextMenu {...defaultProps}>
        <div>窗口卡片</div>
      </WindowContextMenu>
    )
    await user.pointer({ keys: '[MouseRight]', target: screen.getByText('窗口卡片') })
    expect(screen.getByText('停止窗口')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByText('停止窗口')).not.toBeInTheDocument()
  })

  it('should trigger onClose when Enter pressed on 停止窗口', async () => {
    const user = userEvent.setup()
    render(
      <WindowContextMenu {...defaultProps}>
        <div>窗口卡片</div>
      </WindowContextMenu>
    )
    await user.pointer({ keys: '[MouseRight]', target: screen.getByText('窗口卡片') })

    const closeItem = screen.getByRole('menuitem', { name: '停止窗口' })
    closeItem.focus()
    await user.keyboard('{Enter}')

    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  })
})
