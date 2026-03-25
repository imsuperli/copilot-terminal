import React from 'react';

export type TerminalTypeLogoVariant = 'local' | 'ssh' | 'mixed' | 'group';

interface TerminalTypeLogoProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant: TerminalTypeLogoVariant;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  badgeContent?: React.ReactNode;
}

const SIZE_CLASSES: Record<NonNullable<TerminalTypeLogoProps['size']>, string> = {
  xs: 'h-6 w-6 rounded-md',
  sm: 'h-7 w-7 rounded-md',
  md: 'h-9 w-9 rounded-lg',
  lg: 'h-12 w-12 rounded-xl',
};

const BADGE_CLASSES: Record<NonNullable<TerminalTypeLogoProps['size']>, string> = {
  xs: 'min-w-[15px] h-[15px] px-1 text-[8px]',
  sm: 'min-w-[17px] h-[17px] px-1 text-[9px]',
  md: 'min-w-[19px] h-[19px] px-1.5 text-[9px]',
  lg: 'min-w-[22px] h-[22px] px-1.5 text-[10px]',
};

const VARIANT_CLASSES: Record<TerminalTypeLogoVariant, string> = {
  local: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400',
  ssh:   'bg-sky-500/10 border-sky-500/25 text-sky-400',
  mixed: 'bg-amber-500/10 border-amber-500/25 text-amber-400',
  group: 'bg-violet-500/10 border-violet-500/25 text-violet-400',
};

/** >_ 终端提示符 */
function LocalGlyph() {
  return (
    <>
      <polyline points="5,9.5 9.2,12 5,14.5" strokeWidth="1.75" />
      <line x1="12" y1="14.5" x2="19" y2="14.5" strokeWidth="1.75" />
    </>
  );
}

/** 客户端→虚线→服务器，代表 SSH 远程连接 */
function SSHGlyph() {
  return (
    <>
      <circle cx="5.5" cy="12" r="2.2" strokeWidth="1.6" />
      <line x1="7.7" y1="12" x2="13.8" y2="12" strokeWidth="1.4" strokeDasharray="2 1.5" />
      <rect x="13.8" y="8.5" width="5.8" height="7" rx="1.5" strokeWidth="1.6" />
      <line x1="15.4" y1="11" x2="18.2" y2="11" strokeWidth="1.1" />
      <line x1="15.4" y1="12.8" x2="18.2" y2="12.8" strokeWidth="1.1" />
    </>
  );
}

/** 双面板分割图，代表本地+远程混合 */
function MixedGlyph() {
  return (
    <>
      <rect x="4.5" y="6.5" width="6.2" height="11" rx="1.6" strokeWidth="1.55" />
      <rect x="13.3" y="6.5" width="6.2" height="11" rx="1.6" strokeWidth="1.55" />
      <polyline points="6.2,10.2 8.5,12 6.2,13.8" strokeWidth="1.35" />
      <line x1="15" y1="10.5" x2="17.8" y2="10.5" strokeWidth="1.35" />
      <line x1="15" y1="12.8" x2="17.8" y2="12.8" strokeWidth="1.35" />
    </>
  );
}

/** 2×2 网格，代表窗口组 */
function GroupGlyph() {
  return (
    <>
      <rect x="4.5" y="4.5" width="6" height="6" rx="1.3" strokeWidth="1.55" />
      <rect x="13.5" y="4.5" width="6" height="6" rx="1.3" strokeWidth="1.55" />
      <rect x="4.5" y="13.5" width="6" height="6" rx="1.3" strokeWidth="1.55" />
      <rect x="13.5" y="13.5" width="6" height="6" rx="1.3" strokeWidth="1.55" />
    </>
  );
}

function renderGlyph(variant: TerminalTypeLogoVariant) {
  switch (variant) {
    case 'local': return <LocalGlyph />;
    case 'ssh':   return <SSHGlyph />;
    case 'mixed': return <MixedGlyph />;
    case 'group': return <GroupGlyph />;
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
        border
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
