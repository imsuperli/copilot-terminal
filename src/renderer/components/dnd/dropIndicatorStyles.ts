import type React from 'react';
import type { DropPosition } from './types';

export const edgeDropIndicatorPositionStyles: Record<Exclude<DropPosition, 'center'>, React.CSSProperties> = {
  left: { left: 0, top: 0, width: '50%', height: '100%' },
  right: { right: 0, top: 0, width: '50%', height: '100%' },
  top: { left: 0, top: 0, width: '100%', height: '50%' },
  bottom: { left: 0, bottom: 0, width: '100%', height: '50%' },
};

export function getDropIndicatorVisualStyle(position: DropPosition): React.CSSProperties {
  const isCenter = position === 'center';

  return {
    backgroundColor: isCenter
      ? 'rgba(59, 130, 246, 0.18)'
      : 'rgba(59, 130, 246, 0.24)',
    border: `2px dashed ${isCenter ? 'rgba(96, 165, 250, 0.82)' : 'rgba(59, 130, 246, 0.76)'}`,
    borderRadius: '0.75rem',
    boxShadow: isCenter
      ? '0 0 0 1px rgba(191, 219, 254, 0.22) inset, 0 10px 28px rgba(37, 99, 235, 0.18)'
      : '0 0 0 1px rgba(191, 219, 254, 0.18) inset, 0 8px 24px rgba(37, 99, 235, 0.14)',
    pointerEvents: 'none',
    zIndex: 20,
    transition: 'all 120ms ease',
  };
}
