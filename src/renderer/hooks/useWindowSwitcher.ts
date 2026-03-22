import { useCallback } from 'react';
import { useWindowStore } from '../stores/windowStore';
import { WindowStatus } from '../types/window';
import { getAllPanes, getAggregatedStatus } from '../utils/layoutHelpers';

/**
 * 窗口切换 Hook
 * 统一处理窗口切换逻辑：如果窗口是暂停状态，先切换到终端视图，再在后台启动窗格
 */
export function useWindowSwitcher(onSwitchView: (windowId: string) => void | Promise<void>) {
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
      // 先把 UI 切到 restoring 状态，终端视图可以立即挂载，占位 pane 后续再补 pid/status。
      for (const pane of panes) {
        updatePane(win.id, pane.id, { status: WindowStatus.Restoring });
      }

      setActiveWindow(win.id);
      void onSwitchView(win.id);

      void (async () => {
        const startTime = Date.now();
        console.log(`[useWindowSwitcher] Starting PTY processes for window ${win.id}...`);

        await Promise.all(
          panes.map(async (pane) => {
            const paneStartTime = Date.now();
            const response = await window.electronAPI.startWindow({
              windowId: win.id,
              paneId: pane.id,
              name: win.name,
              workingDirectory: pane.cwd,
              command: pane.command,
            });
            const paneStartDuration = Date.now() - paneStartTime;
            console.log(`[useWindowSwitcher] Pane ${pane.id} PTY started in ${paneStartDuration}ms`);

            if (response && response.success && response.data) {
              updatePane(win.id, pane.id, {
                pid: response.data.pid,
                sessionId: response.data.sessionId,
                status: response.data.status,
              });
            } else {
              console.error(`Failed to start pane ${pane.id}:`, response);
              updatePane(win.id, pane.id, { status: WindowStatus.Paused });
            }
          })
        );

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
    setActiveWindow(win.id);
    void onSwitchView(win.id);
  }, [getWindowById, updatePane, setActiveWindow, onSwitchView]);

  return { switchToWindow };
}
