import React, { useState, useCallback, useEffect } from 'react';
import { MainLayout } from './components/layout/MainLayout';
import { Toolbar } from './components/layout/Toolbar';
import { EmptyState } from './components/EmptyState';
import { CardGrid } from './components/CardGrid';
import { useWindowStore } from './stores/windowStore';
import { subscribeToWindowStatusChange } from './api/events';

function App() {
  const windows = useWindowStore((state) => state.windows);
  const updateWindowStatus = useWindowStore((state) => state.updateWindowStatus);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

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

  return (
    <MainLayout
      toolbar={
        <Toolbar
          appName="ausome-terminal"
          version="0.1.0"
          onCreateWindow={handleCreateWindow}
          isDialogOpen={isDialogOpen}
          onDialogChange={handleDialogChange}
        />
      }
    >
      {windows.length === 0 ? (
        <EmptyState onCreateWindow={handleCreateWindow} />
      ) : (
        <CardGrid onCreateWindow={handleCreateWindow} />
      )}
    </MainLayout>
  );
}

export default App;
