import React from 'react';
import { ChevronRight } from 'lucide-react';

function joinClassNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export const ideMenuContentClassName = joinClassNames(
  'z-[140] min-w-[220px] overflow-hidden rounded-[12px] border border-[rgb(var(--border))] p-1.5',
  'bg-[linear-gradient(180deg,color-mix(in_srgb,rgb(var(--card))_96%,transparent)_0%,color-mix(in_srgb,rgb(var(--background))_97%,transparent)_100%)]',
  'shadow-[0_20px_48px_rgba(0,0,0,0.45)] ring-1 ring-black/15 backdrop-blur',
);

export const ideMenuSeparatorClassName = 'my-1.5 h-px bg-[rgb(var(--border))]';

export const ideMenuItemClassName = joinClassNames(
  'group flex cursor-pointer select-none items-center gap-2 rounded-[8px] px-2.5 py-2',
  'text-[12px] text-[rgb(var(--foreground))] outline-none transition-colors',
  'focus:bg-[rgb(var(--accent))] data-[highlighted]:bg-[rgb(var(--accent))]',
  'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-35',
);

export const ideMenuDangerItemClassName = joinClassNames(
  ideMenuItemClassName,
  'text-red-300 focus:bg-red-500/12 data-[highlighted]:bg-red-500/12',
);

export const ideMenuSubTriggerClassName = joinClassNames(
  ideMenuItemClassName,
  'justify-between',
);

export const ideMenuShortcutClassName =
  'ml-auto pl-3 text-[11px] text-[rgb(var(--muted-foreground))] group-data-[highlighted]:text-[rgb(var(--foreground))]';

export const ideMenuLabelClassName = 'truncate';

export const ideMenuIconSlotClassName =
  'flex h-4 w-4 shrink-0 items-center justify-center text-[rgb(var(--muted-foreground))] group-data-[highlighted]:text-[rgb(var(--foreground))]';

interface IdeMenuItemContentProps {
  icon?: React.ReactNode;
  label: React.ReactNode;
  shortcut?: React.ReactNode;
  trailing?: React.ReactNode;
}

export function IdeMenuItemContent({
  icon,
  label,
  shortcut,
  trailing,
}: IdeMenuItemContentProps) {
  return (
    <>
      <span className={ideMenuIconSlotClassName} aria-hidden="true">
        {icon ?? null}
      </span>
      <span className={ideMenuLabelClassName}>{label}</span>
      {shortcut ? <span className={ideMenuShortcutClassName} aria-hidden="true">{shortcut}</span> : null}
      {trailing ? <span className="ml-2 shrink-0 text-[rgb(var(--muted-foreground))]" aria-hidden="true">{trailing}</span> : null}
    </>
  );
}

interface IdeMenuSubTriggerContentProps {
  icon?: React.ReactNode;
  label: React.ReactNode;
  shortcut?: React.ReactNode;
}

export function IdeMenuSubTriggerContent({
  icon,
  label,
  shortcut,
}: IdeMenuSubTriggerContentProps) {
  return (
    <IdeMenuItemContent
      icon={icon}
      label={label}
      shortcut={shortcut}
      trailing={<ChevronRight size={13} />}
    />
  );
}
