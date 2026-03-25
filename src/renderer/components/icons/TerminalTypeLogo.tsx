import React from 'react';

export type TerminalTypeLogoVariant = 'local' | 'ssh' | 'mixed' | 'group';

interface TerminalTypeLogoProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant: TerminalTypeLogoVariant;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  badgeContent?: React.ReactNode;
}

const SIZE_CLASSES: Record<NonNullable<TerminalTypeLogoProps['size']>, string> = {
  xs: 'h-6 w-6 rounded-[10px]',
  sm: 'h-7 w-7 rounded-[11px]',
  md: 'h-9 w-9 rounded-[14px]',
  lg: 'h-12 w-12 rounded-[16px]',
};

const BADGE_CLASSES: Record<NonNullable<TerminalTypeLogoProps['size']>, string> = {
  xs: 'min-w-[15px] h-[15px] px-1 text-[8px]',
  sm: 'min-w-[17px] h-[17px] px-1 text-[9px]',
  md: 'min-w-[19px] h-[19px] px-1.5 text-[9px]',
  lg: 'min-w-[22px] h-[22px] px-1.5 text-[10px]',
};

const VARIANT_CLASSES: Record<TerminalTypeLogoVariant, string> = {
  local: 'border-emerald-100/45 bg-[linear-gradient(145deg,rgba(16,185,129,0.96),rgba(132,204,22,0.9))] shadow-[0_10px_22px_rgba(16,185,129,0.24)]',
  ssh: 'border-cyan-100/45 bg-[linear-gradient(145deg,rgba(37,99,235,0.96),rgba(34,211,238,0.92))] shadow-[0_10px_22px_rgba(14,165,233,0.24)]',
  mixed: 'border-orange-100/45 bg-[linear-gradient(145deg,rgba(249,115,22,0.95),rgba(250,204,21,0.88),rgba(56,189,248,0.84))] shadow-[0_10px_22px_rgba(249,115,22,0.22)]',
  group: 'border-fuchsia-100/40 bg-[linear-gradient(145deg,rgba(168,85,247,0.96),rgba(236,72,153,0.9))] shadow-[0_10px_22px_rgba(168,85,247,0.22)]',
};

function LocalGlyph() {
  return (
    <>
      <rect x="4" y="5.5" width="16" height="13" rx="3" fill="#082f49" fillOpacity={0.16} stroke="#064e3b" strokeWidth="1.5" />
      <path d="M4 8.6h16" stroke="#064e3b" strokeWidth="1.5" />
      <circle cx="6.35" cy="7.05" r="0.65" fill="#fef08a" />
      <circle cx="8.45" cy="7.05" r="0.65" fill="#d1fae5" />
      <path d="M7.1 12.05l2.3 2.05-2.3 2.05" stroke="#052e16" strokeWidth="1.75" />
      <path d="M11.2 16.15h4.9" stroke="#052e16" strokeWidth="1.75" />
      <rect x="14.9" y="11.2" width="2.8" height="2.8" rx="0.9" fill="#ecfccb" />
    </>
  );
}

function SSHGlyph() {
  return (
    <>
      <rect x="4.2" y="5.2" width="10" height="13.6" rx="2.8" fill="#082f49" fillOpacity={0.16} stroke="#0c4a6e" strokeWidth="1.5" />
      <circle cx="6.6" cy="8" r="0.72" fill="#e0f2fe" />
      <path d="M8.1 8h3.5" stroke="#082f49" strokeWidth="1.5" />
      <circle cx="6.6" cy="12" r="0.72" fill="#e0f2fe" />
      <path d="M8.1 12h3.5" stroke="#082f49" strokeWidth="1.5" />
      <circle cx="6.6" cy="16" r="0.72" fill="#e0f2fe" />
      <path d="M8.1 16h2.2" stroke="#082f49" strokeWidth="1.5" />
      <circle cx="17.45" cy="8.5" r="1.9" fill="#ecfeff" stroke="#075985" strokeWidth="1.25" />
      <circle cx="17.45" cy="15.1" r="1.9" fill="#cffafe" stroke="#075985" strokeWidth="1.25" />
      <path d="M14.2 10.05h1.4" stroke="#075985" strokeWidth="1.4" />
      <path d="M14.2 13.65h1.4" stroke="#075985" strokeWidth="1.4" />
      <path d="M17.45 10.4v2.8" stroke="#075985" strokeWidth="1.4" />
    </>
  );
}

