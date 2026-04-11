import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { MainLayout } from './components/layout/MainLayout';
import { Sidebar } from './components/layout/Sidebar';
import { EmptyState } from './components/EmptyState';
import { CardGrid } from './components/CardGrid';
import { CreateGroupDialog } from './components/CreateGroupDialog';
import { CreateWindowDialog } from './components/CreateWindowDialog';
import { TerminalView } from './components/TerminalView';
import { GroupView } from './components/GroupView';
import { ViewSwitchError } from './components/ViewSwitchError';
import { CleanupOverlay } from './components/CleanupOverlay';
import { QuickNavPanel } from './components/QuickNavPanel';
import { SSHHostKeyPromptDialog } from './components/SSHHostKeyPromptDialog';
import { SSHPasswordPromptDialog } from './components/SSHPasswordPromptDialog';
import { CustomTitleBar } from './components/CustomTitleBar';
import { useWindowStore } from './stores/windowStore';
import { useViewSwitcher } from './hooks/useViewSwitcher';
import { useWindowSwitcher } from './hooks/useWindowSwitcher';
import { useWorkspaceRestore } from './hooks/useWorkspaceRestore';
import { subscribeToPaneStatusChange, subscribeToWindowGitBranchChange } from './api/events';
import { Pane, Window, WindowStatus } from './types/window';
import { WindowGroup } from '../shared/types/window-group';
import { I18nProvider } from './i18n';
import { SSHCredentialState, SSHProfile } from '../shared/types/ssh';
import type { SettingsPatch } from '../shared/types/electron-api';
import type {
  ClaudeModelUpdatedPayload,
  ProjectConfigUpdatedPayload,
  SSHHostKeyPromptPayload,
  TmuxPaneStyleChangedPayload,
  TmuxPaneTitleChangedPayload,
  TmuxWindowRemovedPayload,
  TmuxWindowSyncedPayload,
} from '../shared/types/electron-api';
import './api/ptyDataBus';
import { getAggregatedStatus, getAllPanes } from './utils/layoutHelpers';
import { WORKSPACE_SETTINGS_UPDATED_EVENT } from './utils/settingsEvents';
import {
  authNeedsPassword,
  SSH_PASSWORD_CLEARED_EVENT,
  SSH_PASSWORD_SAVED_EVENT,
  setSSHPasswordPromptHandler,
  type SSHPasswordPromptRequest,
} from './utils/sshPasswordPrompt';
import { APP_ERROR_EVENT, type AppErrorEventDetail } from './utils/appNotice';
import { isSSHPasswordPromptCancelled, runSSHActionWithPasswordRetry } from './utils/sshConnectionRetry';
import { isEphemeralSSHCloneWindow } from './utils/sshWindowBindings';
import { useShallow } from 'zustand/react/shallow';

const QUICK_NAV_DOUBLE_SHIFT_INTERVAL_MS = 150;
const UNLOADABLE_HIDDEN_WINDOW_STATUSES = new Set<WindowStatus>([
  WindowStatus.Paused,
  WindowStatus.Completed,
  WindowStatus.Error,
]);

function findReusableSSHWindow(windows: Window[], profileId: string): Window | null {
  const matchedWindows = windows.filter((window) => {
    if (window.archived || isEphemeralSSHCloneWindow(window)) {
      return false;
    }

    return getAllPanes(window.layout).some((pane) => pane.ssh?.profileId === profileId);
  });

  if (matchedWindows.length === 0) {
    return null;
  }

  matchedWindows.sort((left, right) => (
    new Date(right.lastActiveAt).getTime() - new Date(left.lastActiveAt).getTime()
  ));

  return matchedWindows[0] ?? null;
}

function resolveSSHProfileEntryCwd(profile: SSHProfile): string {
  const normalized = profile.defaultRemoteCwd?.trim();
  return normalized || '~';
}

function resolveSSHProfileEntryCommand(profile: SSHProfile): string {
  return profile.remoteCommand || '';
}

function selectMountedWindowRecordKeys(state: { windows: Window[] }) {
  return state.windows.map((window) => `${window.id}:${getAggregatedStatus(window.layout)}`);
}

