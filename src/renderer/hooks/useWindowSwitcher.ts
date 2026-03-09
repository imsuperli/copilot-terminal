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

        // 等待所有窗格的 PTY 输出缓冲区有数据（表示 PowerShell 已初始化完成）
        const waitStartTime = Date.now();
        const maxWaitTime = 3000; // 最多等待 3 秒
        const checkInterval = 50; // 每 50ms 检查一次

        while (Date.now() - waitStartTime < maxWaitTime) {
          // 检查所有窗格是否都有输出
          const outputChecks = await Promise.all(
            panes.map(async (pane) => {
              const response = await window.electronAPI.checkPtyOutput(win.id, pane.id);
              return response && response.success && response.data?.hasOutput;
            })
          );

          const allHaveOutput = outputChecks.every(hasOutput => hasOutput === true);

          if (allHaveOutput) {
            const waitDuration = Date.now() - waitStartTime;
            console.log(`[useWindowSwitcher] All panes have output after ${waitDuration}ms, switching view now`);
            break;
          }

          // 等待 50ms 后再检查
          await new Promise(resolve => setTimeout(resolve, checkInterval));
        }

        if (Date.now() - waitStartTime >= maxWaitTime) {
          console.warn('[useWindowSwitcher] Timeout waiting for PTY output, switching anyway');
        }
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
