import React from 'react';

function joinClassNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export const idePopupOverlayClassName =
  'fixed inset-0 bg-[rgba(3,6,12,0.72)] backdrop-blur-[3px]';

export const idePopupSurfaceClassName = joinClassNames(
  'overflow-hidden rounded-[14px] border border-zinc-700/80',
  'bg-[linear-gradient(180deg,rgba(44,47,54,0.98)_0%,rgba(27,29,34,0.98)_100%)]',
  'shadow-[0_24px_64px_rgba(0,0,0,0.55)] ring-1 ring-black/30',
);

export const idePopupHeaderClassName = joinClassNames(
  'flex items-start justify-between gap-3 border-b border-zinc-700/80',
  'bg-[linear-gradient(180deg,rgba(53,56,63,0.96)_0%,rgba(42,45,52,0.9)_100%)]',
  'px-3 py-2.5',
);

export const idePopupHeaderMetaClassName =
  'text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500';

export const idePopupTitleClassName =
  'truncate text-sm font-semibold leading-5 text-zinc-100';

export const idePopupSubtitleClassName =
  'truncate text-[11px] leading-4 text-zinc-400';

export const idePopupBodyClassName =
  'min-h-0 flex-1 overflow-auto bg-[rgba(28,30,35,0.92)]';

export const idePopupSectionClassName =
  'border-b border-zinc-800/90 bg-[rgba(34,36,42,0.94)]';

export const idePopupIconButtonClassName = joinClassNames(
  'inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-700/80',
  'bg-zinc-900/60 text-zinc-400 transition-colors',
  'hover:border-zinc-500 hover:bg-zinc-800 hover:text-zinc-100',
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/70',
);

export const idePopupScrollAreaClassName = '';

export const idePopupToggleButtonClassName = (active: boolean) => joinClassNames(
  'inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[11px] transition-colors',
  active
    ? 'border-sky-500/60 bg-sky-500/15 text-sky-100'
    : 'border-zinc-700/80 bg-zinc-900/50 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800/90 hover:text-zinc-100',
);

export const idePopupToggleIndicatorClassName = (active: boolean) => joinClassNames(
  'flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border text-[9px] font-semibold leading-none',
  active
    ? 'border-sky-400/80 bg-sky-400/15 text-sky-200'
    : 'border-zinc-600 bg-zinc-950/70 text-transparent',
);

export const idePopupRowClassName = (active: boolean) => joinClassNames(
  'group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
  active
    ? 'bg-[#324a7a] text-zinc-100 shadow-[inset_0_0_0_1px_rgba(147,197,253,0.2)]'
    : 'text-zinc-200 hover:bg-zinc-800/85',
);

export const idePopupBadgeClassName = (tone: 'red' | 'amber' | 'sky' | 'emerald' | 'violet' | 'zinc') => {
  switch (tone) {
    case 'red':
      return 'border-red-400/60 bg-red-500/10 text-red-300';
    case 'amber':
      return 'border-amber-400/60 bg-amber-500/10 text-amber-300';
    case 'sky':
      return 'border-sky-400/60 bg-sky-500/10 text-sky-300';
    case 'emerald':
      return 'border-emerald-400/60 bg-emerald-500/10 text-emerald-300';
    case 'violet':
      return 'border-violet-400/60 bg-violet-500/10 text-violet-300';
    default:
      return 'border-zinc-500/70 bg-zinc-500/10 text-zinc-300';
  }
};

interface IdePopupShellProps {
  className?: string;
  children: React.ReactNode;
}

export function IdePopupShell({ className, children }: IdePopupShellProps) {
  return <div className={joinClassNames(idePopupSurfaceClassName, className)}>{children}</div>;
}
