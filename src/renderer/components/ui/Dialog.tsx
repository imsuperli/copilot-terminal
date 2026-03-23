import React from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  contentClassName?: string;
  headerClassName?: string;
  bodyClassName?: string;
  titleClassName?: string;
  descriptionClassName?: string;
  headerActions?: React.ReactNode;
  showCloseButton?: boolean;
  closeLabel?: string;
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  contentClassName = '',
  headerClassName = '',
  bodyClassName = '',
  titleClassName = '',
  descriptionClassName = '',
  headerActions,
  showCloseButton = false,
  closeLabel = 'Close',
}: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-[1200] bg-black/50" />
        <RadixDialog.Content
          aria-describedby={description ? undefined : undefined}
          className={`fixed top-1/2 left-1/2 z-[1210] w-[92vw] max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-card bg-bg-card ${contentClassName}`}
        >
          <div className={`px-card-padding pt-card-padding ${description ? 'pb-4' : 'pb-3'} ${headerClassName}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <RadixDialog.Title className={`${description ? 'mb-2' : 'mb-0'} text-xl font-semibold text-text-primary ${titleClassName}`}>
                  {title}
                </RadixDialog.Title>
                {description && (
                  <RadixDialog.Description className={`text-text-secondary ${descriptionClassName}`}>
                    {description}
                  </RadixDialog.Description>
                )}
              </div>

              {(headerActions || showCloseButton) && (
                <div className="flex shrink-0 items-center gap-2">
                  {headerActions}
                  {showCloseButton && (
                    <RadixDialog.Close asChild>
                      <button
                        type="button"
                        aria-label={closeLabel}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border-subtle bg-bg-app/70 text-text-secondary transition-colors hover:bg-bg-card-hover hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-status-running"
                      >
                        <X size={16} />
                      </button>
                    </RadixDialog.Close>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className={`px-card-padding pb-card-padding ${bodyClassName}`}>
            {children}
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
