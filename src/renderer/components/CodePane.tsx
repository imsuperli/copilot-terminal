import React from 'react';
import { FileCode2, X } from 'lucide-react';
import type { Pane } from '../types/window';
import { AppTooltip } from './ui/AppTooltip';
import { useI18n } from '../i18n';
import { preventMouseButtonFocus } from '../utils/buttonFocus';

export interface CodePaneProps {
  windowId: string;
  pane: Pane;
  isActive: boolean;
  onActivate: () => void;
  onClose?: () => void;
}

export const CodePane: React.FC<CodePaneProps> = ({
  pane,
  isActive,
  onActivate,
  onClose,
}) => {
  const { t } = useI18n();
  const rootPath = pane.code?.rootPath ?? pane.cwd;

  return (
    <div
      className={`relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden border ${isActive ? 'border-[rgb(var(--primary))]/45' : 'border-zinc-800'} bg-zinc-950`}
      onMouseDown={onActivate}
    >
      <div className="flex items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-900/90 px-2 py-1.5">
        <div className="flex min-w-0 items-center gap-2 text-zinc-200">
          <FileCode2 size={14} className="shrink-0 text-[rgb(var(--primary))]" />
          <span className="truncate text-xs font-medium">
            {rootPath || t('codePane.title')}
          </span>
        </div>
        {onClose && (
          <AppTooltip content={t('terminalPane.close')} placement="pane-corner">
            <button
              type="button"
              tabIndex={-1}
              aria-label={t('terminalPane.close')}
              onMouseDown={preventMouseButtonFocus}
              onClick={(event) => {
                event.stopPropagation();
                onClose();
              }}
              className="flex h-6 w-6 items-center justify-center rounded bg-zinc-800/90 text-zinc-400 hover:bg-red-600 hover:text-zinc-50"
            >
              <X size={13} />
            </button>
          </AppTooltip>
        )}
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center bg-zinc-950 text-xs text-zinc-500">
        {t('codePane.loading')}
      </div>
    </div>
  );
};

CodePane.displayName = 'CodePane';
