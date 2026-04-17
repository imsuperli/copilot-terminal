import React from 'react';

function joinClassNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export const idePopupOverlayClassName =
  'fixed inset-0 bg-[rgba(3,6,12,0.68)] backdrop-blur-[2px]';

export const idePopupSurfaceClassName = joinClassNames(
  'overflow-hidden rounded-[14px] border border-zinc-800/90',
  'bg-[linear-gradient(180deg,rgba(38,41,47,0.985)_0%,rgba(24,26,31,0.985)_100%)]',
  'shadow-[0_22px_60px_rgba(0,0,0,0.5)] ring-1 ring-white/5',
);

export const idePopupHeaderClassName = joinClassNames(
  'flex items-start justify-between gap-3 border-b border-zinc-800/90',
  'bg-[linear-gradient(180deg,rgba(48,51,58,0.96)_0%,rgba(36,39,45,0.93)_100%)]',
  'px-3 py-2.5',
);

export const idePopupHeaderMetaClassName =
  'text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500';

export const idePopupTitleClassName =
  'truncate text-sm font-semibold leading-5 text-zinc-100';

export const idePopupSubtitleClassName =
  'truncate text-[11px] leading-4 text-zinc-400';

export const idePopupBodyClassName =
  'min-h-0 flex-1 overflow-auto bg-[linear-gradient(180deg,rgba(26,28,33,0.96)_0%,rgba(21,23,28,0.98)_100%)]';

export const idePopupSectionClassName =
  'border-b border-zinc-800/80 bg-zinc-950/35';

export const idePopupIconButtonClassName = joinClassNames(
  'inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-700/70',
  'bg-zinc-950/45 text-zinc-400 transition-colors',
  'hover:border-zinc-500/90 hover:bg-zinc-800/90 hover:text-zinc-100',
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/70',
);

export const idePopupScrollAreaClassName = '';

export const idePopupFieldShellClassName = joinClassNames(
  'flex items-center gap-2 rounded-[10px] border border-zinc-700/80',
  'bg-zinc-950/65 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]',
  'transition-[border-color,box-shadow] focus-within:border-sky-400/50 focus-within:ring-1 focus-within:ring-sky-500/30',
);

export const idePopupCardClassName = joinClassNames(
  'rounded-[12px] border border-zinc-700/70 bg-zinc-950/30 px-3 py-3',
  'shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]',
);

export const idePopupAccentCardClassName = joinClassNames(
  'rounded-[12px] border border-sky-500/25 bg-sky-500/[0.05] px-3 py-3',
  'shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]',
);

export const idePopupSecondaryButtonClassName = joinClassNames(
  'inline-flex items-center justify-center rounded-md border border-zinc-700/80 bg-zinc-900/80 px-4 py-2',
  'text-sm font-medium text-zinc-300 transition-colors',
  'hover:border-zinc-500 hover:bg-zinc-800/90 hover:text-zinc-100',
  'disabled:cursor-not-allowed disabled:border-zinc-800 disabled:bg-zinc-900/50 disabled:text-zinc-500',
);

export const idePopupActionButtonClassName = (tone: 'primary' | 'success' | 'warning' | 'danger' = 'primary') => joinClassNames(
  'inline-flex min-w-[112px] items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors',
  'disabled:cursor-not-allowed disabled:border-zinc-800 disabled:bg-zinc-900/50 disabled:text-zinc-500',
  tone === 'primary'
    ? 'border-sky-500/70 bg-sky-600/90 text-white hover:border-sky-400 hover:bg-sky-500'
    : tone === 'success'
      ? 'border-emerald-500/70 bg-emerald-600/90 text-white hover:border-emerald-400 hover:bg-emerald-500'
      : tone === 'warning'
        ? 'border-amber-500/70 bg-amber-600/90 text-white hover:border-amber-400 hover:bg-amber-500'
        : 'border-red-500/70 bg-red-600/90 text-white hover:border-red-400 hover:bg-red-500',
);

export const idePopupMicroButtonClassName = (tone: 'neutral' | 'primary' | 'success' | 'warning' | 'danger' = 'neutral') => joinClassNames(
  'rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-colors',
  tone === 'neutral'
    ? 'border-zinc-700/80 bg-zinc-900/70 text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800/90 hover:text-zinc-50'
    : tone === 'primary'
      ? 'border-sky-500/30 bg-sky-500/[0.08] text-sky-200 hover:border-sky-400/50 hover:bg-sky-500/[0.14]'
      : tone === 'success'
        ? 'border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-200 hover:border-emerald-400/50 hover:bg-emerald-500/[0.14]'
        : tone === 'warning'
          ? 'border-amber-500/30 bg-amber-500/[0.08] text-amber-200 hover:border-amber-400/50 hover:bg-amber-500/[0.14]'
          : 'border-red-500/30 bg-red-500/[0.08] text-red-200 hover:border-red-400/50 hover:bg-red-500/[0.14]',
);

export const idePopupToggleButtonClassName = (active: boolean) => joinClassNames(
  'inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[11px] transition-colors',
  active
    ? 'border-sky-500/60 bg-transparent text-sky-200 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.08)]'
    : 'border-zinc-700/80 bg-transparent text-zinc-300 hover:border-zinc-500 hover:text-zinc-100',
);

export const idePopupToggleIndicatorClassName = (active: boolean) => joinClassNames(
  'flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border text-[9px] font-semibold leading-none',
  active
    ? 'border-sky-400/80 bg-transparent text-sky-200'
    : 'border-zinc-600 bg-transparent text-transparent',
);

export const idePopupRowClassName = (active: boolean) => joinClassNames(
  'group flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors',
  active
    ? 'bg-sky-500/[0.10] text-zinc-50 shadow-[inset_0_0_0_1px_rgba(125,211,252,0.2)]'
    : 'text-zinc-200 hover:bg-zinc-800/70',
);

export const idePopupBadgeClassName = (tone: 'red' | 'amber' | 'sky' | 'emerald' | 'violet' | 'zinc') => {
  switch (tone) {
    case 'red':
      return 'border-red-400/45 bg-red-500/[0.08] text-red-200';
    case 'amber':
      return 'border-amber-400/45 bg-amber-500/[0.08] text-amber-200';
    case 'sky':
      return 'border-sky-400/45 bg-sky-500/[0.08] text-sky-200';
    case 'emerald':
      return 'border-emerald-400/45 bg-emerald-500/[0.08] text-emerald-200';
    case 'violet':
      return 'border-violet-400/45 bg-violet-500/[0.08] text-violet-200';
    default:
      return 'border-zinc-500/60 bg-zinc-500/[0.08] text-zinc-300';
  }
};

interface IdePopupShellProps {
  className?: string;
  children: React.ReactNode;
}

export function IdePopupShell({ className, children }: IdePopupShellProps) {
  return <div className={joinClassNames(idePopupSurfaceClassName, className)}>{children}</div>;
}