function MixedGlyph() {
  return (
    <>
      <rect x="4" y="5.5" width="16" height="13" rx="3" fill="#431407" fillOpacity={0.15} stroke="#7c2d12" strokeWidth="1.5" />
      <path d="M4 8.6h16" stroke="#7c2d12" strokeWidth="1.5" />
      <path d="M12 8.7v9.6" stroke="#9a3412" strokeWidth="1.35" strokeOpacity={0.7} />
      <circle cx="6.35" cy="7.05" r="0.65" fill="#fde68a" />
      <circle cx="8.45" cy="7.05" r="0.65" fill="#bae6fd" />
      <path d="M6.9 12.15l1.95 1.75-1.95 1.75" stroke="#7c2d12" strokeWidth="1.65" />
      <path d="M10 15.95h1.1" stroke="#7c2d12" strokeWidth="1.65" />
      <circle cx="16.3" cy="11.55" r="1.65" fill="#fef3c7" stroke="#9a3412" strokeWidth="1.15" />
      <circle cx="16.3" cy="15.8" r="1.65" fill="#dbeafe" stroke="#9a3412" strokeWidth="1.15" />
      <path d="M16.3 13.25v0.9" stroke="#9a3412" strokeWidth="1.15" />
      <path d="M14.45 13.7h3.7" stroke="#9a3412" strokeWidth="1.15" />
    </>
  );
}

function GroupGlyph() {
  return (
    <>
      <rect x="4.4" y="5.8" width="6.1" height="4.7" rx="1.45" fill="#faf5ff" fillOpacity={0.2} stroke="#581c87" strokeWidth="1.35" />
      <rect x="13.5" y="5.8" width="6.1" height="4.7" rx="1.45" fill="#fdf2f8" fillOpacity={0.18} stroke="#831843" strokeWidth="1.35" />
      <rect x="4.4" y="13.5" width="6.1" height="4.7" rx="1.45" fill="#f5f3ff" fillOpacity={0.18} stroke="#6d28d9" strokeWidth="1.35" />
      <rect x="13.5" y="13.5" width="6.1" height="4.7" rx="1.45" fill="#fdf2f8" fillOpacity={0.16} stroke="#be185d" strokeWidth="1.35" />
      <circle cx="12" cy="12" r="1.35" fill="#fdf4ff" stroke="#701a75" strokeWidth="1.05" />
      <path d="M10.5 10.7l0.7 0.7" stroke="#701a75" strokeWidth="1.05" />
      <path d="M13.5 10.7l-0.7 0.7" stroke="#701a75" strokeWidth="1.05" />
      <path d="M10.5 13.3l0.7-0.7" stroke="#701a75" strokeWidth="1.05" />
      <path d="M13.5 13.3l-0.7-0.7" stroke="#701a75" strokeWidth="1.05" />
    </>
  );
}

function renderGlyph(variant: TerminalTypeLogoVariant) {
  switch (variant) {
    case 'local':
      return <LocalGlyph />;
    case 'ssh':
      return <SSHGlyph />;
    case 'mixed':
      return <MixedGlyph />;
    case 'group':
      return <GroupGlyph />;
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
        pointer-events-none relative inline-flex shrink-0 items-center justify-center overflow-hidden
        border shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_4px_12px_rgba(15,23,42,0.18)]
        ${SIZE_CLASSES[size]}
        ${VARIANT_CLASSES[variant]}
        ${className}
      `}
      {...rest}
    >
      <span className="absolute inset-0 bg-[radial-gradient(circle_at_28%_18%,rgba(255,255,255,0.32),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.16),transparent_58%)]" />

      <svg
        viewBox="0 0 24 24"
        className="relative z-10 h-[78%] w-[78%]"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {renderGlyph(variant)}
      </svg>

      {badgeContent != null && (
        <span
          className={`
            absolute -right-1 -top-1 z-20 inline-flex items-center justify-center rounded-full
            border border-zinc-950/50 bg-zinc-950/88 font-semibold leading-none text-white
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
