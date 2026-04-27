import React from 'react';

interface MainLayoutProps {
  sidebar?: React.ReactNode;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
}

export function MainLayout({ sidebar, toolbar, children }: MainLayoutProps) {
  if (toolbar) {
    return (
      <div className="flex h-screen flex-col bg-bg-app">
        <div className="flex-shrink-0">
          {toolbar}
        </div>
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-transparent">
      {/* 侧边栏区域 - 固定宽度 */}
      {sidebar && (
        <div className="flex-shrink-0">
          {sidebar}
        </div>
      )}

      {/* 主内容区 - 占满剩余空间 */}
      <main
        className="flex-1 overflow-auto bg-transparent"
        style={{ background: 'var(--appearance-main-surface-background)' }}
      >
        {children}
      </main>
    </div>
  );
}
