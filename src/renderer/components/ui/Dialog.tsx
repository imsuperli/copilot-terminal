import React from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  contentClassName?: string;
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  contentClassName = '',
}: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 bg-black/50" />
        <RadixDialog.Content
          aria-describedby={description ? undefined : undefined}
          className={`fixed top-1/2 left-1/2 w-[92vw] max-w-xl -translate-x-1/2 -translate-y-1/2 bg-bg-card rounded-card p-card-padding ${contentClassName}`}
        >
          <RadixDialog.Title className="text-xl font-semibold text-text-primary mb-2">
            {title}
          </RadixDialog.Title>
          {description && (
            <RadixDialog.Description className="text-text-secondary mb-4">
              {description}
            </RadixDialog.Description>
          )}
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
