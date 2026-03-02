import { useCallback } from 'react';
import { useWindowStore } from '../stores/windowStore';
import { WindowStatus } from '../types/window';

/**
 * 窗口切换 Hook
 * 统一处理窗口切换逻辑：如果窗口是暂停状态，先启动再切换
 */
export function useWindowSwitcher(onSwitchView: (windowId: string) => void) {
  const { getWindowById, updateWindow, setActiveWindow } = useWindowStore();

  const switchToWindow = useCallback(async (windowId: string) => {
    const win = getWindowById(windowId);
    if (!win) {
      console.error('Window not found:', windowId);
      return;
    }

    // 如果窗口是暂停状态，先启动
    if (win.status === WindowStatus.Paused) {
      try {
        // 更新状态为 Restoring
        updateWindow(win.id, { status: WindowStatus.Restoring });

        // 启动窗口
        const result = await window.electronAPI.startWindow({
          windowId: win.id,
          name: win.name,
          workingDirectory: win.workingDirectory,
          command: win.command,
        });

        // 更新窗口信息
        updateWindow(win.id, {
          pid: result.pid,
          status: result.status,
        });

        // 等待一小段时间让终端初始化
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (error) {
        console.error('Failed to start window:', error);
        updateWindow(win.id, { status: WindowStatus.Paused });
        return;
      }
    }

    // 切换到终端视图
    setActiveWindow(win.id);
    onSwitchView(win.id);
  }, [getWindowById, updateWindow, setActiveWindow, onSwitchView]);

  return { switchToWindow };
}
