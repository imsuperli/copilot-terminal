import React, { useState, useEffect, useRef } from 'react';
import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { Dialog } from './ui/Dialog';
import { Button } from './ui/Button';
import { useWindowStore } from '../stores/windowStore';
import { useI18n } from '../i18n';

interface CreateCategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 默认父分类 ID（从子分类创建入口传入） */
  defaultParentId?: string;
}

/**
 * 常用图标列表
 */
const COMMON_ICONS = ['📁', '📂', '📌', '⭐', '🔖', '🏷️', '📊', '🎯', '💼', '🚀', '🔧', '📝'];

/**
 * CreateCategoryDialog 组件
 * 创建自定义分类对话框
 */
export function CreateCategoryDialog({ open, onOpenChange, defaultParentId = '' }: CreateCategoryDialogProps) {
  const { t } = useI18n();
  const customCategories = useWindowStore((state) => state.customCategories);
  const addCustomCategory = useWindowStore((state) => state.addCustomCategory);

  const [categoryName, setCategoryName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState<string>('📁');
  const [parentId, setParentId] = useState<string>('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const nameInputRef = useRef<HTMLInputElement>(null);

  // 自动聚焦到名称字段，并设置默认父分类
  useEffect(() => {
    if (open) {
      setParentId(defaultParentId);
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 0);
    }
  }, [open, defaultParentId]);

  // 获取可选的父分类列表（排除子分类，避免循环嵌套）
  const availableParentCategories = customCategories.filter(c => !c.parentId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = categoryName.trim();
    if (!trimmedName) {
      setCreateError(t('category.nameRequired'));
      return;
    }

    setIsCreating(true);
    setCreateError('');

    try {
      // 计算新分类的 order（放在最后）
      const maxOrder = customCategories.reduce((max, c) => Math.max(max, c.order), -1);

      await addCustomCategory({
        name: trimmedName,
        icon: selectedIcon,
        parentId: parentId || undefined,
        windowIds: [],
        groupIds: [],
        order: maxOrder + 1,
      });

      // 关闭对话框并重置表单
      onOpenChange(false);
      resetForm();
    } catch (error) {
      const errorMessage = (error as Error).message || t('category.createFailed');
      setCreateError(errorMessage);
    } finally {
      setIsCreating(false);
    }
  };

  const resetForm = () => {
    setCategoryName('');
    setSelectedIcon('📁');
    setParentId('');
    setCreateError('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onOpenChange(false);
      resetForm();
    } else if (e.key === 'Enter' && categoryName.trim() && !isCreating) {
      handleSubmit(e as any);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        onOpenChange(isOpen);
        if (!isOpen) resetForm();
      }}
      title={t('category.create')}
      description={t('category.createDescription')}
      contentClassName="max-w-[480px]"
    >
      <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} role="form">
        {/* 分类名称 */}
        <div className="mb-4">
          <label htmlFor="category-name" className="block text-sm font-medium text-text-primary mb-2">
            {t('category.name')} <span className="text-status-error">*</span>
          </label>
          <input
            id="category-name"
            ref={nameInputRef}
            type="text"
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
            placeholder={t('category.namePlaceholder')}
            className="w-full px-3 py-2 bg-bg-app border border-border-subtle rounded text-text-primary placeholder-text-disabled focus:outline-none focus:ring-2 focus:ring-status-running"
          />
        </div>

        {/* 图标选择 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-text-primary mb-2">
            {t('category.icon')} <span className="text-xs text-text-secondary ml-2">({t('category.optional')})</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {COMMON_ICONS.map((icon) => (
              <button
                key={icon}
                type="button"
                onClick={() => setSelectedIcon(icon)}
                className={`w-10 h-10 flex items-center justify-center text-xl rounded border transition-colors ${
                  selectedIcon === icon
                    ? 'border-status-running bg-status-running/10'
                    : 'border-border-subtle hover:border-border-default hover:bg-bg-hover'
                }`}
                title={icon}
              >
                {icon}
              </button>
            ))}
          </div>
        </div>

        {/* 父分类选择 */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-text-primary mb-2">
            {t('category.parentCategory')} <span className="text-xs text-text-secondary ml-2">({t('category.optional')})</span>
          </label>
          <Select.Root value={parentId} onValueChange={setParentId}>
            <Select.Trigger
              className="w-full px-3 py-2 bg-bg-app border border-border-subtle rounded text-text-primary focus:outline-none focus:ring-2 focus:ring-status-running flex items-center justify-between"
              aria-label={t('category.parentCategory')}
            >
              <Select.Value placeholder={t('category.noParent')} />
              <Select.Icon>
                <ChevronDown className="h-4 w-4 text-text-secondary" />
              </Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Content
                className="bg-bg-app border border-border-subtle rounded shadow-lg overflow-hidden z-50"
                position="popper"
                sideOffset={4}
              >
                <Select.Viewport className="p-1">
                  <Select.Item
                    value=""
                    className="px-3 py-2 text-sm text-text-primary rounded cursor-pointer hover:bg-bg-hover focus:bg-bg-hover outline-none flex items-center justify-between"
                  >
                    <Select.ItemText>{t('category.noParent')}</Select.ItemText>
                    <Select.ItemIndicator>
                      <Check className="h-4 w-4" />
                    </Select.ItemIndicator>
                  </Select.Item>
                  {availableParentCategories.map((category) => (
                    <Select.Item
                      key={category.id}
                      value={category.id}
                      className="px-3 py-2 text-sm text-text-primary rounded cursor-pointer hover:bg-bg-hover focus:bg-bg-hover outline-none flex items-center justify-between"
                    >
                      <Select.ItemText>
                        {category.icon && <span className="mr-2">{category.icon}</span>}
                        {category.name}
                      </Select.ItemText>
                      <Select.ItemIndicator>
                        <Check className="h-4 w-4" />
                      </Select.ItemIndicator>
                    </Select.Item>
                  ))}
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>
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
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={!categoryName.trim() || isCreating}
            aria-busy={isCreating}
          >
            {isCreating ? t('common.creating') : t('common.create')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
