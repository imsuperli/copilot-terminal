import React from 'react'
import * as ContextMenu from '@radix-ui/react-context-menu'

interface WindowContextMenuProps {
  children: React.ReactNode
  onClose: () => void
  onDelete: () => void
}

export function WindowContextMenu({ children, onClose, onDelete }: WindowContextMenuProps) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        {children}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          className="min-w-[160px] bg-bg-card border border-border-subtle rounded-card p-1 shadow-lg z-50"
        >
          <ContextMenu.Item
            className="flex items-center px-3 py-2 text-sm text-text-primary rounded cursor-pointer hover:bg-bg-card-hover focus:bg-bg-card-hover outline-none"
            onSelect={onClose}
          >
            关闭窗口
          </ContextMenu.Item>
          <ContextMenu.Item
            className="flex items-center px-3 py-2 text-sm text-status-error rounded cursor-pointer hover:bg-bg-card-hover focus:bg-bg-card-hover outline-none"
            onSelect={onDelete}
          >
            删除窗口
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}
