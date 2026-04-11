import { useCallback } from 'react';
import { useWindowStore } from '../stores/windowStore';
import { WindowStatus } from '../types/window';
import { getAllPanes, getAggregatedStatus } from '../utils/layoutHelpers';
import { startWindowPanes } from '../utils/paneSessionActions';
import { markTerminalSwitchStart } from '../utils/perfObservability';

/**
 * 窗口切换 Hook
 * 统一处理窗口切换逻辑：如果窗口是暂停状态，先切换到终端视图，再在后台启动窗格
 */
export function useWindowSwitcher(onSwitchView: (windowId: string) => void | Promise<void>) {
  const switchToWindow = useCallback(async (windowId: string) => {
    const { getWindowById, updatePane, setActiveWindow } = useWindowStore.getState();
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
      markTerminalSwitchStart(win.id);
      setActiveWindow(win.id);
      void onSwitchView(win.id);

      void (async () => {
        const startTime = Date.now();
        console.log(`[useWindowSwitcher] Starting PTY processes for window ${win.id}...`);

        await startWindowPanes(win, updatePane, panes);

        const totalStartDuration = Date.now() - startTime;
        console.log(`[useWindowSwitcher] All PTY processes started in ${totalStartDuration}ms`);
      })().catch((error) => {
        console.error('Failed to start window:', error);
        for (const pane of panes) {
          updatePane(win.id, pane.id, { status: WindowStatus.Paused });
        }
      });

      return;
    }

    // 切换到终端视图
    markTerminalSwitchStart(win.id);
    setActiveWindow(win.id);
    void onSwitchView(win.id);
  }, [onSwitchView]);

  return { switchToWindow };
}
