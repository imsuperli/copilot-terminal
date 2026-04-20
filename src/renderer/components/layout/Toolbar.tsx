import React from 'react';
import { Button } from '../ui/Button';
import { CreateWindowDialog } from '../CreateWindowDialog';
import { StatusBar } from '../StatusBar';
import { useWindowStore } from '../../stores/windowStore';

interface ToolbarProps {
  appName?: string;
  version?: string;
  onCreateWindow?: () => void;
  isDialogOpen?: boolean;
  onDialogChange?: (open: boolean) => void;
}

export function Toolbar({
  appName = 'ausome-terminal',
  version = '0.1.0',
  onCreateWindow,
  isDialogOpen = false,
  onDialogChange,
}: ToolbarProps) {
  const windowCount = useWindowStore((state) => state.windows.length);
  const showNewWindowButton = windowCount > 0;

  return (
    <>
      <header className="h-14 px-6 flex items-center justify-between bg-bg-card border-b border-border-subtle">
        {/* 左侧：应用名称和版本 */}
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-text-primary">
            {appName}
          </h1>
          <span className="text-sm text-text-secondary">
            v{version}
          </span>
        </div>

        {/* 右侧：状态统计栏 + 新建窗口按钮（仅在有窗口时显示） */}
        <div className="flex items-center gap-3">
          <StatusBar />
          {showNewWindowButton && (
            <Button
              variant="primary"
              onClick={onCreateWindow}
            >
              + 新建窗口
            </Button>
          )}
        </div>
      </header>

      <CreateWindowDialog
        open={isDialogOpen}
        onOpenChange={onDialogChange ?? (() => {})}
      />
    </>
  );
}
