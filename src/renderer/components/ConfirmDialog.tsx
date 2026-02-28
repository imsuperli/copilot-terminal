import React from 'react'
import * as AlertDialog from '@radix-ui/react-alert-dialog'

interface ConfirmDialogProps {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
  title: string
  description: string
  confirmLabel?: string
}

export function ConfirmDialog({
  open,
  onConfirm,
  onCancel,
  title,
  description,
  confirmLabel = '确认',
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={(o) => { if (!o) onCancel() }}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 bg-black/50 z-50" onClick={(e) => e.preventDefault()} />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-bg-card border border-border-subtle rounded-card p-card-padding max-w-md w-full z-50 shadow-xl">
          <AlertDialog.Title className="text-lg font-semibold text-text-primary mb-2">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="text-sm text-text-secondary mb-6">
            {description}
          </AlertDialog.Description>
          <div className="flex justify-end gap-3">
            <AlertDialog.Cancel asChild>
              <button
                className="px-4 py-2 rounded-button font-medium border border-border-subtle text-text-primary hover:bg-bg-card-hover focus:outline-none focus:ring-2 focus:ring-inset focus:ring-text-secondary transition-colors"
                autoFocus
              >
                取消
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                className="px-4 py-2 rounded-button font-medium bg-status-error text-white hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-status-error transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={onConfirm}
                disabled={confirmLabel.includes('处理中')}
              >
                {confirmLabel}
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