const MountedTerminalSurface = React.memo(({
  isVisible,
  onGroupSwitch,
  onReturn,
  onSSHProfileSaved,
  onWindowSwitch,
  sshEnabled,
  sshProfiles,
  windowId,
}: {
  isVisible: boolean;
  onGroupSwitch: (groupId: string) => void | Promise<void>;
  onReturn: () => void;
  onSSHProfileSaved: (profile: SSHProfile, credentialState: SSHCredentialState) => void;
  onWindowSwitch: (windowId: string) => void;
  sshEnabled: boolean;
  sshProfiles: SSHProfile[];
  windowId: string;
}) => {
  const terminalWindow = useWindowStore((state) => (
    state.windows.find((window) => window.id === windowId) ?? null
  ));

  if (!terminalWindow) {
    return null;
  }

  const isMac = window.electronAPI?.platform === 'darwin';
  const titleBarHeight = isMac ? 36 : 32;

  return (
    <div
      className="transition-opacity duration-300"
      style={{
        display: isVisible ? 'block' : 'none',
        opacity: isVisible ? 1 : 0,
        position: 'fixed',
        top: titleBarHeight,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
      }}
    >
      <TerminalView
        key={terminalWindow.id}
        window={terminalWindow}
        onReturn={onReturn}
        onWindowSwitch={onWindowSwitch}
        onGroupSwitch={onGroupSwitch}
        isActive={isVisible}
        sshEnabled={sshEnabled}
        sshProfiles={sshProfiles}
        onSSHProfileSaved={onSSHProfileSaved}
      />
    </div>
  );
});

MountedTerminalSurface.displayName = 'MountedTerminalSurface';

const ActiveGroupSurface = React.memo(({
  activeGroupId,
  onGroupSwitch,
  onReturn,
  onWindowSwitch,
  sshProfiles,
}: {
  activeGroupId: string;
  onGroupSwitch: (groupId: string) => void | Promise<void>;
  onReturn: () => void;
  onWindowSwitch: (windowId: string) => void;
  sshProfiles: SSHProfile[];
}) => {
  const activeGroup = useWindowStore((state) => (
    state.groups.find((group) => group.id === activeGroupId) ?? null
  ));

  if (!activeGroup) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: window.electronAPI?.platform === 'darwin' ? 36 : 32,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1001,
      }}
    >
      <GroupView
        group={activeGroup}
        onReturn={onReturn}
        onWindowSwitch={onWindowSwitch}
        onGroupSwitch={onGroupSwitch}
        isActive={true}
        sshProfiles={sshProfiles}
      />
    </div>
  );
});

ActiveGroupSurface.displayName = 'ActiveGroupSurface';

