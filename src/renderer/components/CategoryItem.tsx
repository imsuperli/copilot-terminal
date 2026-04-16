import React, { useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronRight, ChevronDown, MoreVertical, Edit, Trash2, FolderPlus, Palette } from 'lucide-react';
import { CustomCategory } from '../../shared/types/custom-category';
import { CategoryDropZone } from './dnd';
import { useWindowStore } from '../stores/windowStore';
import { useI18n } from '../i18n';
import {
  ideMenuContentClassName,
  ideMenuDangerItemClassName,
  ideMenuItemClassName,
  IdeMenuItemContent,
  ideMenuSeparatorClassName,
} from './ui/ide-menu';

interface CategoryItemProps {
  category: CustomCategory;
  isActive: boolean;
  onClick: () => void;
  onEdit: (category: CustomCategory) => void;
  onDelete: (category: CustomCategory) => void;
  onCreateSubcategory: (parentId: string) => void;
  level?: number;
}

/**
 * CategoryItem 组件
 * 显示单个分类项，支持展开/折叠、右键菜单、拖拽放置等功能
 */
export function CategoryItem({
  category,
  isActive,
  onClick,
  onEdit,
  onDelete,
  onCreateSubcategory,
  level = 0,
}: CategoryItemProps) {
  const { t } = useI18n();
  const customCategories = useWindowStore((state) => state.customCategories);
  const windows = useWindowStore((state) => state.windows);
  const groups = useWindowStore((state) => state.groups);

  const [isExpanded, setIsExpanded] = useState(true);

  // 查找子分类
  const subcategories = customCategories.filter(c => c.parentId === category.id);
  const hasSubcategories = subcategories.length > 0;

  // 计算包含的窗口和组数量
  const windowCount = category.windowIds.filter(id => windows.some(w => w.id === id)).length;
  const groupCount = category.groupIds.filter(id => groups.some(g => g.id === id)).length;
  const totalCount = windowCount + groupCount;

  // 缩进样式
  const indentStyle = { paddingLeft: `${level * 16 + 16}px` };

  return (
    <>
      <CategoryDropZone
        categoryId={category.id}
        windowIds={category.windowIds}
        groupIds={category.groupIds}
      >
        <div
          className={`flex items-center gap-2 py-2 pr-2 rounded-lg text-sm transition-colors cursor-pointer group ${
            isActive
              ? 'bg-[rgb(var(--accent))] text-[rgb(var(--primary))] font-medium'
              : 'text-[rgb(var(--foreground))] hover:bg-[rgb(var(--accent))]'
          }`}
          style={indentStyle}
          onClick={onClick}
        >
          {/* 展开/折叠按钮 */}
          {hasSubcategories ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
              className="flex-shrink-0 w-4 h-4 flex items-center justify-center hover:bg-bg-hover rounded transition-colors"
              aria-label={isExpanded ? t('category.collapse') : t('category.expand')}
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </button>
          ) : (
            <div className="w-4" />
          )}

          {/* 图标 */}
          {category.icon && (
            <span className="flex-shrink-0 text-base" aria-hidden="true">
              {category.icon}
            </span>
          )}

          {/* 分类名称 */}
          <span className="flex-1 truncate">{category.name}</span>

          {/* 数量 */}
          {totalCount > 0 && (
            <span className="flex-shrink-0 text-xs text-text-secondary">
              {totalCount}
            </span>
          )}

          {/* 右键菜单 */}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className="flex-shrink-0 w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-bg-hover rounded transition-all"
                aria-label={t('category.moreActions')}
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className={ideMenuContentClassName}
                sideOffset={5}
                align="end"
              >
                <DropdownMenu.Item
                  className={ideMenuItemClassName}
                  onSelect={() => onEdit(category)}
                >
                  <IdeMenuItemContent
                    icon={<Edit className="h-4 w-4" />}
                    label={t('category.rename')}
                  />
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className={ideMenuItemClassName}
                  onSelect={() => onEdit(category)}
                >
                  <IdeMenuItemContent
                    icon={<Palette className="h-4 w-4" />}
                    label={t('category.changeIcon')}
                  />
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className={ideMenuItemClassName}
                  onSelect={() => onCreateSubcategory(category.id)}
                >
                  <IdeMenuItemContent
                    icon={<FolderPlus className="h-4 w-4" />}
                    label={t('category.createSubcategory')}
                  />
                </DropdownMenu.Item>
                <DropdownMenu.Separator className={ideMenuSeparatorClassName} />
                <DropdownMenu.Item
                  className={ideMenuDangerItemClassName}
                  onSelect={() => onDelete(category)}
                >
                  <IdeMenuItemContent
                    icon={<Trash2 className="h-4 w-4" />}
                    label={t('category.delete')}
                  />
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </CategoryDropZone>

      {/* 递归渲染子分类 */}
      {hasSubcategories && isExpanded && (
        <div>
          {subcategories
            .sort((a, b) => a.order - b.order)
            .map((subcategory) => (
              <CategoryItem
                key={subcategory.id}
                category={subcategory}
                isActive={false}
                onClick={onClick}
                onEdit={onEdit}
                onDelete={onDelete}
                onCreateSubcategory={onCreateSubcategory}
                level={level + 1}
              />
            ))}
        </div>
      )}
    </>
  );
}
