import React from 'react';

interface SidebarToggleIconProps extends React.SVGProps<SVGSVGElement> {
  expanded?: boolean;
  size?: number;
}

export const SidebarToggleIcon: React.FC<SidebarToggleIconProps> = ({
  expanded = true,
  size = 16,
  className = '',
  ...rest
}) => {
  const sidebarX = expanded ? 5.2 : 5.8;
  const sidebarWidth = expanded ? 3.6 : 2.2;
  const dividerX = expanded ? 10.2 : 9.2;
  const contentX = expanded ? 11.8 : 10.8;
  const contentWidth = expanded ? 7 : 8;

  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      {...rest}
    >
      <rect
        x="3.25"
        y="4.25"
        width="17.5"
        height="15.5"
        rx="3.1"
        stroke="currentColor"
        strokeWidth="1.7"
      />

      <rect
        x={sidebarX}
        y="6.35"
        width={sidebarWidth}
        height="11.3"
        rx="1.35"
        fill="currentColor"
        fillOpacity={expanded ? 0.2 : 0.1}
        stroke="currentColor"
        strokeOpacity={0.9}
        strokeWidth="1.15"
      />

      <line
        x1={dividerX}
        y1="6.2"
        x2={dividerX}
        y2="17.8"
        stroke="currentColor"
        strokeOpacity={0.9}
        strokeWidth="1.15"
        strokeLinecap="round"
      />

      <rect
        x={contentX}
        y="6.6"
        width={contentWidth}
        height="3.1"
        rx="1.1"
        fill="currentColor"
        fillOpacity="0.12"
      />

      <rect
        x={contentX}
        y="11.05"
        width={contentWidth}
        height="6.35"
        rx="1.3"
        fill="currentColor"
        fillOpacity="0.2"
      />
    </svg>
  );
};

SidebarToggleIcon.displayName = 'SidebarToggleIcon';
