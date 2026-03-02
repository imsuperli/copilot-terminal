import { useEffect, useCallback } from 'react';
import { useWindowStore, setAutoSaveEnabled } from '../stores/windowStore';
import { Window, WindowStatus } from '../types/window';
import { Workspace } from '../../main/types/workspace';

/**
 * 窗口恢复结果
 */
interface RestoreResult {
  windowId: string;
  pid: number | null;
  status: 'restoring' | 'error';
  error?: string;
}

/**
 * 工作区恢复 Hook
 *
 * 功能：
 * - 监听主进程的 workspace-loaded 事件
 * - 立即渲染卡片骨架屏（状态：Restoring）
 * - 监听 window-restored 事件，更新卡片状态
 * - 渐进式渲染：先显示骨架屏，后更新实际状态
 */
export const useWorkspaceRestore = () => {
  const addWindow = useWindowStore((state) => state.addWindow);
  const clearWindows = useWindowStore((state) => state.clearWindows);
  const updateWindowStatus = useWindowStore((state) => state.updateWindowStatus);

  /**
   * 处理工作区加载事件
   * 立即渲染所有窗口为暂停状态（不启动 PTY 进程）
   */
  const handleWorkspaceLoaded = useCallback((event: unknown, workspace: Workspace) => {
    console.log(`[useWorkspaceRestore] Workspace loaded with ${workspace.windows.length} windows`);

    // 禁用自动保存，避免恢复过程中的临时状态被保存
    setAutoSaveEnabled(false);

    // 先清空现有窗口，避免重复
    clearWindows();

    // 将所有窗口添加到 store（窗口已经包含正确的 layout 结构）
    for (const window of workspace.windows) {
      addWindow(window);
    }

    // 立即启用自动保存
    setTimeout(() => {
      setAutoSaveEnabled(true);
      console.log('[useWorkspaceRestore] Auto-save enabled, windows in paused state');
    }, 500);
  }, [addWindow, clearWindows]);

  /**
   * 处理窗口恢复完成事件
   * 更新窗口状态（Running/Error）
   */
  const handleWindowRestored = useCallback((event: unknown, result: RestoreResult) => {
    console.log(`[useWorkspaceRestore] Window restored: ${result.windowId} (status: ${result.status})`);

    if (result.status === 'error') {
      // 恢复失败，标记为错误状态
      updateWindowStatus(result.windowId, WindowStatus.Error);
    } else {
      // 恢复成功，标记为运行中
      // 实际状态将由 StatusPoller 检测并更新
      updateWindowStatus(result.windowId, WindowStatus.Running);
    }
  }, [updateWindowStatus]);

  /**
   * 订阅 IPC 事件
   */
  useEffect(() => {
    if (!window.electronAPI) {
      console.warn('[useWorkspaceRestore] electronAPI not available');
      return;
    }

    // 监听工作区加载事件
    window.electronAPI.onWorkspaceLoaded(handleWorkspaceLoaded);

    // 监听窗口恢复事件
    const handleWindowRestoredWrapper = (event: unknown, result: RestoreResult) => {
      handleWindowRestored(event, result);
    };

    // 注册事件监听器（使用 any 类型避免类型不匹配）
    const { ipcRenderer } = window as any;
    if (ipcRenderer) {
      ipcRenderer.on('window-restored', handleWindowRestoredWrapper);
    }

    // 清理事件监听器
    return () => {
      window.electronAPI.offWorkspaceLoaded(handleWorkspaceLoaded);
      if (ipcRenderer) {
        ipcRenderer.removeListener('window-restored', handleWindowRestoredWrapper);
      }
    };
  }, [handleWorkspaceLoaded, handleWindowRestored]);
};
