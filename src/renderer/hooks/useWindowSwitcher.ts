import { useCallback } from 'react';
import { useWindowStore } from '../stores/windowStore';
import { WindowStatus } from '../types/window';
import { getAllPanes, getAggregatedStatus } from '../utils/layoutHelpers';

/**
 * 窗口切换 Hook
 * 统一处理窗口切换逻辑：如果窗口是暂停状态，先启动再切换
 */
export function useWindowSwitcher(onSwitchView: (windowId: string) => void) {
  const { getWindowById, updatePane, setActiveWindow } = useWindowStore();

  const switchToWindow = useCallback(async (windowId: string) => {
    const win = getWindowById(windowId);
    if (!win) {
      console.error('Window not found:', windowId);
      return;
    }

    // 获取窗口的聚合状态和所有窗格
    const aggregatedStatus = getAggregatedStatus(win.layout);
    const panes = getAllPanes(win.layout);

    // 如果窗口是暂停状态，启动所有窗格
    if (aggregatedStatus === WindowStatus.Paused) {
      try {
        // 更新所有窗格状态为 Restoring
        for (const pane of panes) {
          updatePane(win.id, pane.id, { status: WindowStatus.Restoring });
        }

        // 使用 requestAnimationFrame 确保 UI 已经更新（避免固定 200ms 阻塞）
        await new Promise(resolve => {
          requestAnimationFrame(() => resolve(undefined));
        });

        // 并发启动所有窗格，减少多窗格场景下的切换卡顿
        await Promise.all(
          panes.map(async (pane) => {
            const response = await window.electronAPI.startWindow({
              windowId: win.id,
              paneId: pane.id,
              name: win.name,
              workingDirectory: pane.cwd,
              command: pane.command,
            });

            if (response && response.success && response.data) {
              updatePane(win.id, pane.id, {
                pid: response.data.pid,
                status: response.data.status,
              });
            } else {
              console.error(`Failed to start pane ${pane.id}:`, response);
              updatePane(win.id, pane.id, { status: WindowStatus.Paused });
            }
          })
        );
      } catch (error) {
        console.error('Failed to start window:', error);
        // 恢复所有窗格状态为 Paused
        for (const pane of panes) {
          updatePane(win.id, pane.id, { status: WindowStatus.Paused });
        }
        return;
      }
    }

    // 切换到终端视图
    setActiveWindow(win.id);
    onSwitchView(win.id);
  }, [getWindowById, updatePane, setActiveWindow, onSwitchView]);

  return { switchToWindow };
}
