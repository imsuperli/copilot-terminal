import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { MainLayout } from './components/layout/MainLayout';
import { Sidebar } from './components/layout/Sidebar';
import { EmptyState } from './components/EmptyState';
import { CardGrid } from './components/CardGrid';
import { ArchivedView } from './components/ArchivedView';
import { TerminalView } from './components/TerminalView';
import { ViewSwitchError } from './components/ViewSwitchError';
import { CleanupOverlay } from './components/CleanupOverlay';
import { QuickNavPanel } from './components/QuickNavPanel';
import { useWindowStore } from './stores/windowStore';
import { useViewSwitcher } from './hooks/useViewSwitcher';
import { useWindowSwitcher } from './hooks/useWindowSwitcher';
import { useWorkspaceRestore } from './hooks/useWorkspaceRestore';
import { subscribeToPaneStatusChange, subscribeToWindowGitBranchChange } from './api/events';
import { Pane, Window } from './types/window';
import { I18nProvider } from './i18n';
import type {
  ClaudeModelUpdatedPayload,
  ProjectConfigUpdatedPayload,
  TmuxPaneStyleChangedPayload,
  TmuxPaneTitleChangedPayload,
  TmuxWindowRemovedPayload,
  TmuxWindowSyncedPayload,
} from '../shared/types/electron-api';
import './api/ptyDataBus';

