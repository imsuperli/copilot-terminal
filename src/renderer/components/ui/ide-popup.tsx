import React from 'react';

function joinClassNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export const idePopupOverlayClassName =
  'fixed inset-0 bg-[rgba(0,0,0,0.44)] backdrop-blur-[2px]';

export const idePopupSurfaceClassName = joinClassNames(
  'overflow-hidden rounded-[14px] border border-[rgb(var(--border))]',
  'bg-[linear-gradient(180deg,var(--appearance-pane-background-strong)_0%,var(--appearance-pane-background)_100%)]',
  'shadow-[0_22px_60px_rgba(0,0,0,0.28)] ring-1 ring-white/5 backdrop-blur-[14px]',
);

export const idePopupHeaderClassName = joinClassNames(
  'flex items-start justify-between gap-3 border-b border-[rgb(var(--border))]',
  'bg-[linear-gradient(180deg,var(--appearance-pane-chrome-background)_0%,var(--appearance-card-surface-top)_100%)]',
  'px-3 py-2.5',
);

export const idePopupHeaderMetaClassName =
  'text-[10px] font-semibold uppercase tracking-[0.18em] text-[rgb(var(--muted-foreground))]';

export const idePopupTitleClassName =
  'truncate text-sm font-semibold leading-5 text-[rgb(var(--foreground))]';

export const idePopupSubtitleClassName =
  'truncate text-[11px] leading-4 text-[rgb(var(--muted-foreground))]';

export const idePopupBodyClassName =
  'min-h-0 flex-1 overflow-auto bg-[var(--appearance-pane-background)]';

export const idePopupSectionClassName =
  'border-b border-[rgb(var(--border))] bg-[var(--appearance-pane-chrome-background)]';

export const idePopupInsetClassName = joinClassNames(
  'rounded-[12px] border border-[rgb(var(--border))]',
  'bg-[var(--appearance-pane-background)] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]',
);

export const idePopupChromePanelClassName = joinClassNames(
  'rounded-[12px] border border-[rgb(var(--border))]',
  'bg-[var(--appearance-pane-chrome-background)] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]',
);

export const idePopupFieldSurfaceClassName = joinClassNames(
  'border border-[rgb(var(--border))]',
  'bg-[var(--appearance-pane-background)] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]',
);

export const idePopupIconButtonClassName = joinClassNames(
  'inline-flex h-7 w-7 items-center justify-center rounded-md border border-[rgb(var(--border))]',
  'bg-[var(--appearance-pane-chrome-background)] text-[rgb(var(--muted-foreground))] transition-colors',
  'hover:border-[rgb(var(--ring))] hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--foreground))]',
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--ring))]/60',
);

export const idePopupScrollAreaClassName = '';

export const idePopupFieldShellClassName = joinClassNames(
  'flex items-center gap-2 rounded-[10px] border border-[rgb(var(--border))]',
  'bg-[var(--appearance-pane-background)] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]',
  'transition-[border-color,box-shadow] focus-within:border-[rgb(var(--ring))]/70 focus-within:ring-1 focus-within:ring-[rgb(var(--ring))]/25',
);

export const idePopupCardClassName = joinClassNames(
  'rounded-[12px] border border-[rgb(var(--border))] bg-[linear-gradient(180deg,var(--appearance-card-surface-top)_0%,var(--appearance-card-surface-bottom)_100%)] px-3 py-3',
  'shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]',
);

export const idePopupTooltipClassName = joinClassNames(
  'z-[1100] rounded-lg border border-[rgb(var(--border))] px-2 py-1 text-xs text-[rgb(var(--foreground))]',
  'bg-[rgb(var(--card))]',
  'shadow-[0_16px_38px_rgba(0,0,0,0.28)] ring-1 ring-white/5',
);

export const idePopupListCardClassName = joinClassNames(
  'relative overflow-hidden rounded-xl border border-[rgb(var(--border))]',
  'bg-[linear-gradient(180deg,var(--appearance-card-surface-top)_0%,var(--appearance-card-surface-bottom)_100%)]',
  'shadow-[0_18px_38px_rgba(0,0,0,0.14)]',
  'backdrop-blur-[16px]',
);

export const idePopupListCardFooterClassName = joinClassNames(
  'border-t border-[rgb(var(--border))]',
  'bg-[linear-gradient(180deg,var(--appearance-card-surface-bottom)_0%,var(--appearance-pane-chrome-background)_100%)]',
);

export const idePopupInteractiveListCardClassName = joinClassNames(
  idePopupListCardClassName,
  'cursor-pointer transition-all duration-200 ease-out',
  'hover:bg-[linear-gradient(180deg,var(--appearance-card-hover-surface-top)_0%,var(--appearance-card-hover-surface-bottom)_100%)]',
  'hover:shadow-[0_24px_48px_rgba(0,0,0,0.18)] hover:scale-[1.02]',
  'active:scale-[0.98] active:bg-[rgb(var(--accent))]/30 active:shadow-inner',
  'outline-none focus:outline-none focus:ring-0 focus:border-[rgb(var(--border))]',
);

