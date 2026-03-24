import React from 'react';

export type TerminalTypeLogoVariant = 'local' | 'ssh' | 'mixed' | 'group';

interface TerminalTypeLogoProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant: TerminalTypeLogoVariant;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  badgeContent?: React.ReactNode;
}

const SIZE_CLASSES: Record<NonNullable<TerminalTypeLogoProps['size']>, string> = {
  xs: 'h-5 w-5 rounded-md',
  sm: 'h-6 w-6 rounded-[8px]',
  md: 'h-8 w-8 rounded-[10px]',
  lg: 'h-10 w-10 rounded-[12px]',
};

const BADGE_CLASSES: Record<NonNullable<TerminalTypeLogoProps['size']>, string> = {
  xs: 'min-w-[14px] h-[14px] px-1 text-[8px]',
  sm: 'min-w-[15px] h-[15px] px-1 text-[8px]',
  md: 'min-w-[17px] h-[17px] px-1 text-[9px]',
  lg: 'min-w-[18px] h-[18px] px-1 text-[9px]',
};

const VARIANT_CLASSES: Record<TerminalTypeLogoVariant, string> = {
  local: 'border-emerald-400/25 bg-[linear-gradient(135deg,rgba(16,185,129,0.24),rgba(34,197,94,0.10))] text-emerald-50',
  ssh: 'border-sky-400/25 bg-[linear-gradient(135deg,rgba(56,189,248,0.24),rgba(59,130,246,0.10))] text-sky-50',
  mixed: 'border-amber-400/25 bg-[linear-gradient(135deg,rgba(251,191,36,0.24),rgba(249,115,22,0.14),rgba(56,189,248,0.10))] text-amber-50',
  group: 'border-violet-400/25 bg-[linear-gradient(135deg,rgba(168,85,247,0.24),rgba(236,72,153,0.10))] text-violet-50',
};

function GlobeGlyph() {
  return (
    <g>
      <circle cx="17.25" cy="8.5" r="2.75" />
      <path d="M17.25 5.75v5.5" />
      <path d="M14.5 8.5h5.5" />
      <path d="M15.7 6.45c0.85 0.55 0.85 3.55 0 4.1" />
      <path d="M18.8 6.45c-0.85 0.55 -0.85 3.55 0 4.1" />
    </g>
  );
}

function TerminalFrame() {
  return (
    <>
      <rect x="3.5" y="5.25" width="17" height="13.5" rx="2.4" />
      <path d="M3.5 8.4h17" />
      <circle cx="6.1" cy="6.85" r="0.55" fill="currentColor" stroke="none" />
      <circle cx="8.15" cy="6.85" r="0.55" fill="currentColor" stroke="none" />
    </>
  );
}

function renderGlyph(variant: TerminalTypeLogoVariant) {
  switch (variant) {
    case 'local':
      return (
        <>
          <TerminalFrame />
          <path d="M7 11.2l2.35 2.1L7 15.4" />
          <path d="M11.25 15.35h4.4" />
        </>
      );
    case 'ssh':
      return (
        <>
          <rect x="3.5" y="6.25" width="12.75" height="11.5" rx="2.2" />
          <path d="M3.5 9h12.75" />
          <circle cx="5.8" cy="7.65" r="0.55" fill="currentColor" stroke="none" />
          <circle cx="7.85" cy="7.65" r="0.55" fill="currentColor" stroke="none" />
          <path d="M6.85 11.2l1.95 1.85-1.95 1.85" />
          <path d="M10.45 14.9h2.55" />
          <GlobeGlyph />
        </>
      );
    case 'mixed':
      return (
        <>
          <TerminalFrame />
          <path d="M11.95 8.65v7.35" />
          <path d="M6.8 11.25l1.9 1.75-1.9 1.75" />
          <path d="M9.95 14.75h0.95" />
          <g>
            <circle cx="16.15" cy="13.2" r="2.45" />
            <path d="M16.15 10.75v4.9" />
            <path d="M13.7 13.2h4.9" />
            <path d="M14.85 11.55c0.7 0.55 0.7 2.75 0 3.3" />
            <path d="M17.45 11.55c-0.7 0.55 -0.7 2.75 0 3.3" />
          </g>
        </>
      );
    case 'group':
      return (
        <>
          <TerminalFrame />
          <path d="M12 8.6v7.2" />
          <path d="M6.3 12.2h11.4" />
          <path d="M6.8 10.15h1.85" />
          <path d="M14.35 10.15h2.8" />
          <path d="M6.8 14.3h2.8" />
          <path d="M14.35 14.3h1.85" />
        </>
      );
  }
}

export const TerminalTypeLogo: React.FC<TerminalTypeLogoProps> = ({
  variant,
  size = 'sm',
  badgeContent,
  className = '',
  ...rest
}) => {
  return (
    <span
      aria-hidden="true"
      data-terminal-type-logo={variant}
      className={`
        pointer-events-none relative inline-flex shrink-0 items-center justify-center
        border shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]
        ${SIZE_CLASSES[size]}
        ${VARIANT_CLASSES[variant]}
        ${className}
      `}
      {...rest}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-[72%] w-[72%]"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {renderGlyph(variant)}
      </svg>

      {badgeContent != null && (
        <span
          className={`
            absolute -right-1 -top-1 inline-flex items-center justify-center rounded-full
            border border-zinc-950/50 bg-zinc-950/85 font-semibold leading-none text-white
            ${BADGE_CLASSES[size]}
          `}
        >
          {badgeContent}
        </span>
      )}
    </span>
  );
};

TerminalTypeLogo.displayName = 'TerminalTypeLogo';