function AppContent() {
  const windows = useWindowStore((state) => state.windows);
  const syncWindow = useWindowStore((state) => state.syncWindow);
  const removeWindow = useWindowStore((state) => state.removeWindow);
  const updatePane = useWindowStore((state) => state.updatePane);
  const updateWindow = useWindowStore((state) => state.updateWindow);
  const updateClaudeModel = useWindowStore((state) => state.updateClaudeModel);
  const storeActiveWindowId = useWindowStore((state) => state.activeWindowId);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [currentTab, setCurrentTab] = useState<'active' | 'archived'>('active');
  const [searchQuery, setSearchQuery] = useState(''); // 搜索状态
  const [isQuickNavOpen, setIsQuickNavOpen] = useState(false); // 快捷导航面板状态

  // 工作区恢复
  useWorkspaceRestore();

  // 通知主进程渲染完成（延迟确保主题和样式完全应用）
  useEffect(() => {
    const timer = setTimeout(() => {
      window.electronAPI.notifyRendererReady();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // 全局快捷键：双击 Shift 唤出快捷导航
  const lastShiftPressTime = useRef<number>(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 检测 Shift 键按下
      if (e.key === 'Shift') {
        const now = Date.now();
        const timeSinceLastPress = now - lastShiftPressTime.current;

        // 如果两次按下 Shift 的时间间隔小于 300ms，则触发面板
        if (timeSinceLastPress < 300 && timeSinceLastPress > 0) {
          e.preventDefault();
          setIsQuickNavOpen(prev => !prev);
          lastShiftPressTime.current = 0; // 重置，避免连续触发
        } else {
          lastShiftPressTime.current = now;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const {
    currentView,
    switchToTerminalView,
    switchToUnifiedView,
    error
  } = useViewSwitcher();

  // 使用统一的窗口切换逻辑
  const { switchToWindow } = useWindowSwitcher(switchToTerminalView);

  // 使用 store 的 activeWindowId，确保状态一致
  const activeWindowId = storeActiveWindowId;

  // 订阅主进程推送的窗格状态变化事件
  useEffect(() => {
    const unsubscribe = subscribeToPaneStatusChange((windowId, paneId, status) => {
      updatePane(windowId, paneId, { status });
    });
    return () => {
      unsubscribe();
    };
  }, [updatePane]);

  // 订阅主进程推送的 git 分支变化事件
  useEffect(() => {
    const unsubscribe = subscribeToWindowGitBranchChange((windowId, gitBranch) => {
      updateWindow(windowId, { gitBranch });
    });
    return () => {
      unsubscribe();
    };
  }, [updateWindow]);

  // 订阅 tmux pane 元数据变化事件
  useEffect(() => {
    if (
      !window.electronAPI?.onTmuxPaneTitleChanged ||
      !window.electronAPI?.onTmuxPaneStyleChanged ||
      !window.electronAPI?.onTmuxWindowSynced ||
      !window.electronAPI?.onTmuxWindowRemoved
    ) {
      return;
    }

    const handleTitleChanged = (_event: unknown, payload: TmuxPaneTitleChangedPayload) => {
      updatePane(payload.windowId, payload.paneId, { title: payload.title });
    };

    const handleStyleChanged = (_event: unknown, payload: TmuxPaneStyleChangedPayload) => {
      const updates: Partial<Pane> = {};
      if (payload.metadata.borderColor !== undefined) {
        updates.borderColor = payload.metadata.borderColor;
      }
      if (payload.metadata.activeBorderColor !== undefined) {
        updates.activeBorderColor = payload.metadata.activeBorderColor;
      }
      if (payload.metadata.agentName !== undefined) {
        updates.agentName = payload.metadata.agentName;
      }
      if (payload.metadata.agentColor !== undefined) {
        updates.agentColor = payload.metadata.agentColor;
      }
      if (payload.metadata.teamName !== undefined) {
        updates.teamName = payload.metadata.teamName;
      }
      if (Object.keys(updates).length > 0) {
        updatePane(payload.windowId, payload.paneId, updates);
      }
    };

    const handleWindowSynced = (_event: unknown, payload: TmuxWindowSyncedPayload) => {
      syncWindow(payload.window);
    };

    const handleWindowRemoved = (_event: unknown, payload: TmuxWindowRemovedPayload) => {
      removeWindow(payload.windowId);
    };

    window.electronAPI.onTmuxPaneTitleChanged(handleTitleChanged);
    window.electronAPI.onTmuxPaneStyleChanged(handleStyleChanged);
    window.electronAPI.onTmuxWindowSynced(handleWindowSynced);
    window.electronAPI.onTmuxWindowRemoved(handleWindowRemoved);

    return () => {
      window.electronAPI?.offTmuxPaneTitleChanged?.(handleTitleChanged);
      window.electronAPI?.offTmuxPaneStyleChanged?.(handleStyleChanged);
      window.electronAPI?.offTmuxWindowSynced?.(handleWindowSynced);
      window.electronAPI?.offTmuxWindowRemoved?.(handleWindowRemoved);
    };
  }, [removeWindow, syncWindow, updatePane]);

  // 订阅主进程推送的项目配置更新事件
  useEffect(() => {
    if (!window.electronAPI?.onProjectConfigUpdated) return;

    const handleProjectConfigUpdate = (_event: unknown, payload: ProjectConfigUpdatedPayload) => {
      updateWindow(payload.windowId, { projectConfig: payload.projectConfig ?? undefined });
    };

    window.electronAPI.onProjectConfigUpdated(handleProjectConfigUpdate);

    return () => {
      window.electronAPI?.offProjectConfigUpdated?.(handleProjectConfigUpdate);
    };
  }, [updateWindow]);

  // 订阅主进程推送的 Claude 模型更新事件
  useEffect(() => {
    if (!window.electronAPI?.onClaudeModelUpdated) return;

    const handleClaudeModelUpdate = (_event: unknown, payload: ClaudeModelUpdatedPayload) => {
      updateClaudeModel(payload.windowId, payload.model, payload.modelId, payload.contextPercentage, payload.cost);
    };

    window.electronAPI.onClaudeModelUpdated(handleClaudeModelUpdate);

    return () => {
      window.electronAPI?.offClaudeModelUpdated?.(handleClaudeModelUpdate);
    };
  }, [updateClaudeModel]);

  const handleCreateWindow = useCallback(() => {
    setIsDialogOpen(true);
  }, []);

  const handleDialogChange = useCallback((open: boolean) => {
    setIsDialogOpen(open);
  }, []);

  const handleEnterTerminal = useCallback((win: Window) => {
    switchToWindow(win.id);
  }, [switchToWindow]);

  const handleWindowSwitch = useCallback((windowId: string) => {
    switchToWindow(windowId);
  }, [switchToWindow]);

  const handleTabChange = useCallback((tab: 'active' | 'archived') => {
    setCurrentTab(tab);
  }, []);

  // 获取当前活跃窗口
  const activeWindow = useMemo(
    () => windows.find((w) => w.id === activeWindowId),
    [windows, activeWindowId]
  );
  const mountedTerminalWindow = activeWindow ?? null;
  const hasActiveWindows = useMemo(
    () => windows.some(w => !w.archived),
    [windows]
  );

  return (
    <>
      {/* 统一视图 - 淡入淡出 */}
      <div
        className="transition-opacity duration-300"
        style={{
          display: currentView === 'unified' ? 'block' : 'none',
          opacity: currentView === 'unified' ? 1 : 0,
        }}
      >
        <MainLayout
          sidebar={
            <Sidebar
              appName="Copilot-Terminal"
              version="0.1.0"
              onCreateWindow={handleCreateWindow}
              isDialogOpen={isDialogOpen}
              onDialogChange={handleDialogChange}
              currentTab={currentTab}
              onTabChange={handleTabChange}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
            />
          }
        >
          {currentTab === 'active' ? (
            !hasActiveWindows ? (
              <EmptyState onCreateWindow={handleCreateWindow} />
            ) : (
              <CardGrid onEnterTerminal={handleEnterTerminal} onCreateWindow={handleCreateWindow} searchQuery={searchQuery} />
            )
          ) : (
            <ArchivedView onEnterTerminal={handleEnterTerminal} searchQuery={searchQuery} />
          )}
        </MainLayout>
      </div>

      {/* 终端视图：仅保留当前活跃窗口实例；返回主界面时隐藏而不卸载，避免运行中的 xterm 缓冲丢失 */}
      {mountedTerminalWindow && (
        <div
          key={mountedTerminalWindow.id}
          className="transition-opacity duration-300"
          style={{
            display: currentView === 'terminal' ? 'block' : 'none',
            opacity: currentView === 'terminal' ? 1 : 0,
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1000,
          }}
        >
          <TerminalView
            key={mountedTerminalWindow.id}
            window={mountedTerminalWindow}
            onReturn={switchToUnifiedView}
            onWindowSwitch={handleWindowSwitch}
            isActive={currentView === 'terminal'}
          />
        </div>
      )}

      {error && <ViewSwitchError message={error} />}

      {/* 清理进度覆盖层 */}
      <CleanupOverlay />

      {/* 快捷导航面板 */}
      <QuickNavPanel
        open={isQuickNavOpen}
        onClose={() => setIsQuickNavOpen(false)}
      />
    </>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <AppContent />
    </I18nProvider>
  );
}
