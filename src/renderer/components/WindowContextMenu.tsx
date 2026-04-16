import React from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { Trash2, X } from 'lucide-react';
import { useI18n } from '../i18n';
import {
  ideMenuContentClassName,
  ideMenuDangerItemClassName,
  ideMenuItemClassName,
  IdeMenuItemContent,
} from './ui/ide-menu';

interface WindowContextMenuProps {
  children: React.ReactNode;
  onClose: () => void;
  onDelete: () => void;
}

export function WindowContextMenu({ children, onClose, onDelete }: WindowContextMenuProps) {
  const { t } = useI18n();

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        {children}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          className={ideMenuContentClassName}
        >
          <ContextMenu.Item
            className={ideMenuItemClassName}
            onSelect={onClose}
          >
            <IdeMenuItemContent
              icon={<X size={14} />}
              label={t('common.closeWindow')}
            />
          </ContextMenu.Item>
          <ContextMenu.Item
            className={ideMenuDangerItemClassName}
            onSelect={onDelete}
          >
            <IdeMenuItemContent
              icon={<Trash2 size={14} />}
              label={t('common.deleteWindow')}
            />
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
