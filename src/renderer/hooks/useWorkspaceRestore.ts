import { useEffect, useCallback } from 'react';
import { useWindowStore, setAutoSaveEnabled } from '../stores/windowStore';
import { Workspace } from '../../shared/types/workspace';

/**
 * 工作区恢复 Hook
 *
 * 功能：
 * - 监听主进程的 workspace-loaded 事件
 * - 立即渲染卡片（状态：Paused，不启动 PTY 进程）
 * - 渐进式渲染：先显示卡片，状态由 StatusPoller 实时更新
 */
export const useWorkspaceRestore = () => {
  const addWindow = useWindowStore((state) => state.addWindow);
  const clearWindows = useWindowStore((state) => state.clearWindows);

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

    console.log(`[useWorkspaceRestore] Restored ${workspace.windows.length} windows`);

    // 延迟启用自动保存，确保所有窗口都已添加完成
    // 使用更长的延迟（2秒）确保恢复过程完全完成
    setTimeout(() => {
      setAutoSaveEnabled(true);
      console.log('[useWorkspaceRestore] Auto-save enabled, windows in paused state');
    }, 2000);
  }, [addWindow, clearWindows]);

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

    // 清理事件监听器
    return () => {
      window.electronAPI.offWorkspaceLoaded(handleWorkspaceLoaded);
    };
  }, [handleWorkspaceLoaded]);
};
