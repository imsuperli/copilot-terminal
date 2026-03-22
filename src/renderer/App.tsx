import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { MainLayout } from './components/layout/MainLayout';
import { Sidebar } from './components/layout/Sidebar';
import { EmptyState } from './components/EmptyState';
import { CardGrid } from './components/CardGrid';
import { CreateGroupDialog } from './components/CreateGroupDialog';
import { TerminalView } from './components/TerminalView';
import { GroupView } from './components/GroupView';
import { ViewSwitchError } from './components/ViewSwitchError';
import { CleanupOverlay } from './components/CleanupOverlay';
import { QuickNavPanel } from './components/QuickNavPanel';
import { SSHProfileDialog } from './components/SSHProfileDialog';
import { useWindowStore } from './stores/windowStore';
import { useViewSwitcher } from './hooks/useViewSwitcher';
import { useWindowSwitcher } from './hooks/useWindowSwitcher';
import { useWorkspaceRestore } from './hooks/useWorkspaceRestore';
import { subscribeToPaneStatusChange, subscribeToWindowGitBranchChange } from './api/events';
import { Pane, Window } from './types/window';
import { WindowGroup } from '../shared/types/window-group';
import { I18nProvider } from './i18n';
import { SSHCredentialState, SSHProfile } from '../shared/types/ssh';
import type { SettingsPatch } from '../shared/types/electron-api';
import type {
  ClaudeModelUpdatedPayload,
  ProjectConfigUpdatedPayload,
  TmuxPaneStyleChangedPayload,
  TmuxPaneTitleChangedPayload,
  TmuxWindowRemovedPayload,
  TmuxWindowSyncedPayload,
} from '../shared/types/electron-api';
import './api/ptyDataBus';
import { getAllPanes } from './utils/layoutHelpers';
import { WORKSPACE_SETTINGS_UPDATED_EVENT } from './utils/settingsEvents';

