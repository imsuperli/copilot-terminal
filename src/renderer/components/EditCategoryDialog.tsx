import React, { useState, useEffect, useRef } from 'react';
import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { Dialog } from './ui/Dialog';
import { Button } from './ui/Button';
import { CustomCategory } from '../../shared/types/custom-category';
import { useWindowStore } from '../stores/windowStore';
import { useI18n } from '../i18n';

interface EditCategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: CustomCategory | null;
}

/**
 * 常用图标列表
 */
const COMMON_ICONS = ['📁', '📂', '📌', '⭐', '🔖', '🏷️', '📊', '🎯', '💼', '🚀', '🔧', '📝'];

/**
 * EditCategoryDialog 组件
 * 编辑自定义分类对话框
 */
export function EditCategoryDialog({ open, onOpenChange, category }: EditCategoryDialogProps) {
  const { t } = useI18n();
  const customCategories = useWindowStore((state) => state.customCategories);
  const updateCustomCategory = useWindowStore((state) => state.updateCustomCategory);

  const [categoryName, setCategoryName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState<string>('📁');
  const [parentId, setParentId] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState('');

  const nameInputRef = useRef<HTMLInputElement>(null);

  // 初始化表单数据
  useEffect(() => {
    if (open && category) {
      setCategoryName(category.name);
      setSelectedIcon(category.icon || '📁');
      setParentId(category.parentId || '');
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 0);
    }
  }, [open, category]);

  // 获取可选的父分类列表（排除自己和自己的子分类）
  const availableParentCategories = customCategories.filter(c => {
    if (!category) return false;
    // 排除自己
    if (c.id === category.id) return false;
    // 排除自己的子分类
    if (c.parentId === category.id) return false;
    // 只显示顶级分类
    if (c.parentId) return false;
    return true;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!category) return;

    const trimmedName = categoryName.trim();
    if (!trimmedName) {
      setUpdateError(t('category.nameRequired'));
      return;
    }

    setIsUpdating(true);
    setUpdateError('');

    try {
      await updateCustomCategory(category.id, {
        name: trimmedName,
        icon: selectedIcon,
        parentId: parentId || undefined,
      });

      // 关闭对话框并重置表单
      onOpenChange(false);
      resetForm();
    } catch (error) {
      const errorMessage = (error as Error).message || t('category.updateFailed');
      setUpdateError(errorMessage);
    } finally {
      setIsUpdating(false);
    }
  };

  const resetForm = () => {
    setCategoryName('');
    setSelectedIcon('📁');
    setParentId('');
    setUpdateError('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onOpenChange(false);
      resetForm();
    } else if (e.key === 'Enter' && categoryName.trim() && !isUpdating) {
      handleSubmit(e as any);
    }
  };

  if (!category) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        onOpenChange(isOpen);
        if (!isOpen) resetForm();
      }}
      title={t('category.edit')}
      description={t('category.editDescription')}
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
                  {availableParentCategories.map((cat) => (
                    <Select.Item
                      key={cat.id}
                      value={cat.id}
                      className="px-3 py-2 text-sm text-text-primary rounded cursor-pointer hover:bg-bg-hover focus:bg-bg-hover outline-none flex items-center justify-between"
                    >
                      <Select.ItemText>
                        {cat.icon && <span className="mr-2">{cat.icon}</span>}
                        {cat.name}
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

        {/* 更新错误提示 */}
        {updateError && (
          <div className="mb-4 p-3 bg-status-error/10 border border-status-error rounded" role="alert">
            <p className="text-sm text-status-error">{updateError}</p>
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
            disabled={!categoryName.trim() || isUpdating}
            aria-busy={isUpdating}
          >
            {isUpdating ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
