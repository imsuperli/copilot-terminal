import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X } from 'lucide-react';
import { Dialog } from './ui/Dialog';
import { Button } from './ui/Button';
import { WindowGroup } from '../../shared/types/window-group';
import { getAllWindowIds } from '../utils/groupLayoutHelpers';
import { useWindowStore } from '../stores/windowStore';
import { useI18n } from '../i18n';

interface EditGroupPanelProps {
  group: WindowGroup;
  onClose: () => void;
  onSave: (groupId: string, updates: { name?: string }) => void;
}

/**
 * EditGroupPanel 组件
 * 编辑窗口组面板
 *
 * TODO: 等待任务 #1、#2、#3 完成后实现以下功能：
 * - 修改组名称
 * - 显示组内窗口列表
 * - 支持从组中移除窗口
 * - 支持添加窗口到组
 * - 如果组内只剩 1 个窗口，自动解散组
 * - 调用 IPC 接口更新组
 * - 更新 windowStore 状态
 */
export const EditGroupPanel: React.FC<EditGroupPanelProps> = ({ group, onClose, onSave }) => {
  const { t } = useI18n();
  const windows = useWindowStore((state) => state.windows);
  const removeGroup = useWindowStore((state) => state.removeGroup);
  const removeWindowFromGroupLayout = useWindowStore((state) => state.removeWindowFromGroupLayout);

  const [name, setName] = useState(group.name);
  const [isSaving, setIsSaving] = useState(false);

  const nameInputRef = useRef<HTMLInputElement>(null);

  // 自动聚焦到名称字段
  useEffect(() => {
    if (nameInputRef.current) {
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 0);
    }
  }, []);

  // 从 group.layout 获取组内窗口列表
  const windowsInGroup = useMemo(() => {
    const windowIds = getAllWindowIds(group.layout);
    return windows.filter(w => windowIds.includes(w.id));
  }, [group.layout, windows]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      return;
    }

    setIsSaving(true);
    try {
      const updates: { name?: string } = {};

      if (name !== group.name) {
        updates.name = name;
      }

      if (Object.keys(updates).length > 0) {
        onSave(group.id, updates);
      }

      onClose();
    } catch (error) {
      console.error('Failed to save group:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter' && name.trim() && !isSaving) {
      handleSubmit(e as any);
    }
  };

  const handleRemoveWindow = (windowId: string) => {
    // 检查移除后是否只剩 1 个窗口
    const windowIds = getAllWindowIds(group.layout);
    if (windowIds.length <= 2) {
      // 如果移除后只剩 1 个窗口，自动解散组
      if (window.confirm('移除此窗口后组内只剩 1 个窗口，将自动解散组。确定继续吗？')) {
        removeGroup(group.id);
        onClose();
      }
    } else {
      // 从组中移除窗口
      removeWindowFromGroupLayout(group.id, windowId);
    }
  };

  const handleAddWindow = () => {
    // TODO: 实现添加窗口到组的逻辑
    // 可以打开一个选择窗口的对话框
    console.log('TODO: 实现添加窗口逻辑');
  };

  return (
    <Dialog
      open={true}
      onOpenChange={onClose}
      title="编辑窗口组"
      description="修改组名称或管理组内窗口"
      contentClassName="max-w-[640px]"
    >
      <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} role="form">
        {/* 组名称 */}
        <div className="mb-4">
          <label htmlFor="group-name" className="block text-sm font-medium text-text-primary mb-2">
            组名称 <span className="text-status-error">*</span>
          </label>
          <input
            id="group-name"
            ref={nameInputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="输入组名称"
            required
            className="w-full px-3 py-2 bg-bg-app border border-border-subtle rounded text-text-primary placeholder-text-disabled focus:outline-none focus:ring-2 focus:ring-status-running"
          />
        </div>

        {/* 组内窗口列表 */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-text-primary">
              组内窗口
              <span className="text-xs text-text-secondary ml-2">
                ({windowsInGroup.length} 个)
              </span>
            </label>
            <Button
              type="button"
              variant="secondary"
              onClick={handleAddWindow}
              className="text-xs"
            >
              添加窗口
            </Button>
          </div>

          {/* 显示组内窗口列表 */}
          <div className="border border-border-subtle rounded p-3 bg-bg-app max-h-64 overflow-y-auto">
            {windowsInGroup.length === 0 ? (
              <p className="text-sm text-text-secondary text-center py-4">
                组内暂无窗口
              </p>
            ) : (
              <div className="space-y-2">
                {windowsInGroup.map((win) => (
                  <div
                    key={win.id}
                    className="flex items-center justify-between p-2 rounded bg-bg-hover"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-text-primary truncate">
                        {win.name}
                      </div>
                      <div className="text-xs text-text-secondary truncate font-mono">
                        {win.layout.type === 'pane' ? win.layout.pane.cwd : '多窗格'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveWindow(win.id)}
                      className="ml-2 p-1 text-status-error hover:bg-status-error/10 rounded transition-colors"
                      aria-label="移除窗口"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className="text-xs text-text-secondary mt-2">
            提示：组内至少需要 2 个窗口，移除后只剩 1 个窗口时将自动解散组
          </p>
        </div>

        {/* 按钮 */}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
          >
            取消
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={!name.trim() || isSaving}
            aria-busy={isSaving}
          >
            {isSaving ? '保存中...' : '保存'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
