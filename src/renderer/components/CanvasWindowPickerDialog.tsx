import React, { useMemo, useState } from 'react';
import { MonitorSmartphone, Search } from 'lucide-react';
import type { Window } from '../types/window';
import { Dialog } from './ui/Dialog';
import { useI18n } from '../i18n';
import { getWindowKind } from '../../shared/utils/terminalCapabilities';
import { getAllPanes } from '../utils/layoutHelpers';
import { getCurrentWindowWorkingDirectory } from '../utils/windowWorkingDirectory';
import {
  idePopupBadgeClassName,
  idePopupFieldShellClassName,
  idePopupRowClassName,
} from './ui/ide-popup';

interface CanvasWindowPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  windows: Window[];
  onPick: (windowId: string) => void;
  title?: string;
  description?: string;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

export function CanvasWindowPickerDialog({
  open,
  onOpenChange,
  windows,
  onPick,
  title,
  description,
}: CanvasWindowPickerDialogProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');

  const items = useMemo(() => {
    const normalized = normalizeText(query);

    return windows
      .map((windowItem) => {
        const panes = getAllPanes(windowItem.layout);
        const cwd = getCurrentWindowWorkingDirectory(windowItem);
        const kind = getWindowKind(windowItem);
        return {
          window: windowItem,
          paneCount: panes.length,
          cwd,
          kind,
        };
      })
      .filter((item) => {
        if (!normalized) {
          return true;
        }

        return [
          item.window.name,
          item.cwd,
          item.kind,
        ].some((value) => normalizeText(value || '').includes(normalized));
      })
      .sort((left, right) => {
        return new Date(right.window.lastActiveAt).getTime() - new Date(left.window.lastActiveAt).getTime();
      });
  }, [query, windows]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title ?? t('canvas.addWindow')}
      description={description ?? t('canvas.windowPickerDescription')}
      contentClassName="!max-w-2xl"
      showCloseButton
      closeLabel={t('common.close')}
    >
      <div className="space-y-4">
        <div className={idePopupFieldShellClassName}>
          <Search size={15} className="text-[rgb(var(--muted-foreground))]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('canvas.windowPickerSearchPlaceholder')}
            className="w-full bg-transparent text-sm text-[rgb(var(--foreground))] outline-none placeholder:text-[rgb(var(--muted-foreground))]"
          />
        </div>

        <div className="max-h-[52vh] space-y-1 overflow-auto rounded-2xl border border-[rgb(var(--border))] bg-[var(--appearance-pane-background)] p-2">
          {items.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-[rgb(var(--muted-foreground))]">
              {t('canvas.noAvailableWindows')}
            </div>
          ) : (
            items.map(({ window: windowItem, paneCount, cwd, kind }) => (
              <button
                key={windowItem.id}
                type="button"
                onClick={() => {
                  onPick(windowItem.id);
                  onOpenChange(false);
                  setQuery('');
                }}
                className={idePopupRowClassName(false)}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[rgb(var(--border))] bg-[var(--appearance-pane-chrome-background)] text-[rgb(var(--foreground))]">
                  <MonitorSmartphone size={16} />
                </span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm font-medium text-[rgb(var(--foreground))]">
                    {windowItem.name || t('canvas.unnamedWindow')}
                  </span>
                  <span className="block truncate text-xs text-[rgb(var(--muted-foreground))]">
                    {cwd || 'N/A'}
                  </span>
                </span>
                <span className={`rounded-full border px-2 py-1 text-[10px] ${idePopupBadgeClassName(kind === 'ssh' ? 'amber' : kind === 'mixed' ? 'violet' : 'sky')}`}>
                  {kind}
                </span>
                <span className="rounded-full border border-[rgb(var(--border))] bg-[var(--appearance-pane-chrome-background)] px-2 py-1 text-[10px] text-[rgb(var(--muted-foreground))]">
                  {t('canvas.windowPickerPaneCount', { count: paneCount })}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </Dialog>
  );
}
