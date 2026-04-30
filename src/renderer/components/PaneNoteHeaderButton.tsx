import React from 'react';
import { StickyNote } from 'lucide-react';
import { AppTooltip } from './ui/AppTooltip';
import { useI18n } from '../i18n';
import { usePaneNoteStore } from '../stores/paneNoteStore';

interface PaneNoteHeaderButtonProps {
  windowId: string;
  paneId: string;
  className: string;
}

export const PaneNoteHeaderButton: React.FC<PaneNoteHeaderButtonProps> = ({
  windowId,
  paneId,
  className,
}) => {
  const { t } = useI18n();
  const note = usePaneNoteStore((state) => state.notes[`${windowId}::${paneId}`]);
  const openDraft = usePaneNoteStore((state) => state.openDraft);

  return (
    <AppTooltip content={note?.text ? t('paneNote.edit') : t('paneNote.create')} placement="pane-corner">
      <button
        type="button"
        aria-label={note?.text ? t('paneNote.edit') : t('paneNote.create')}
        className={className}
        onClick={(event) => {
          event.stopPropagation();
          openDraft(windowId, paneId);
        }}
      >
        <StickyNote size={14} className={note?.text ? 'text-[rgb(var(--warning))]' : undefined} />
      </button>
    </AppTooltip>
  );
};

PaneNoteHeaderButton.displayName = 'PaneNoteHeaderButton';
