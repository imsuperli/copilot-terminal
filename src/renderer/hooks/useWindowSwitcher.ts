import { useCallback } from 'react';
import { useWindowStore } from '../stores/windowStore';
import { WindowStatus } from '../types/window';
import { getStartablePanes, isWindowStartable } from '../utils/windowLifecycle';
import { startWindowPanes } from '../utils/paneSessionActions';
import { markTerminalSwitchStart } from '../utils/perfObservability';
import type { WindowSwitchOptions } from '../types/windowSwitch';
import { resolveStandaloneSSHWindowSwitchTarget } from '../utils/sshWindowBindings';

/**
 * 窗口切换 Hook
 * 统一处理窗口切换逻辑：如果窗口当前没有活动会话，先切换到终端视图，再在后台启动可启动窗格
 */
export function useWindowSwitcher(onSwitchView: (windowId: string) => void | Promise<void>) {
  const switchToWindow = useCallback(async (windowId: string, options?: WindowSwitchOptions) => {
    const state = useWindowStore.getState();
    const { getWindowById, updatePane, setActiveWindow } = state;
    const resolvedWindowId = options?.exact
      ? windowId
      : resolveStandaloneSSHWindowSwitchTarget(state.windows, windowId, state.mruList);
    const win = getWindowById(resolvedWindowId);
    if (!win) {
      console.error('Window not found:', resolvedWindowId);
      return;
    }

    const panesToStart = getStartablePanes(win);

    if (isWindowStartable(win)) {
      markTerminalSwitchStart(win.id);
      setActiveWindow(win.id);
      void onSwitchView(win.id);

      void (async () => {
        const startTime = Date.now();
        console.log(`[useWindowSwitcher] Starting PTY processes for window ${win.id}...`);

        await startWindowPanes(win, updatePane, panesToStart);

        const totalStartDuration = Date.now() - startTime;
        console.log(`[useWindowSwitcher] All PTY processes started in ${totalStartDuration}ms`);
      })().catch((error) => {
        console.error('Failed to start window:', error);
        for (const pane of panesToStart) {
          updatePane(win.id, pane.id, {
            status: WindowStatus.Error,
            pid: null,
            sessionId: undefined,
          });
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
