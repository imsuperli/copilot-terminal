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
    <div className="flex min-h-[30px] items-center gap-1 overflow-x-auto border-b border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--background))_82%,transparent)] px-2 py-1 text-[11px] text-[rgb(var(--muted-foreground))]">
      {items.length > 0 ? items.map((item, index) => (
        <React.Fragment key={item.id}>
          {index > 0 && <ChevronRight size={11} className="shrink-0 text-[rgb(var(--muted-foreground))]/70" />}
          <button
            type="button"
            onClick={() => {
              onSelect(item);
            }}
            className={`group inline-flex min-w-0 items-center gap-1 rounded px-1.5 py-0.5 transition-colors ${
              item.kind === 'file'
                ? 'text-[rgb(var(--foreground))] hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--foreground))]'
                : 'text-[rgb(var(--muted-foreground))] hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--foreground))]'
            }`}
            title={item.detail || item.label}
          >
            {item.kind === 'file' && <FileCode2 size={11} className="shrink-0 text-[rgb(var(--muted-foreground))] group-hover:text-[rgb(var(--foreground))]" />}
            <span className="truncate">{item.label}</span>
          </button>
        </React.Fragment>
      )) : (
        <div className="truncate px-1 text-[rgb(var(--muted-foreground))]">{emptyLabel}</div>
      )}
    </div>
  );
}
