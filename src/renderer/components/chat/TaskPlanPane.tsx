import React from 'react';
import { PanelRightClose } from 'lucide-react';
import type { TaskPlanItem } from '../../../shared/types/task';
import { idePopupBarePanelClassName } from '../ui/ide-popup';

export function TaskPlanPane({
  items,
  updatedAt,
  onClose,
  title,
  emptyLabel,
  statusLabelFormatter,
  badgeLabel,
}: {
  items: TaskPlanItem[];
  updatedAt?: string;
  onClose: () => void;
  title: string;
  emptyLabel: string;
  statusLabelFormatter: (status: TaskPlanItem['status']) => string;
  badgeLabel: string;
}) {
  return (
    <aside className="flex h-full w-[320px] min-w-[320px] max-w-[320px] flex-col border-l border-[rgb(var(--border))] bg-[rgb(var(--background))]">
      <div className="flex items-center gap-3 border-b border-[rgb(var(--border))] px-4 py-3">
        <span className="rounded-md bg-[rgb(var(--accent))] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[rgb(var(--foreground))]">
          {badgeLabel}
        </span>
        {updatedAt ? (
          <span className="text-xs text-[rgb(var(--muted-foreground))]">
            {new Date(updatedAt).toLocaleTimeString()}
          </span>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-[rgb(var(--muted-foreground))] hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--foreground))]"
          aria-label={title}
        >
          <PanelRightClose size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {items.length === 0 ? (
          <div className={`${idePopupBarePanelClassName} text-sm text-[rgb(var(--muted-foreground))]`}>
            {emptyLabel}
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="rounded-xl border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--secondary))_58%,transparent)] px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-[rgb(var(--border))] px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-[rgb(var(--muted-foreground))]">
                    {statusLabelFormatter(item.status)}
                  </span>
                </div>
                <div className="mt-2 text-sm text-[rgb(var(--foreground))]">{item.text}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
