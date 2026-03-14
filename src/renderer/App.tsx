import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { MainLayout } from './components/layout/MainLayout';
import { Sidebar } from './components/layout/Sidebar';
import { EmptyState } from './components/EmptyState';
import { CardGrid } from './components/CardGrid';
import { CreateGroupDialog } from './components/CreateGroupDialog';
import { ArchivedView } from './components/ArchivedView';
import { TerminalView } from './components/TerminalView';
import { GroupView } from './components/GroupView';
import { ViewSwitchError } from './components/ViewSwitchError';
import { CleanupOverlay } from './components/CleanupOverlay';
import { QuickNavPanel } from './components/QuickNavPanel';
import { useWindowStore } from './stores/windowStore';
import { useViewSwitcher } from './hooks/useViewSwitcher';
import { useWindowSwitcher } from './hooks/useWindowSwitcher';
import { useWorkspaceRestore } from './hooks/useWorkspaceRestore';
import { subscribeToPaneStatusChange, subscribeToWindowGitBranchChange } from './api/events';
import { Pane, Window } from './types/window';
import { WindowGroup } from '../shared/types/window-group';
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
  const activeGroupId = useWindowStore((state) => state.activeGroupId);
  const groups = useWindowStore((state) => state.groups);
  const setActiveGroup = useWindowStore((state) => state.setActiveGroup);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [showCreateGroupDialog, setShowCreateGroupDialog] = useState(false);
  const [currentTab, setCurrentTab] = useState<'active' | 'archived'>('active');
  const [searchQuery, setSearchQuery] = useState(''); // 搜索状态
  const [isQuickNavOpen, setIsQuickNavOpen] = useState(false); // 快捷导航面板状态
  const [appVersion, setAppVersion] = useState<{ name: string; version: string }>({
    name: 'Copilot-Terminal',
    version: '1.0.0',
  });

  // 获取应用版本信息
  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const result = await window.electronAPI.getAppVersion();
        if (result.success && result.data) {
          setAppVersion(result.data);
        }
      } catch (error) {
        console.error('Failed to get app version:', error);
      }
    };
    fetchVersion();
  }, []);

  // 工作区恢复
  useWorkspaceRestore();

  // 通知主进程渲染完成（延迟确保主题和样式完全应用）
  useEffect(() => {
    const timer = setTimeout(() => {
      window.electronAPI.notifyRendererReady();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // 全局快捷键：双击 Shift 唤出快捷导航（必须是两次完整的按下+松开）
  const lastShiftUpTime = useRef<number>(0);
  const shiftPressedDown = useRef<boolean>(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        // 忽略长按产生的重复事件
        if (e.repeat) return;
        shiftPressedDown.current = true;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift' && shiftPressedDown.current) {
        shiftPressedDown.current = false;
        const now = Date.now();
        const timeSinceLastUp = now - lastShiftUpTime.current;

        // 两次完整 Shift（松开间隔 < 300ms）才触发
        if (timeSinceLastUp < 300 && timeSinceLastUp > 0) {
          setIsQuickNavOpen(prev => !prev);
          lastShiftUpTime.current = 0; // 重置，避免连续触发
        } else {
          lastShiftUpTime.current = now;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
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
  const [mountedTerminalWindowIds, setMountedTerminalWindowIds] = useState<string[]>([]);

  useEffect(() => {
    if (!activeWindowId) {
      return;
    }

    setMountedTerminalWindowIds((previousIds) => (
      previousIds.includes(activeWindowId)
        ? previousIds
        : [...previousIds, activeWindowId]
    ));
  }, [activeWindowId]);

  useEffect(() => {
    const existingWindowIds = new Set(windows.map((window) => window.id));
    setMountedTerminalWindowIds((previousIds) => {
      const nextIds = previousIds.filter((id) => existingWindowIds.has(id));
      return nextIds.length === previousIds.length ? previousIds : nextIds;
    });
  }, [windows]);

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

  const handleCreateGroup = useCallback(() => {
    setShowCreateGroupDialog(true);
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

  // 进入组视图
  const handleEnterGroup = useCallback((group: WindowGroup) => {
    setActiveGroup(group.id);
  }, [setActiveGroup]);

  // 从组视图返回
  const handleReturnFromGroup = useCallback(() => {
    setActiveGroup(null);
    switchToUnifiedView();
  }, [setActiveGroup, switchToUnifiedView]);

  // 计算当前激活的组
  const activeGroup = useMemo(
    () => groups.find(g => g.id === activeGroupId),
    [groups, activeGroupId]
  );

  const mountedTerminalWindowIdSet = useMemo(
    () => new Set(mountedTerminalWindowIds),
    [mountedTerminalWindowIds]
  );
  const mountedTerminalWindows = useMemo(
    () => windows.filter((window) => mountedTerminalWindowIdSet.has(window.id)),
    [windows, mountedTerminalWindowIdSet]
  );
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
              appName={appVersion.name}
              version={appVersion.version}
              onCreateWindow={handleCreateWindow}
              onCreateGroup={handleCreateGroup}
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
              <CardGrid onEnterTerminal={handleEnterTerminal} onEnterGroup={handleEnterGroup} onCreateWindow={handleCreateWindow} searchQuery={searchQuery} />
            )
          ) : (
            <ArchivedView onEnterTerminal={handleEnterTerminal} searchQuery={searchQuery} />
          )}
        </MainLayout>
      </div>

      {/* 终端视图：窗口一旦打开过就保持挂载，仅切换显示状态，避免返回或窗口切换时销毁 xterm 实例 */}
      {mountedTerminalWindows.map((terminalWindow) => {
        const isVisible = currentView === 'terminal' && activeWindowId === terminalWindow.id;

        return (
          <div
            key={terminalWindow.id}
            className="transition-opacity duration-300"
            style={{
              display: isVisible ? 'block' : 'none',
              opacity: isVisible ? 1 : 0,
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 1000,
            }}
          >
            <TerminalView
              key={terminalWindow.id}
              window={terminalWindow}
              onReturn={switchToUnifiedView}
              onWindowSwitch={handleWindowSwitch}
              isActive={isVisible}
            />
          </div>
        );
      })}

      {error && <ViewSwitchError message={error} />}

      {/* 组视图：当 activeGroupId 有效时显示 */}
      {activeGroup && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1001,
          }}
        >
          <GroupView
            group={activeGroup}
            onReturn={handleReturnFromGroup}
            onWindowSwitch={handleWindowSwitch}
            isActive={true}
          />
        </div>
      )}

      {/* 清理进度覆盖层 */}
      <CleanupOverlay />

      {/* 快捷导航面板 */}
      <QuickNavPanel
        open={isQuickNavOpen}
        onClose={() => setIsQuickNavOpen(false)}
      />

      {/* 创建组对话框 */}
      {showCreateGroupDialog && (
        <CreateGroupDialog
          open={showCreateGroupDialog}
          onOpenChange={setShowCreateGroupDialog}
        />
      )}
    </>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <DndProvider backend={HTML5Backend}>
        <AppContent />
      </DndProvider>
    </I18nProvider>
  );
}
