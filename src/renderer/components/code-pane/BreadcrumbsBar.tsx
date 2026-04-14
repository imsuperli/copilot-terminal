import React from 'react';
import { ChevronRight, FileCode2 } from 'lucide-react';

export interface CodePaneBreadcrumbItem {
  id: string;
  label: string;
  detail?: string;
  kind: 'file' | 'symbol';
  lineNumber: number;
  column: number;
}

interface BreadcrumbsBarProps {
  items: CodePaneBreadcrumbItem[];
  emptyLabel: string;
  onSelect: (item: CodePaneBreadcrumbItem) => void;
}

export function BreadcrumbsBar({
  items,
  emptyLabel,
  onSelect,
}: BreadcrumbsBarProps) {
  return (
    <div className="flex min-h-[30px] items-center gap-1 overflow-x-auto border-b border-zinc-800 bg-zinc-950/70 px-2 py-1 text-[11px] text-zinc-400">
      {items.length > 0 ? items.map((item, index) => (
        <React.Fragment key={item.id}>
          {index > 0 && <ChevronRight size={11} className="shrink-0 text-zinc-600" />}
          <button
            type="button"
            onClick={() => {
              onSelect(item);
            }}
            className={`group inline-flex min-w-0 items-center gap-1 rounded px-1.5 py-0.5 transition-colors ${
              item.kind === 'file'
                ? 'text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100'
                : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100'
            }`}
            title={item.detail || item.label}
          >
            {item.kind === 'file' && <FileCode2 size={11} className="shrink-0 text-zinc-500 group-hover:text-zinc-300" />}
            <span className="truncate">{item.label}</span>
          </button>
        </React.Fragment>
      )) : (
        <div className="truncate px-1 text-zinc-500">{emptyLabel}</div>
      )}
    </div>
  );
}