function AppContent() {
  const windows = useWindowStore((state) => state.windows);
  const addWindow = useWindowStore((state) => state.addWindow);
  const syncWindow = useWindowStore((state) => state.syncWindow);
  const removeWindow = useWindowStore((state) => state.removeWindow);
  const updatePane = useWindowStore((state) => state.updatePane);
  const updateWindow = useWindowStore((state) => state.updateWindow);
  const updateWindowRuntime = useWindowStore((state) => state.updateWindowRuntime);
  const updateClaudeModel = useWindowStore((state) => state.updateClaudeModel);
  const storeActiveWindowId = useWindowStore((state) => state.activeWindowId);
  const activeGroupId = useWindowStore((state) => state.activeGroupId);
  const groups = useWindowStore((state) => state.groups);
  const setActiveGroup = useWindowStore((state) => state.setActiveGroup);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [showCreateGroupDialog, setShowCreateGroupDialog] = useState(false);
  const [isSSHDialogOpen, setIsSSHDialogOpen] = useState(false);
  const [editingSSHProfile, setEditingSSHProfile] = useState<SSHProfile | null>(null);
  const [sshProfiles, setSSHProfiles] = useState<SSHProfile[]>([]);
  const [sshCredentialStates, setSSHCredentialStates] = useState<Record<string, SSHCredentialState>>({});
  const [connectingSSHProfileId, setConnectingSSHProfileId] = useState<string | null>(null);
  const [importingSSHProfiles, setImportingSSHProfiles] = useState(false);
  const [sshEnabled, setSSHEnabled] = useState(false);
  const [currentTab, setCurrentTab] = useState<'all' | 'active' | 'archived' | string>('active');
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

  const loadWorkspaceSettings = useCallback(async () => {
    try {
      const response = await window.electronAPI.getSettings();
      if (response.success && response.data) {
        if (response.data.defaultSidebarTab) {
          setCurrentTab(response.data.defaultSidebarTab);
        }
        setSSHEnabled(response.data.features?.sshEnabled ?? true);
      }
    } catch (error) {
      console.error('Failed to load workspace settings:', error);
    }
  }, []);

  // 从 settings 恢复上次选择的侧边栏标签
  useEffect(() => {
    void loadWorkspaceSettings();
  }, [loadWorkspaceSettings]);

  useEffect(() => {
    const handleSettingsUpdated = (event: Event) => {
      const patch = (event as CustomEvent<SettingsPatch | undefined>).detail;
      if (typeof patch?.features?.sshEnabled === 'boolean') {
        setSSHEnabled(patch.features.sshEnabled);
        return;
      }

      void loadWorkspaceSettings();
    };

    window.addEventListener(WORKSPACE_SETTINGS_UPDATED_EVENT, handleSettingsUpdated);
    return () => {
      window.removeEventListener(WORKSPACE_SETTINGS_UPDATED_EVENT, handleSettingsUpdated);
    };
  }, [loadWorkspaceSettings]);

  const getSSHCredentialState = useCallback(async (profileId: string): Promise<SSHCredentialState> => {
    try {
      const response = await window.electronAPI.getSSHCredentialState(profileId);
      if (response?.success && response.data) {
        return response.data;
      }
    } catch (error) {
      console.error(`Failed to load SSH credential state for ${profileId}:`, error);
    }

    return {
      hasPassword: false,
      hasPassphrase: false,
    };
  }, []);

  const loadSSHProfiles = useCallback(async () => {
    try {
      const response = await window.electronAPI.listSSHProfiles();
      if (!response?.success || !response.data) {
        return;
      }

      setSSHProfiles(response.data);

      const entries = await Promise.all(
        response.data.map(async (profile) => ([profile.id, await getSSHCredentialState(profile.id)] as const)),
      );
      setSSHCredentialStates(Object.fromEntries(entries));
    } catch (error) {
      console.error('Failed to load SSH profiles:', error);
    }
  }, [getSSHCredentialState]);

  useEffect(() => {
    void loadSSHProfiles();
  }, [loadSSHProfiles]);

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
      updateWindowRuntime(windowId, { gitBranch });
    });
    return () => {
      unsubscribe();
    };
  }, [updateWindowRuntime]);

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
      updateWindowRuntime(payload.windowId, { projectConfig: payload.projectConfig ?? undefined });
    };

    window.electronAPI.onProjectConfigUpdated(handleProjectConfigUpdate);

    return () => {
      window.electronAPI?.offProjectConfigUpdated?.(handleProjectConfigUpdate);
    };
  }, [updateWindowRuntime]);

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

  const handleCreateSSHProfile = useCallback(() => {
    setEditingSSHProfile(null);
    setIsSSHDialogOpen(true);
  }, []);

  const handleEditSSHProfile = useCallback((profile: SSHProfile) => {
    setEditingSSHProfile(profile);
    setIsSSHDialogOpen(true);
  }, []);

  const handleSSHProfileDialogChange = useCallback((open: boolean) => {
    setIsSSHDialogOpen(open);
    if (!open) {
      setEditingSSHProfile(null);
    }
  }, []);

  const handleSSHProfileSaved = useCallback((profile: SSHProfile, credentialState: SSHCredentialState) => {
    setSSHProfiles((previousProfiles) => {
      const nextProfiles = previousProfiles.some((item) => item.id === profile.id)
        ? previousProfiles.map((item) => (item.id === profile.id ? profile : item))
        : [...previousProfiles, profile];

      return nextProfiles;
    });
    setSSHCredentialStates((previousStates) => ({
      ...previousStates,
      [profile.id]: credentialState,
    }));
  }, []);

  const handleDeleteSSHProfile = useCallback(async (profile: SSHProfile) => {
    if (!window.electronAPI) {
      return;
    }

    try {
      const response = await window.electronAPI.deleteSSHProfile(profile.id);
      if (!response?.success) {
        throw new Error(response?.error || `Failed to delete SSH profile ${profile.id}`);
      }

      setSSHProfiles((previousProfiles) => previousProfiles.filter((item) => item.id !== profile.id));
      setSSHCredentialStates((previousStates) => {
        const nextStates = { ...previousStates };
        delete nextStates[profile.id];
        return nextStates;
      });
    } catch (error) {
      console.error('Failed to delete SSH profile:', error);
    }
  }, []);

  const handleImportSSHProfiles = useCallback(async () => {
    if (importingSSHProfiles) {
      return;
    }

    setImportingSSHProfiles(true);
    try {
      const response = await window.electronAPI.importOpenSSHProfiles();
      if (!response?.success) {
        throw new Error(response?.error || 'Failed to import OpenSSH profiles');
      }

      await loadSSHProfiles();
    } catch (error) {
      console.error('Failed to import OpenSSH profiles:', error);
    } finally {
      setImportingSSHProfiles(false);
    }
  }, [importingSSHProfiles, loadSSHProfiles]);

  const handleConnectSSHProfile = useCallback(async (profile: SSHProfile) => {
    if (connectingSSHProfileId) {
      return;
    }

    setConnectingSSHProfileId(profile.id);
    try {
      const response = await window.electronAPI.createSSHWindow({
        profileId: profile.id,
        name: profile.name,
      });

      if (!response?.success || !response.data) {
        throw new Error(response?.error || `Failed to connect SSH profile ${profile.id}`);
      }

      addWindow(response.data);
      switchToWindow(response.data.id);
    } catch (error) {
      console.error('Failed to create SSH window:', error);
    } finally {
      setConnectingSSHProfileId(null);
    }
  }, [addWindow, connectingSSHProfileId, switchToWindow]);

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

  const handleTabChange = useCallback((tab: 'all' | 'active' | 'archived' | string) => {
    setCurrentTab(tab);
    // 持久化到 settings
    window.electronAPI?.updateSettings({ defaultSidebarTab: tab }).catch((error) => {
      console.error('Failed to save default sidebar tab:', error);
    });
  }, []);

  // 进入组视图
  const handleEnterGroup = useCallback(async (group: WindowGroup) => {
    // 先设置 activeGroup，这会清除 activeWindowId
    setActiveGroup(group.id);

    // 然后通知主进程切换到终端视图（使用组的活跃窗口 ID）
    // 这样点击关闭按钮时会返回主界面而不是退出软件
    // 注意：switchToTerminalView 会设置 activeWindowId，但由于我们已经设置了 activeGroupId，
    // 渲染时 GroupView 会优先显示（zIndex 更高）
    try {
      await window.electronAPI.switchToTerminalView(group.activeWindowId);
    } catch (error) {
      console.error('Failed to notify main process of view change:', error);
    }
  }, [setActiveGroup]);

  // 从组视图返回
  const handleReturnFromGroup = useCallback(() => {
    setActiveGroup(null);
    switchToUnifiedView();
  }, [setActiveGroup, switchToUnifiedView]);

  // 切换到其他组
  const handleGroupSwitch = useCallback(async (groupId: string) => {
    // 先设置 activeGroup
    setActiveGroup(groupId);

    // 获取目标组
    const targetGroup = groups.find(g => g.id === groupId);
    if (!targetGroup) {
      console.error('Target group not found:', groupId);
      return;
    }

    // 通知主进程切换到终端视图（使用组的活跃窗口 ID）
    try {
      await window.electronAPI.switchToTerminalView(targetGroup.activeWindowId);
    } catch (error) {
      console.error('Failed to notify main process of view change:', error);
    }
  }, [setActiveGroup, groups]);

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
  const sshProfileUsageCounts = useMemo(() => {
    const counts: Record<string, number> = {};

    windows.forEach((window) => {
      getAllPanes(window.layout).forEach((pane) => {
        const profileId = pane.ssh?.profileId;
        if (profileId) {
          counts[profileId] = (counts[profileId] ?? 0) + 1;
        }
      });
    });

    return counts;
  }, [windows]);
  const hasActiveWindows = useMemo(
    () => windows.some(w => !w.archived) || groups.some(g => !g.archived) || (sshEnabled && sshProfiles.length > 0),
    [groups, sshEnabled, sshProfiles.length, windows]
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
              onCreateSSHProfile={handleCreateSSHProfile}
              onImportSSHProfiles={handleImportSSHProfiles}
              sshEnabled={sshEnabled}
              importingSSHProfiles={importingSSHProfiles}
              sshProfileCount={sshProfiles.length}
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
          {currentTab === 'active' && !hasActiveWindows ? (
            <EmptyState onCreateWindow={handleCreateWindow} />
          ) : (
            <CardGrid
              onEnterTerminal={handleEnterTerminal}
              onEnterGroup={handleEnterGroup}
              onCreateWindow={handleCreateWindow}
              sshEnabled={sshEnabled}
              sshProfiles={sshProfiles}
              sshCredentialStates={sshCredentialStates}
              sshProfileUsageCounts={sshProfileUsageCounts}
              connectingSSHProfileId={connectingSSHProfileId}
              onConnectSSHProfile={handleConnectSSHProfile}
              onEditSSHProfile={handleEditSSHProfile}
              onDeleteSSHProfile={handleDeleteSSHProfile}
              searchQuery={searchQuery}
              currentTab={currentTab}
            />
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
              onGroupSwitch={handleGroupSwitch}
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
            onGroupSwitch={handleGroupSwitch}
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

      {sshEnabled && (
        <SSHProfileDialog
          open={isSSHDialogOpen}
          onOpenChange={handleSSHProfileDialogChange}
          profile={editingSSHProfile}
          profiles={sshProfiles}
          credentialState={editingSSHProfile ? sshCredentialStates[editingSSHProfile.id] : null}
          onSaved={handleSSHProfileSaved}
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
