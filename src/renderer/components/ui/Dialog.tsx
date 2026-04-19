import React from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import {
  idePopupHeaderClassName,
  idePopupIconButtonClassName,
  idePopupOverlayClassName,
  idePopupSubtitleClassName,
  idePopupTitleClassName,
  IdePopupShell,
} from './ide-popup';

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
  overlayStyle?: React.CSSProperties;
  contentStyle?: React.CSSProperties;
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
  overlayStyle,
  contentStyle,
}: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={`${idePopupOverlayClassName} z-[1200] animate-fade-in`} style={overlayStyle} />
        <RadixDialog.Content
          aria-describedby={description ? undefined : undefined}
          className={`fixed top-1/2 left-1/2 z-[1210] w-[92vw] max-w-xl -translate-x-1/2 -translate-y-1/2 animate-scale-in focus:outline-none ${contentClassName}`}
          style={contentStyle}
        >
          <IdePopupShell className="flex max-h-[86vh] flex-col">
            <div className={`${idePopupHeaderClassName} ${headerClassName}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <RadixDialog.Title className={`${description ? 'mb-1' : 'mb-0'} ${idePopupTitleClassName} ${titleClassName}`}>
                    {title}
                  </RadixDialog.Title>
                  {description && (
                    <RadixDialog.Description className={`${idePopupSubtitleClassName} ${descriptionClassName}`}>
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
                          className={idePopupIconButtonClassName}
                        >
                          <X size={16} />
                        </button>
                      </RadixDialog.Close>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className={`min-h-0 overflow-auto px-card-padding pb-card-padding pt-card-padding ${bodyClassName}`}>
              {children}
            </div>
          </IdePopupShell>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
