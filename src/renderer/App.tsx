import React, { useState, useCallback, useEffect } from 'react';
import { MainLayout } from './components/layout/MainLayout';
import { Sidebar } from './components/layout/Sidebar';
import { EmptyState } from './components/EmptyState';
import { CardGrid } from './components/CardGrid';
import { ArchivedView } from './components/ArchivedView';
import { TerminalView } from './components/TerminalView';
import { ViewSwitchError } from './components/ViewSwitchError';
import { useWindowStore } from './stores/windowStore';
import { useViewSwitcher } from './hooks/useViewSwitcher';
import { useWindowSwitcher } from './hooks/useWindowSwitcher';
import { useWorkspaceRestore } from './hooks/useWorkspaceRestore';
import { subscribeToWindowStatusChange } from './api/events';
import { Window } from './types/window';

function App() {
  const windows = useWindowStore((state) => state.windows);
  const updateWindowStatus = useWindowStore((state) => state.updateWindowStatus);
  const storeActiveWindowId = useWindowStore((state) => state.activeWindowId);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [currentTab, setCurrentTab] = useState<'active' | 'archived'>('active');

  // 工作区恢复
  useWorkspaceRestore();

  // 通知主进程渲染完成（延迟确保主题和样式完全应用）
  useEffect(() => {
    const timer = setTimeout(() => {
      window.electronAPI.notifyRendererReady();
    }, 100);
    return () => clearTimeout(timer);
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

  // 订阅主进程推送的窗口状态变化事件
  useEffect(() => {
    const unsubscribe = subscribeToWindowStatusChange((windowId, status) => {
      updateWindowStatus(windowId, status);
    });
    return () => {
      unsubscribe();
    };
  }, [updateWindowStatus]);

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
  const activeWindow = windows.find((w) => w.id === activeWindowId);
  const activeWindows = windows.filter(w => !w.archived);

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
              appName="Ausome Terminal"
              version="0.1.0"
              onCreateWindow={handleCreateWindow}
              isDialogOpen={isDialogOpen}
              onDialogChange={handleDialogChange}
              currentTab={currentTab}
              onTabChange={handleTabChange}
            />
          }
        >
          {currentTab === 'active' ? (
            activeWindows.length === 0 ? (
              <EmptyState onCreateWindow={handleCreateWindow} />
            ) : (
              <CardGrid onCreateWindow={handleCreateWindow} onEnterTerminal={handleEnterTerminal} />
            )
          ) : (
            <ArchivedView onEnterTerminal={handleEnterTerminal} />
          )}
        </MainLayout>
      </div>

      {/* 终端视图：为每个窗口保持一个 TerminalView 实例 - 淡入淡出 */}
      {windows.map((win) => (
        <div
          key={win.id}
          className="transition-opacity duration-300"
          style={{
            display: currentView === 'terminal' && activeWindowId === win.id ? 'block' : 'none',
            opacity: currentView === 'terminal' && activeWindowId === win.id ? 1 : 0,
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1000,
          }}
        >
          <TerminalView
            window={win}
            onReturn={switchToUnifiedView}
            onWindowSwitch={handleWindowSwitch}
            isActive={currentView === 'terminal' && activeWindowId === win.id}
          />
        </div>
      ))}

      {error && <ViewSwitchError message={error} />}
    </>
  );
}

export default App;
