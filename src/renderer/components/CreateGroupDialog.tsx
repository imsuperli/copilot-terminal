import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { Dialog } from './ui/Dialog';
import { Button } from './ui/Button';
import { useWindowStore } from '../stores/windowStore';
import { createGroup } from '../utils/groupLayoutHelpers';
import { useI18n } from '../i18n';

interface CreateGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * CreateGroupDialog 组件
 * 创建窗口组对话框
 *
 * TODO: 等待任务 #1、#2、#3 完成后实现以下功能：
 * - 输入组名称
 * - 选择已有窗口（多选）
 * - 或者输入工作目录路径创建新窗口并加入组
 * - 支持至少选择 2 个窗口才能创建组
 * - 调用 IPC 接口创建组
 * - 更新 windowStore 状态
 */
export function CreateGroupDialog({ open, onOpenChange }: CreateGroupDialogProps) {
  const { t } = useI18n();
  const windows = useWindowStore((state) => state.windows);
  const addGroup = useWindowStore((state) => state.addGroup);
  const findGroupByWindowId = useWindowStore((state) => state.findGroupByWindowId);

  const [groupName, setGroupName] = useState('');
  const [selectedWindowIds, setSelectedWindowIds] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const groupNameInputRef = useRef<HTMLInputElement>(null);

  // 自动聚焦到组名称字段
  useEffect(() => {
    if (open && groupNameInputRef.current) {
      setTimeout(() => {
        groupNameInputRef.current?.focus();
      }, 0);
    }
  }, [open]);

  // 获取所有未归档的窗口（允许窗口同时属于多个组）
  const availableWindows = useMemo(() => {
    return windows.filter(w => !w.archived);
  }, [windows]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 验证至少选择了 2 个窗口
    if (selectedWindowIds.length < 2) {
      setCreateError('至少需要选择 2 个窗口');
      return;
    }

    setIsCreating(true);
    setCreateError('');

    try {
      // 生成默认组名（如果用户没有输入）
      const finalGroupName = groupName.trim() || `组 ${new Date().toLocaleTimeString()}`;

      // 创建组（使用前两个窗口创建初始布局）
      const newGroup = createGroup(
        finalGroupName,
        selectedWindowIds[0],
        selectedWindowIds[1],
        'horizontal'
      );

      // TODO: 如果选择了超过 2 个窗口，需要将其他窗口添加到组中
      // 这需要使用 addWindowToGroup 函数，但目前先创建包含前两个窗口的组

      // 添加组到 store
      addGroup(newGroup);

      // 关闭对话框并重置表单
      onOpenChange(false);
      resetForm();
    } catch (error) {
      const errorMessage = (error as Error).message || '创建组失败，请重试';
      setCreateError(errorMessage);
    } finally {
      setIsCreating(false);
    }
  };

  const resetForm = () => {
    setGroupName('');
    setSelectedWindowIds([]);
    setCreateError('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onOpenChange(false);
      resetForm();
    } else if (e.key === 'Enter' && selectedWindowIds.length >= 2 && !isCreating) {
      handleSubmit(e as any);
    }
  };

  const handleToggleWindow = (windowId: string) => {
    setSelectedWindowIds((prev) =>
      prev.includes(windowId)
        ? prev.filter((id) => id !== windowId)
        : [...prev, windowId]
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        onOpenChange(isOpen);
        if (!isOpen) resetForm();
      }}
      title="创建窗口组"
      description="将多个窗口组合在一起，形成工作空间布局"
      contentClassName="max-w-[640px]"
    >
      <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} role="form">
        {/* 组名称 */}
        <div className="mb-4">
          <label htmlFor="group-name" className="block text-sm font-medium text-text-primary mb-2">
            组名称 <span className="text-xs text-text-secondary ml-2">(可选，留空自动生成)</span>
          </label>
          <input
            id="group-name"
            ref={groupNameInputRef}
            type="text"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="例如：前端项目组"
            className="w-full px-3 py-2 bg-bg-app border border-border-subtle rounded text-text-primary placeholder-text-disabled focus:outline-none focus:ring-2 focus:ring-status-running"
          />
        </div>

        {/* 选择窗口 */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-text-primary mb-2">
            选择窗口 <span className="text-status-error">*</span>
            <span className="text-xs text-text-secondary ml-2">
              (至少选择 2 个)
            </span>
          </label>

          {/* 显示可选窗口列表（复选框） */}
          <div className="border border-border-subtle rounded p-3 bg-bg-app max-h-64 overflow-y-auto">
            {availableWindows.length === 0 ? (
              <p className="text-sm text-text-secondary text-center py-4">
                暂无可用窗口（所有窗口都已在组中或已归档）
              </p>
            ) : (
              <div className="space-y-2">
                {availableWindows.map((win) => (
                  <label
                    key={win.id}
                    className="flex items-center gap-3 p-2 rounded hover:bg-bg-hover cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedWindowIds.includes(win.id)}
                      onChange={() => handleToggleWindow(win.id)}
                      className="w-4 h-4 rounded border-border-subtle text-status-running focus:ring-2 focus:ring-status-running"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-text-primary truncate">
                        {win.name}
                      </div>
                      <div className="text-xs text-text-secondary truncate font-mono">
                        {/* 显示窗口的工作目录 */}
                        {win.layout.type === 'pane' ? win.layout.pane.cwd : '多窗格'}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          <p className="text-xs text-text-secondary mt-2">
            已选择 {selectedWindowIds.length} 个窗口
          </p>
        </div>

        {/* 创建错误提示 */}
        {createError && (
          <div className="mb-4 p-3 bg-status-error/10 border border-status-error rounded" role="alert">
            <p className="text-sm text-status-error">{createError}</p>
          </div>
        )}

        {/* 按钮 */}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              onOpenChange(false);
              resetForm();
            }}
          >
            取消
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={selectedWindowIds.length < 2 || isCreating}
            aria-busy={isCreating}
          >
            {isCreating ? '创建中...' : '创建组'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
