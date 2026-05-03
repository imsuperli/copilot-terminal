import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Dialog } from './ui/Dialog';
import { Button } from './ui/Button';
import { useWindowStore } from '../stores/windowStore';
import { createGroup, getAllWindowIds } from '../utils/groupLayoutHelpers';
import { useI18n } from '../i18n';
import { getPersistableWindows } from '../utils/sshWindowBindings';

interface CreateGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * CreateGroupDialog 组件
 * 创建窗口组并从现有窗口中选择成员。
 */
export function CreateGroupDialog({ open, onOpenChange }: CreateGroupDialogProps) {
  const { t } = useI18n();
  const windows = useWindowStore((state) => state.windows);
  const addGroup = useWindowStore((state) => state.addGroup);
  const findGroupByWindowId = useWindowStore((state) => state.findGroupByWindowId);
  const addWindowToGroupLayout = useWindowStore((state) => state.addWindowToGroupLayout);

  const [groupName, setGroupName] = useState('');
  const [selectedWindowIds, setSelectedWindowIds] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const persistableWindows = useMemo(() => getPersistableWindows(windows), [windows]);

  const groupNameInputRef = useRef<HTMLInputElement>(null);

  // 自动聚焦到组名称字段
  useEffect(() => {
    if (open && groupNameInputRef.current) {
      setTimeout(() => {
        groupNameInputRef.current?.focus();
      }, 0);
    }
  }, [open]);

  const availableWindows = useMemo(() => {
    return persistableWindows.filter(w => !w.archived);
  }, [persistableWindows]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedWindowIds.length < 2) {
      setCreateError(t('groupDialog.error.minimumWindows'));
      return;
    }

    setIsCreating(true);
    setCreateError('');

    try {
      const finalGroupName = groupName.trim() || t('groupDialog.defaultName', { count: new Date().toLocaleTimeString() });
      const newGroup = createGroup(
        finalGroupName,
        selectedWindowIds[0],
        selectedWindowIds[1],
        'horizontal'
      );

      addGroup(newGroup);
      for (const windowId of selectedWindowIds.slice(2)) {
        const currentGroup = useWindowStore.getState().getGroupById(newGroup.id);
        const targetWindowIds = currentGroup ? getAllWindowIds(currentGroup.layout) : selectedWindowIds.slice(0, 2);
        const anchorWindowId = targetWindowIds[targetWindowIds.length - 1];
        if (anchorWindowId) {
          addWindowToGroupLayout(newGroup.id, anchorWindowId, windowId, 'horizontal');
        }
      }

      onOpenChange(false);
      resetForm();
    } catch (error) {
      const errorMessage = (error as Error).message || t('groupDialog.error.createFailed');
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
            {t('groupDialog.windowSelectionLabel')} <span className="text-status-error">*</span>
            <span className="text-xs text-text-secondary ml-2">
              {t('groupDialog.windowSelectionHint')}
            </span>
          </label>

          <div className="border border-border-subtle rounded p-3 bg-bg-app max-h-64 overflow-y-auto">
            {availableWindows.length === 0 ? (
              <p className="text-sm text-text-secondary text-center py-4">
                {t('groupDialog.emptyWindows')}
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
            {t('groupDialog.selectedCount', { count: selectedWindowIds.length })}
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
            {isCreating ? t('common.creating') : t('sidebar.createGroup')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
