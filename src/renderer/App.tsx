import React from 'react';
import { MainLayout } from './components/layout/MainLayout';
import { Toolbar } from './components/layout/Toolbar';
import { EmptyState } from './components/EmptyState';

function App() {
  const handleCreateWindow = () => {
    // 后续 Story 2.2 会实现新建窗口对话框
    console.log('创建新窗口');
  };

  return (
    <MainLayout
      toolbar={<Toolbar appName="ausome-terminal" version="0.1.0" />}
    >
      <EmptyState onCreateWindow={handleCreateWindow} />
    </MainLayout>
  );
}

export default App;