export const idePopupAccentCardClassName = joinClassNames(
  'rounded-[12px] border border-[rgb(var(--primary))]/28 bg-[rgb(var(--primary))]/8 px-3 py-3',
  'shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]',
);

export const idePopupPanelClassName = joinClassNames(
  'rounded-[24px] border border-[rgb(var(--border))] p-6',
  'bg-[linear-gradient(180deg,var(--appearance-pane-background-strong)_0%,var(--appearance-pane-background)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]',
);

export const idePopupSubtlePanelClassName = joinClassNames(
  'rounded-[20px] border border-[rgb(var(--border))] p-4',
  'bg-[var(--appearance-pane-chrome-background)] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]',
);

export const idePopupBarePanelClassName = joinClassNames(
  'rounded-[20px] border border-[rgb(var(--border))] p-4',
  'bg-[var(--appearance-pane-background)] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]',
);

export const idePopupEmptyStateClassName = joinClassNames(
  'rounded-[24px] border border-dashed border-[rgb(var(--border))]',
  'bg-[var(--appearance-pane-chrome-background)]',
);

export const idePopupSecondaryButtonClassName = joinClassNames(
  'inline-flex items-center justify-center rounded-md border border-[rgb(var(--border))] bg-[var(--appearance-pane-chrome-background)] px-4 py-2',
  'text-sm font-medium text-[rgb(var(--foreground))] transition-colors',
  'hover:border-[rgb(var(--ring))] hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--foreground))]',
  'disabled:cursor-not-allowed disabled:border-[rgb(var(--border))] disabled:bg-[rgb(var(--secondary))] disabled:text-[rgb(var(--muted-foreground))]',
);

export const idePopupTonalButtonClassName = joinClassNames(
  'rounded-md border border-[rgb(var(--border))] bg-[var(--appearance-pane-chrome-background)]',
  'text-[rgb(var(--foreground))] transition-colors',
  'hover:border-[rgb(var(--ring))]/55 hover:bg-[rgb(var(--accent))]',
  'disabled:cursor-not-allowed disabled:opacity-60',
);

export const idePopupInputClassName = joinClassNames(
  'w-full rounded-2xl border border-[rgb(var(--border))] px-4 py-3 text-sm text-[rgb(var(--foreground))]',
  'bg-[var(--appearance-pane-background)] placeholder:text-[rgb(var(--muted-foreground))] outline-none transition-[border-color,box-shadow]',
  'focus:border-[rgb(var(--ring))] focus:ring-2 focus:ring-[rgb(var(--ring))]/20',
);

export const idePopupNativeSelectClassName = joinClassNames(
  idePopupInputClassName,
  'appearance-auto',
);

export const idePopupSelectTriggerClassName = joinClassNames(
  'flex w-full items-center justify-between rounded-2xl border border-[rgb(var(--border))] px-4 py-3 text-left text-sm text-[rgb(var(--foreground))]',
  'bg-[var(--appearance-pane-background)] transition-[border-color,box-shadow,background-color]',
  'hover:bg-[rgb(var(--accent))] focus:outline-none focus:border-[rgb(var(--ring))] focus:ring-2 focus:ring-[rgb(var(--ring))]/20',
);

export const idePopupSelectContentClassName = joinClassNames(
  'overflow-hidden rounded-2xl border border-[rgb(var(--border))]',
  'bg-[linear-gradient(180deg,var(--appearance-pane-background-strong)_0%,var(--appearance-pane-background)_100%)]',
  'shadow-[0_22px_60px_rgba(0,0,0,0.28)] ring-1 ring-white/5 backdrop-blur-[14px]',
);

export const idePopupSelectItemClassName = joinClassNames(
  'flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none transition-colors',
  'hover:bg-[rgb(var(--accent))]',
);

export const idePopupSwitchThumbClassName =
  'block h-6 w-6 translate-x-0.5 rounded-full bg-[var(--appearance-pane-background-strong)] shadow-sm transition-transform data-[state=checked]:translate-x-[22px]';

