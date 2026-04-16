import React from 'react';
import { ChevronRight } from 'lucide-react';

function joinClassNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export const ideMenuContentClassName = joinClassNames(
  'z-[140] min-w-[220px] overflow-hidden rounded-[12px] border border-zinc-700/80 p-1.5',
  'bg-[linear-gradient(180deg,rgba(44,47,54,0.98)_0%,rgba(30,32,37,0.98)_100%)]',
  'shadow-[0_20px_48px_rgba(0,0,0,0.45)] ring-1 ring-black/25 backdrop-blur',
);

export const ideMenuSeparatorClassName = 'my-1.5 h-px bg-zinc-700/70';

export const ideMenuItemClassName = joinClassNames(
  'group flex cursor-pointer select-none items-center gap-2 rounded-[8px] px-2.5 py-2',
  'text-[12px] text-zinc-100 outline-none transition-colors',
  'focus:bg-zinc-700/80 data-[highlighted]:bg-zinc-700/80',
  'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-35',
);

export const ideMenuDangerItemClassName = joinClassNames(
  ideMenuItemClassName,
  'text-red-200 focus:bg-red-500/12 data-[highlighted]:bg-red-500/12',
);

export const ideMenuSubTriggerClassName = joinClassNames(
  ideMenuItemClassName,
  'justify-between',
);

export const ideMenuShortcutClassName =
  'ml-auto pl-3 text-[11px] text-zinc-500 group-data-[highlighted]:text-zinc-300';

export const ideMenuLabelClassName = 'truncate';

export const ideMenuIconSlotClassName =
  'flex h-4 w-4 shrink-0 items-center justify-center text-zinc-400 group-data-[highlighted]:text-zinc-100';

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
      {trailing ? <span className="ml-2 shrink-0 text-zinc-500" aria-hidden="true">{trailing}</span> : null}
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
