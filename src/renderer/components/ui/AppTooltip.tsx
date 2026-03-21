import React from 'react';
import * as RadixTooltip from '@radix-ui/react-tooltip';

type TooltipPlacement = 'top' | 'toolbar-leading' | 'toolbar-trailing' | 'pane-corner';

interface AppTooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  className?: string;
  delayDuration?: number;
  placement?: TooltipPlacement;
}

const DEFAULT_CONTENT_CLASSNAME = 'bg-zinc-800 text-zinc-100 px-2 py-1 rounded text-xs z-[1100] shadow-xl border border-zinc-700';

const placementProps: Record<TooltipPlacement, Pick<RadixTooltip.TooltipContentProps, 'side' | 'sideOffset'>> = {
  top: {
    side: 'top',
    sideOffset: 5,
  },
  // 顶部工具栏左侧按钮需要避开系统标题栏区域。
  'toolbar-leading': {
    side: 'bottom',
    sideOffset: 14,
  },
  // 顶部工具栏右侧按钮统一向左展示，避免 tooltip 落到鼠标正下方。
  'toolbar-trailing': {
    side: 'left',
    sideOffset: 8,
  },
  // Pane 右上角按钮同样向左展示，避免被光标遮挡。
  'pane-corner': {
    side: 'left',
    sideOffset: 8,
  },
};

export function AppTooltip({
  content,
  children,
  className = DEFAULT_CONTENT_CLASSNAME,
  delayDuration = 300,
  placement = 'top',
}: AppTooltipProps) {
  const { side, sideOffset } = placementProps[placement];

  return (
    <RadixTooltip.Provider delayDuration={delayDuration}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>
          {children}
        </RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content
            className={className}
            side={side}
            sideOffset={sideOffset}
          >
            {content}
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}