export const idePopupActionButtonClassName = (tone: 'primary' | 'success' | 'warning' | 'danger' = 'primary') => joinClassNames(
  'inline-flex min-w-[112px] items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors',
  'disabled:cursor-not-allowed disabled:border-[rgb(var(--border))] disabled:bg-[rgb(var(--secondary))] disabled:text-[rgb(var(--muted-foreground))]',
  tone === 'primary'
    ? 'border-[rgb(var(--primary))]/72 bg-[rgb(var(--primary))] text-[rgb(var(--primary-foreground))] hover:opacity-92'
    : tone === 'success'
      ? 'border-[rgb(var(--success))/0.70] bg-[rgb(var(--success))] text-[rgb(var(--background))] hover:opacity-92'
      : tone === 'warning'
        ? 'border-[rgb(var(--warning))/0.70] bg-[rgb(var(--warning))] text-[rgb(var(--background))] hover:opacity-92'
        : 'border-[rgb(var(--error))/0.70] bg-[rgb(var(--error))] text-[rgb(var(--foreground))] hover:opacity-92',
);

export const idePopupMicroButtonClassName = (tone: 'neutral' | 'primary' | 'success' | 'warning' | 'danger' = 'neutral') => joinClassNames(
  'rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-colors',
  tone === 'neutral'
    ? 'border-[rgb(var(--border))] bg-[var(--appearance-pane-chrome-background)] text-[rgb(var(--foreground))] hover:border-[rgb(var(--ring))] hover:bg-[rgb(var(--accent))]'
    : tone === 'primary'
      ? 'border-[rgb(var(--primary))]/30 bg-[rgb(var(--primary))]/10 text-[rgb(var(--primary))] hover:border-[rgb(var(--primary))]/52 hover:bg-[rgb(var(--primary))]/16'
      : tone === 'success'
        ? 'border-[rgb(var(--success))/0.30] bg-[rgb(var(--success))/0.08] text-[rgb(var(--success))] hover:border-[rgb(var(--success))/0.50] hover:bg-[rgb(var(--success))/0.14]'
        : tone === 'warning'
          ? 'border-[rgb(var(--warning))/0.30] bg-[rgb(var(--warning))/0.08] text-[rgb(var(--warning))] hover:border-[rgb(var(--warning))/0.50] hover:bg-[rgb(var(--warning))/0.14]'
          : 'border-[rgb(var(--error))/0.30] bg-[rgb(var(--error))/0.08] text-[rgb(var(--error))] hover:border-[rgb(var(--error))/0.50] hover:bg-[rgb(var(--error))/0.14]',
);

export const idePopupToggleButtonClassName = (active: boolean) => joinClassNames(
  'inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[11px] transition-colors',
  active
    ? 'border-[rgb(var(--primary))]/65 bg-[rgb(var(--primary))]/8 text-[rgb(var(--primary))] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]'
    : 'border-[rgb(var(--border))] bg-transparent text-[rgb(var(--muted-foreground))] hover:border-[rgb(var(--ring))] hover:text-[rgb(var(--foreground))]',
);

export const idePopupToggleIndicatorClassName = (active: boolean) => joinClassNames(
  'flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border text-[9px] font-semibold leading-none',
  active
    ? 'border-[rgb(var(--primary))]/80 bg-transparent text-[rgb(var(--primary))]'
    : 'border-[rgb(var(--border))] bg-transparent text-transparent',
);

export const idePopupRowClassName = (active: boolean) => joinClassNames(
  'group flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors',
  active
    ? 'bg-[rgb(var(--primary))]/10 text-[rgb(var(--foreground))] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]'
    : 'text-[rgb(var(--foreground))] hover:bg-[rgb(var(--accent))]',
);

export const idePopupBadgeClassName = (tone: 'red' | 'amber' | 'sky' | 'emerald' | 'violet' | 'zinc') => {
  switch (tone) {
    case 'red':
      return 'border-[rgb(var(--error))/0.45] bg-[rgb(var(--error))/0.08] text-[rgb(var(--error))]';
    case 'amber':
      return 'border-[rgb(var(--warning))/0.45] bg-[rgb(var(--warning))/0.08] text-[rgb(var(--warning))]';
    case 'sky':
      return 'border-[rgb(var(--primary))]/45 bg-[rgb(var(--primary))]/10 text-[rgb(var(--primary))]';
    case 'emerald':
      return 'border-[rgb(var(--success))/0.45] bg-[rgb(var(--success))/0.08] text-[rgb(var(--success))]';
    case 'violet':
      return 'border-violet-400/45 bg-violet-500/[0.08] text-violet-200';
    default:
      return 'border-[rgb(var(--border))] bg-[var(--appearance-pane-chrome-background)] text-[rgb(var(--muted-foreground))]';
  }
};

export const idePopupPillClassName = joinClassNames(
  'inline-flex items-center gap-1 rounded-full border border-[rgb(var(--border))] px-2 py-1 text-xs',
  'bg-[var(--appearance-pane-chrome-background)]',
);

interface IdePopupShellProps {
  className?: string;
  children: React.ReactNode;
}

export function IdePopupShell({ className, children }: IdePopupShellProps) {
  return <div className={joinClassNames(idePopupSurfaceClassName, className)}>{children}</div>;
}
