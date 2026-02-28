import React from 'react';
import { MainLayout } from './components/layout/MainLayout';
import { Toolbar } from './components/layout/Toolbar';
import { EmptyState } from './components/EmptyState';
import { CardGrid } from './components/CardGrid';
import { useWindowStore } from './stores/windowStore';

function App() {
  const windows = useWindowStore((state) => state.windows);

  const handleCreateWindow = () => {
    // 后续 Story 2.2 会实现新建窗口对话框
    console.log('创建新窗口');
  };

  return (
    <MainLayout
      toolbar={<Toolbar appName="ausome-terminal" version="0.1.0" />}
    >
      {windows.length === 0 ? (
        <EmptyState onCreateWindow={handleCreateWindow} />
      ) : (
        <CardGrid />
      )}
    </MainLayout>
  );
}

export default App;
