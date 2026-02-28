import React, { useState } from 'react';
import { Button } from './components/ui/Button';
import { Dialog } from './components/ui/Dialog';
import { Tooltip } from './components/ui/Tooltip';

function App() {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="min-h-screen p-8">
      <h1 className="text-3xl font-bold mb-6">ausome-terminal</h1>
      <p className="text-text-secondary mb-8">UI 设计系统基础集成</p>

      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold mb-3">按钮组件</h2>
          <div className="flex gap-3">
            <Button variant="primary">Primary Button</Button>
            <Button variant="secondary">Secondary Button</Button>
            <Button variant="ghost">Ghost Button</Button>
          </div>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-3">对话框组件</h2>
          <Button onClick={() => setDialogOpen(true)}>打开对话框</Button>
          <Dialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            title="示例对话框"
            description="这是一个基于 Radix UI 的对话框组件"
          >
            <div className="flex justify-end gap-3 mt-4">
              <Button variant="secondary" onClick={() => setDialogOpen(false)}>
                取消
              </Button>
              <Button variant="primary" onClick={() => setDialogOpen(false)}>
                确认
              </Button>
            </div>
          </Dialog>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-3">提示组件</h2>
          <Tooltip content="这是一个提示信息">
            <Button variant="ghost">悬停查看提示</Button>
          </Tooltip>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-3">状态色展示</h2>
          <div className="flex gap-3">
            <div role="status" aria-label="运行中状态示例" className="w-20 h-20 rounded-card bg-status-running flex items-center justify-center text-sm">运行中</div>
            <div role="status" aria-label="等待输入状态示例" className="w-20 h-20 rounded-card bg-status-waiting flex items-center justify-center text-sm">等待</div>
            <div role="status" aria-label="已完成状态示例" className="w-20 h-20 rounded-card bg-status-completed flex items-center justify-center text-sm">完成</div>
            <div role="status" aria-label="出错状态示例" className="w-20 h-20 rounded-card bg-status-error flex items-center justify-center text-sm">出错</div>
            <div role="status" aria-label="恢复中状态示例" className="w-20 h-20 rounded-card bg-status-restoring flex items-center justify-center text-sm">恢复中</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