function AppContent() {
  const addWindow = useWindowStore((state) => state.addWindow);
  const syncWindow = useWindowStore((state) => state.syncWindow);
  const removeWindow = useWindowStore((state) => state.removeWindow);
  const updatePane = useWindowStore((state) => state.updatePane);
  const updateWindow = useWindowStore((state) => state.updateWindow);
  const updateWindowRuntime = useWindowStore((state) => state.updateWindowRuntime);
  const updateClaudeModel = useWindowStore((state) => state.updateClaudeModel);
  const storeActiveWindowId = useWindowStore((state) => state.activeWindowId);
  const activeGroupId = useWindowStore((state) => state.activeGroupId);
  const setActiveGroup = useWindowStore((state) => state.setActiveGroup);
  const mountedWindowRecordKeys = useWindowStore(useShallow(selectMountedWindowRecordKeys));
  const activeWindowTitle = useWindowStore((state) => (
    storeActiveWindowId
      ? state.windows.find((window) => window.id === storeActiveWindowId)?.name ?? ''
      : ''
  ));
  const activeWindowGitBranch = useWindowStore((state) => (
    storeActiveWindowId
      ? state.windows.find((window) => window.id === storeActiveWindowId)?.gitBranch ?? undefined
      : undefined
  ));
  const activeGroupName = useWindowStore((state) => (
    activeGroupId
      ? state.groups.find((group) => group.id === activeGroupId)?.name ?? ''
      : ''
  ));
  const hasPersistedEntries = useWindowStore((state) => (
    state.windows.some((window) => !window.archived) || state.groups.some((group) => !group.archived)
  ));
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [showCreateGroupDialog, setShowCreateGroupDialog] = useState(false);
  const [isSSHDialogOpen, setIsSSHDialogOpen] = useState(false);
  const [editingSSHProfile, setEditingSSHProfile] = useState<SSHProfile | null>(null);
  const [duplicatingSSHProfile, setDuplicatingSSHProfile] = useState<SSHProfile | null>(null);
  const [sshProfiles, setSSHProfiles] = useState<SSHProfile[]>([]);
  const [sshCredentialStates, setSSHCredentialStates] = useState<Record<string, SSHCredentialState>>({});
  const [connectingSSHProfileId, setConnectingSSHProfileId] = useState<string | null>(null);
  const [sshEnabled, setSSHEnabled] = useState(false);
  const [currentTab, setCurrentTab] = useState<'all' | 'active' | 'archived' | string>('active');
  const [searchQuery, setSearchQuery] = useState(''); // 搜索状态
  const [isQuickNavOpen, setIsQuickNavOpen] = useState(false); // 快捷导航面板状态
  const [sshHostKeyPromptQueue, setSSHHostKeyPromptQueue] = useState<SSHHostKeyPromptPayload[]>([]);
  const [sshPasswordPromptRequest, setSSHPasswordPromptRequest] = useState<SSHPasswordPromptRequest | null>(null);
  const [appError, setAppError] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<{ name: string; version: string }>({
    name: 'Copilot-Terminal',
    version: '1.0.0',
  });
  const sshPasswordPromptResolverRef = useRef<((password: string | null) => void) | null>(null);
  const appErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    const handleSSHPasswordSaved = (event: Event) => {
      const profileId = (event as CustomEvent<{ profileId?: string } | undefined>).detail?.profileId;
      if (!profileId) {
        return;
      }

      setSSHCredentialStates((previousStates) => ({
        ...previousStates,
        [profileId]: {
          ...(previousStates[profileId] ?? { hasPassword: false, hasPassphrase: false }),
          hasPassword: true,
        },
      }));
    };

    window.addEventListener(SSH_PASSWORD_SAVED_EVENT, handleSSHPasswordSaved);
    return () => {
      window.removeEventListener(SSH_PASSWORD_SAVED_EVENT, handleSSHPasswordSaved);
    };
  }, []);

  useEffect(() => {
    const handleSSHPasswordCleared = (event: Event) => {
      const profileId = (event as CustomEvent<{ profileId?: string } | undefined>).detail?.profileId;
      if (!profileId) {
        return;
      }

      setSSHCredentialStates((previousStates) => ({
        ...previousStates,
        [profileId]: {
          ...(previousStates[profileId] ?? { hasPassword: false, hasPassphrase: false }),
          hasPassword: false,
        },
      }));
    };

    window.addEventListener(SSH_PASSWORD_CLEARED_EVENT, handleSSHPasswordCleared);
    return () => {
      window.removeEventListener(SSH_PASSWORD_CLEARED_EVENT, handleSSHPasswordCleared);
    };
  }, []);

  const showAppError = useCallback((message: string) => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      return;
    }

    setAppError(trimmedMessage);

    if (appErrorTimerRef.current) {
      clearTimeout(appErrorTimerRef.current);
    }

    appErrorTimerRef.current = setTimeout(() => {
      setAppError(null);
      appErrorTimerRef.current = null;
    }, 6000);
  }, []);

  useEffect(() => {
    return () => {
      if (appErrorTimerRef.current) {
        clearTimeout(appErrorTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleAppError = (event: Event) => {
      const message = (event as CustomEvent<AppErrorEventDetail | undefined>).detail?.message;
      if (message) {
        showAppError(message);
      }
    };

    window.addEventListener(APP_ERROR_EVENT, handleAppError);
    return () => {
      window.removeEventListener(APP_ERROR_EVENT, handleAppError);
    };
  }, [showAppError]);

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

        // 两次完整 Shift（松开间隔必须小于阈值）才触发
        if (timeSinceLastUp < QUICK_NAV_DOUBLE_SHIFT_INTERVAL_MS && timeSinceLastUp > 0) {
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
    const statusByWindowId = new Map(
      mountedWindowRecordKeys.map((recordKey) => {
        const separatorIndex = recordKey.lastIndexOf(':');
        const windowId = recordKey.slice(0, separatorIndex);
        const status = recordKey.slice(separatorIndex + 1) as WindowStatus;
        return [windowId, status] as const;
      }),
    );
    setMountedTerminalWindowIds((previousIds) => {
      const nextIds = previousIds.filter((id) => {
        const windowStatus = statusByWindowId.get(id);
        if (!windowStatus) {
          return false;
        }

        if (id === activeWindowId) {
          return true;
        }

        return !UNLOADABLE_HIDDEN_WINDOW_STATUSES.has(windowStatus);
      });

      return nextIds.length === previousIds.length ? previousIds : nextIds;
    });
  }, [activeWindowId, mountedWindowRecordKeys]);

  // 订阅主进程推送的窗格状态变化事件
  useEffect(() => {
    const unsubscribe = subscribeToPaneStatusChange((windowId, paneId, status) => {
      updatePane(windowId, paneId, { status });
    });
    return () => {
      unsubscribe();
    };
  }, [updatePane]);

  useEffect(() => {
    if (!window.electronAPI?.onSSHHostKeyPrompt) {
      return;
    }

    const handleSSHHostKeyPrompt = (_event: unknown, payload: SSHHostKeyPromptPayload) => {
      setSSHHostKeyPromptQueue((currentQueue) => (
        currentQueue.some((entry) => entry.requestId === payload.requestId)
          ? currentQueue
          : [...currentQueue, payload]
      ));
    };

    window.electronAPI.onSSHHostKeyPrompt(handleSSHHostKeyPrompt);

    return () => {
      window.electronAPI?.offSSHHostKeyPrompt?.(handleSSHHostKeyPrompt);
    };
  }, []);

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

  const handleEditSSHProfile = useCallback((profile: SSHProfile) => {
    setDuplicatingSSHProfile(null);
    setEditingSSHProfile(profile);
    setIsSSHDialogOpen(true);
  }, []);

  const handleDuplicateSSHProfile = useCallback((profile: SSHProfile) => {
    setEditingSSHProfile(null);
    setDuplicatingSSHProfile(profile);
    setIsSSHDialogOpen(true);
  }, []);

  const handleSSHProfileDialogChange = useCallback((open: boolean) => {
    setIsSSHDialogOpen(open);
    if (!open) {
      setEditingSSHProfile(null);
      setDuplicatingSSHProfile(null);
    }
  }, []);

  const handleSSHProfileSaved = useCallback((profile: SSHProfile, credentialState: SSHCredentialState) => {
    const previousProfile = sshProfiles.find((item) => item.id === profile.id) ?? null;

    if (previousProfile) {
      const previousDefaultRemoteCwd = previousProfile.defaultRemoteCwd?.trim() || '~';
      const nextDefaultRemoteCwd = profile.defaultRemoteCwd?.trim() || '~';
      const windows = useWindowStore.getState().windows;

      for (const sshWindow of windows) {
        const panes = getAllPanes(sshWindow.layout).filter((pane) => pane.ssh?.profileId === profile.id);
        if (panes.length === 0) {
          continue;
        }

        if (sshWindow.name === previousProfile.name && sshWindow.name !== profile.name) {
          updateWindow(sshWindow.id, { name: profile.name });
        }

        for (const pane of panes) {
          if (pane.status !== WindowStatus.Paused) {
            continue;
          }

          const currentRemoteCwd = pane.cwd?.trim() || '~';
          if (currentRemoteCwd === previousDefaultRemoteCwd && currentRemoteCwd !== nextDefaultRemoteCwd) {
            updatePane(sshWindow.id, pane.id, { cwd: nextDefaultRemoteCwd });
          }
        }
      }
    }

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
  }, [sshProfiles, updatePane, updateWindow]);

  const handleDeleteSSHProfile = useCallback(async (profile: SSHProfile) => {
    if (!window.electronAPI) {
      return;
    }

    const response = await window.electronAPI.deleteSSHProfile(profile.id);
    if (!response?.success) {
      const deleteError = new Error(response?.error || `Failed to delete SSH profile ${profile.id}`);
      console.error('Failed to delete SSH profile:', deleteError);
      throw deleteError;
    }

    setSSHProfiles((previousProfiles) => previousProfiles.filter((item) => item.id !== profile.id));
    setSSHCredentialStates((previousStates) => {
      const nextStates = { ...previousStates };
      delete nextStates[profile.id];
      return nextStates;
    });
  }, []);

  const handleConnectSSHProfile = useCallback(async (profile: SSHProfile) => {
    if (connectingSSHProfileId) {
      return;
    }

    const windows = useWindowStore.getState().windows;
    const reusableWindow = profile.reuseSession
      ? findReusableSSHWindow(windows, profile.id)
      : null;
    if (reusableWindow) {
      const reusablePanes = getAllPanes(reusableWindow.layout).filter((pane) => pane.ssh?.profileId === profile.id);
      const shouldSyncReusableWindow = reusablePanes.length > 0
        && reusablePanes.every((pane) => pane.status === WindowStatus.Paused);

      if (shouldSyncReusableWindow) {
        const nextRemoteCwd = resolveSSHProfileEntryCwd(profile);
        const nextCommand = resolveSSHProfileEntryCommand(profile);

        if (reusableWindow.name !== profile.name) {
          updateWindow(reusableWindow.id, { name: profile.name });
        }

        for (const pane of reusablePanes) {
          const updates: Partial<Pane> = {};

          if (pane.cwd !== nextRemoteCwd) {
            updates.cwd = nextRemoteCwd;
          }

          if ((pane.command || '') !== nextCommand) {
            updates.command = nextCommand;
          }

          if (Object.keys(updates).length > 0) {
            updatePane(reusableWindow.id, pane.id, updates);
          }
        }
      }

      switchToWindow(reusableWindow.id);
      return;
    }

    try {
      setConnectingSSHProfileId(profile.id);
      const response = await runSSHActionWithPasswordRetry({
        request: {
          profileId: profile.id,
          profileName: profile.name,
          host: profile.host,
          user: profile.user,
          authType: profile.auth,
        },
        action: () => window.electronAPI.createSSHWindow({
          profileId: profile.id,
          name: profile.name,
        }),
      });

      if (!response?.success || !response.data) {
        throw new Error(response?.error || `Failed to connect SSH profile ${profile.id}`);
      }

      if (authNeedsPassword(profile.auth)) {
        setSSHCredentialStates((previousStates) => ({
          ...previousStates,
          [profile.id]: {
            ...(previousStates[profile.id] ?? { hasPassword: false, hasPassphrase: false }),
            hasPassword: true,
          },
        }));
      }

      addWindow(response.data);
      switchToWindow(response.data.id);
    } catch (error) {
      console.error('Failed to create SSH window:', error);
      if (!isSSHPasswordPromptCancelled(error)) {
        showAppError(error instanceof Error ? error.message : `Failed to connect SSH profile ${profile.id}`);
      }
    } finally {
      setConnectingSSHProfileId(null);
    }
  }, [addWindow, connectingSSHProfileId, showAppError, switchToWindow, updatePane, updateWindow]);

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
    const targetGroup = useWindowStore.getState().groups.find((group) => group.id === groupId);
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
  }, [setActiveGroup]);
  const activeSSHHostKeyPrompt = sshHostKeyPromptQueue[0] ?? null;

  const mountedTerminalWindowIdSet = useMemo(() => {
    const nextIds = new Set(mountedTerminalWindowIds);

    // 当切换到一个首次打开的终端窗口时，确保它在当前渲染帧就参与挂载，
    // 避免 activeWindowId 已切换但 mounted 列表尚未同步时出现一帧空白闪烁。
    if (activeWindowId) {
      nextIds.add(activeWindowId);
    }

    return nextIds;
  }, [activeWindowId, mountedTerminalWindowIds]);
  const hasActiveWindows = useMemo(
    () => hasPersistedEntries || (sshEnabled && sshProfiles.length > 0),
    [hasPersistedEntries, sshEnabled, sshProfiles.length]
  );

  const handleSSHHostKeyPromptDecision = useCallback((decision: { trusted: boolean; persist: boolean }) => {
    setSSHHostKeyPromptQueue((currentQueue) => {
      const currentPrompt = currentQueue[0];
      if (currentPrompt) {
        window.electronAPI.respondSSHHostKeyPrompt({
          requestId: currentPrompt.requestId,
          ...decision,
        });
      }

      return currentQueue.slice(1);
    });
  }, []);

  const openSSHPasswordPrompt = useCallback((request: SSHPasswordPromptRequest) => {
    if (sshPasswordPromptResolverRef.current) {
      sshPasswordPromptResolverRef.current(null);
    }

    setSSHPasswordPromptRequest(request);

    return new Promise<string | null>((resolve) => {
      sshPasswordPromptResolverRef.current = resolve;
    });
  }, []);

  useEffect(() => {
    setSSHPasswordPromptHandler(openSSHPasswordPrompt);

    return () => {
      setSSHPasswordPromptHandler(null);

      if (sshPasswordPromptResolverRef.current) {
        sshPasswordPromptResolverRef.current(null);
        sshPasswordPromptResolverRef.current = null;
      }
    };
  }, [openSSHPasswordPrompt]);

  const closeSSHPasswordPrompt = useCallback((password: string | null) => {
    const resolve = sshPasswordPromptResolverRef.current;
    sshPasswordPromptResolverRef.current = null;
    setSSHPasswordPromptRequest(null);
    resolve?.(password);
  }, []);

  // 计算标题栏标题
  const titleBarTitle = useMemo(() => {
    if (currentView === 'unified') return '';
    if (activeGroupId) {
      return activeGroupName;
    }
    if (activeWindowId) {
      return activeWindowTitle;
    }
    return '';
  }, [currentView, activeGroupId, activeGroupName, activeWindowId, activeWindowTitle]);

  const titleBarGitBranch = useMemo(() => {
    if (currentView === 'unified' || activeGroupId) return undefined;
    return activeWindowGitBranch;
  }, [currentView, activeGroupId, activeWindowGitBranch]);

  return (
    <div className="flex flex-col h-screen">
      {/* 自定义标题栏 */}
      <CustomTitleBar
        title={titleBarTitle}
        gitBranch={titleBarGitBranch}
        showAppName={currentView === 'unified'}
        appName={appVersion.name}
        onReturn={currentView !== 'unified' ? (activeGroupId ? handleReturnFromGroup : switchToUnifiedView) : undefined}
      />

      {/* 内容区域 */}
      <div className="flex-1 overflow-hidden">
        {/* 统一视图 - 淡入淡出 */}
        <div
          className="transition-opacity duration-300 h-full"
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
              sshEnabled={sshEnabled}
              sshProfiles={sshProfiles}
              onSSHProfileSaved={handleSSHProfileSaved}
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
              connectingSSHProfileId={connectingSSHProfileId}
              onConnectSSHProfile={handleConnectSSHProfile}
              onEditSSHProfile={handleEditSSHProfile}
              onDuplicateSSHProfile={handleDuplicateSSHProfile}
              onDeleteSSHProfile={handleDeleteSSHProfile}
              searchQuery={searchQuery}
              currentTab={currentTab}
            />
          )}
        </MainLayout>
      </div>

      {/* 终端视图：窗口一旦打开过就保持挂载，仅切换显示状态，避免返回或窗口切换时销毁 xterm 实例 */}
      {mountedTerminalWindowIds.map((windowId) => (
        <MountedTerminalSurface
          key={windowId}
          windowId={windowId}
          isVisible={currentView === 'terminal' && activeWindowId === windowId}
          onReturn={switchToUnifiedView}
          onWindowSwitch={handleWindowSwitch}
          onGroupSwitch={handleGroupSwitch}
          sshEnabled={sshEnabled}
          sshProfiles={sshProfiles}
          onSSHProfileSaved={handleSSHProfileSaved}
        />
      ))}

      {error && <ViewSwitchError message={error} />}
      {!error && appError && <ViewSwitchError message={appError} />}

      {/* 组视图：当 activeGroupId 有效时显示 */}
      {activeGroupId && (
        <ActiveGroupSurface
          activeGroupId={activeGroupId}
          onReturn={handleReturnFromGroup}
          onWindowSwitch={handleWindowSwitch}
          onGroupSwitch={handleGroupSwitch}
          sshProfiles={sshProfiles}
        />
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
        <CreateWindowDialog
          open={isSSHDialogOpen}
          onOpenChange={handleSSHProfileDialogChange}
          sshEnabled={sshEnabled}
          sshProfiles={sshProfiles}
          editingSSHProfile={editingSSHProfile}
          initialSSHProfile={duplicatingSSHProfile}
          sshCredentialState={editingSSHProfile ? sshCredentialStates[editingSSHProfile.id] : null}
          onSSHProfileSaved={handleSSHProfileSaved}
        />
      )}

      <SSHHostKeyPromptDialog
        request={activeSSHHostKeyPrompt}
        onDecision={handleSSHHostKeyPromptDecision}
      />

      <SSHPasswordPromptDialog
        request={sshPasswordPromptRequest}
        onSubmit={(password) => closeSSHPasswordPrompt(password)}
        onCancel={() => closeSSHPasswordPrompt(null)}
      />
      </div>
    </div>
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
