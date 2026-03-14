import React, { useState, useEffect } from 'react';
import { Plus, Settings, HelpCircle, Archive, FolderPlus, Search, X, Trash2, Terminal, Compass, Folder, Grid } from 'lucide-react';
import { StatusBar } from '../StatusBar';
import { CreateWindowDialog } from '../CreateWindowDialog';
import { BatchCreateWindowDialog } from '../BatchCreateWindowDialog';
import { ConfirmDialog } from '../ConfirmDialog';
import { SettingsPanel } from '../SettingsPanel';
import { QuickNavPanel } from '../QuickNavPanel';
import { AboutPanel } from '../AboutPanel';
import { CreateCategoryDialog } from '../CreateCategoryDialog';
import { EditCategoryDialog } from '../EditCategoryDialog';
import { CategoryItem } from '../CategoryItem';
import { CustomCategory } from '../../../shared/types/custom-category';
import { useWindowStore } from '../../stores/windowStore';
import { useI18n } from '../../i18n';

interface SidebarProps {
  appName?: string;
  version?: string;
  onCreateWindow?: () => void;
  onCreateGroup?: () => void;
  isDialogOpen?: boolean;
  onDialogChange?: (open: boolean) => void;
  currentTab?: 'all' | 'active' | 'archived' | string;
  onTabChange?: (tab: 'all' | 'active' | 'archived' | string) => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
}

export function Sidebar({
  appName = 'Copilot-Terminal',
  version = '0.1.0',
  onCreateWindow,
  onCreateGroup,
  isDialogOpen = false,
  onDialogChange,
  currentTab = 'active',
  onTabChange,
  searchQuery = '',
  onSearchChange,
}: SidebarProps) {
  const { t } = useI18n();
  const windows = useWindowStore((state) => state.windows);
  const addWindow = useWindowStore((state) => state.addWindow);
  const removeWindow = useWindowStore((state) => state.removeWindow);
  const customCategories = useWindowStore((state) => state.customCategories);
  const syncCustomCategories = useWindowStore((state) => state.syncCustomCategories);
  const removeCustomCategory = useWindowStore((state) => state.removeCustomCategory);

  const activeWindows = windows.filter(w => !w.archived);
  const archivedWindows = windows.filter(w => w.archived);
  const [isBatchDialogOpen, setIsBatchDialogOpen] = useState(false);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const [isQuickNavPanelOpen, setIsQuickNavPanelOpen] = useState(false);
  const [isAboutPanelOpen, setIsAboutPanelOpen] = useState(false);
  const [isCreateCategoryDialogOpen, setIsCreateCategoryDialogOpen] = useState(false);
  const [isEditCategoryDialogOpen, setIsEditCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CustomCategory | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<CustomCategory | null>(null);
  const [parentIdForNewCategory, setParentIdForNewCategory] = useState<string>('');

  // 从 settings 同步分类数据
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const response = await window.electronAPI.getSettings();
        if (response.success && response.data?.customCategories) {
          syncCustomCategories(response.data.customCategories);
        }
      } catch (error) {
        console.error('Failed to load custom categories:', error);
      }
    };
    loadCategories();
  }, [syncCustomCategories]);

  // 获取顶级分类（没有父分类的）
  const topLevelCategories = customCategories
    .filter(c => !c.parentId)
    .sort((a, b) => a.order - b.order);

  const handleBatchCreate = async (selectedPaths: string[]) => {
    for (const path of selectedPaths) {
      try {
        const result = await window.electronAPI.createWindow({
          workingDirectory: path,
        });

        if (result.success && result.data) {
          addWindow(result.data);
        } else if (result.error) {
          console.error(`Failed to create window for ${path}:`, result.error);
        }
      } catch (error) {
        console.error(`Failed to create window for ${path}:`, error);
      }
    }
  };

  const handleClearAllWindows = async () => {
    try {
      for (const win of activeWindows) {
        await window.electronAPI.closeWindow(win.id);
        await window.electronAPI.deleteWindow(win.id);
        removeWindow(win.id);
      }
    } catch (error) {
      console.error('Failed to clear all windows:', error);
    }
  };

  const handleClearArchivedWindows = async () => {
    try {
      for (const win of archivedWindows) {
        await window.electronAPI.closeWindow(win.id);
        await window.electronAPI.deleteWindow(win.id);
        removeWindow(win.id);
      }
    } catch (error) {
      console.error('Failed to clear archived windows:', error);
    }
  };

  return (
    <>
      <aside className="w-64 h-screen bg-[rgb(var(--sidebar))] border-r border-[rgb(var(--border))] flex flex-col">
        {/* 顶部间距，与右侧卡片对齐 */}
        <div className="h-4" />

        {/* 搜索框 */}
        {((currentTab === 'all' && windows.length > 0) || (currentTab === 'active' && activeWindows.length > 0) || (currentTab === 'archived' && archivedWindows.length > 0)) && (
          <div className="px-4 pb-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange?.(e.target.value)}
                placeholder={t('common.searchWindows')}
                className="w-full pl-8 pr-7 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-md text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => onSearchChange?.('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                  title={t('common.clearSearch')}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* 状态统计 */}
        <div className="px-4 py-4 border-b border-[rgb(var(--border))]">
          <h3 className="text-xs font-semibold text-[rgb(var(--muted-foreground))] uppercase tracking-wider mb-3">
            {t('sidebar.section.statusSummary')}
          </h3>
          <StatusBar />
        </div>

        {/* 窗格管理 */}
        <div className="flex-1 px-4 py-4 overflow-y-auto border-b border-[rgb(var(--border))]">
          <h3 className="text-xs font-semibold text-[rgb(var(--muted-foreground))] uppercase tracking-wider mb-3">
            {t('sidebar.section.windowManagement')}
          </h3>
          {/* Tab buttons */}
          <div className="flex flex-col gap-2">
            <button
              onClick={() => onTabChange?.('all')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
                currentTab === 'all'
                  ? 'bg-[rgb(var(--accent))] text-[rgb(var(--primary))] font-medium'
                  : 'text-[rgb(var(--foreground))] hover:bg-[rgb(var(--accent))]'
              }`}
            >
              <Grid className="h-4 w-4" />
              <span>{t('sidebar.tab.all')}</span>
              {windows.length > 0 && (
                <span className="ml-auto text-xs">{windows.length}</span>
              )}
            </button>
            <button
              onClick={() => onTabChange?.('active')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
                currentTab === 'active'
                  ? 'bg-[rgb(var(--accent))] text-[rgb(var(--primary))] font-medium'
                  : 'text-[rgb(var(--foreground))] hover:bg-[rgb(var(--accent))]'
              }`}
            >
              <Terminal className="h-4 w-4" />
              <span>{t('sidebar.tab.active')}</span>
              {activeWindows.length > 0 && (
                <span className="ml-auto text-xs">{activeWindows.length}</span>
              )}
            </button>
            <button
              onClick={() => onTabChange?.('archived')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
                currentTab === 'archived'
                  ? 'bg-[rgb(var(--accent))] text-[rgb(var(--primary))] font-medium'
                  : 'text-[rgb(var(--foreground))] hover:bg-[rgb(var(--accent))]'
              }`}
            >
              <Archive className="h-4 w-4" />
              <span>{t('sidebar.tab.archived')}</span>
              {archivedWindows.length > 0 && (
                <span className="ml-auto text-xs">{archivedWindows.length}</span>
              )}
            </button>
          </div>

          {/* 分隔线 */}
          {topLevelCategories.length > 0 && (
            <div className="my-3 border-t border-[rgb(var(--border))]" />
          )}

          {/* 自定义分类列表 */}
          <div className="flex flex-col gap-1">
            {topLevelCategories.map((category) => (
              <CategoryItem
                key={category.id}
                category={category}
                isActive={currentTab === category.id}
                onClick={() => onTabChange?.(category.id)}
                onEdit={(cat) => {
                  setEditingCategory(cat);
                  setIsEditCategoryDialogOpen(true);
                }}
                onDelete={(cat) => {
                  setCategoryToDelete(cat);
                }}
                onCreateSubcategory={(parentId) => {
                  setParentIdForNewCategory(parentId);
                  setIsCreateCategoryDialogOpen(true);
                }}
              />
            ))}
          </div>

          {/* 新建分类按钮 */}
          <button
            onClick={() => {
              setParentIdForNewCategory('');
              setIsCreateCategoryDialogOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 mt-2 rounded-lg text-sm text-[rgb(var(--muted-foreground))] hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--foreground))] transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>{t('sidebar.newCategory')}</span>
          </button>
        </div>

        {/* Bottom section */}
        <div className="space-y-2 p-4">
          {/* Settings and Help row */}
          <div className="flex items-center gap-2">
            <button
              className="flex-1 flex items-center justify-start gap-2 px-3 py-2 rounded-lg text-sm text-[rgb(var(--foreground))] hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--accent-foreground))] transition-colors"
              onClick={() => setIsSettingsPanelOpen(true)}
            >
              <Settings className="h-4 w-4" />
              <span>{t('settings.title')}</span>
            </button>
            <button
              className="flex items-center justify-center w-9 h-9 rounded-lg text-[rgb(var(--foreground))] hover:bg-[rgb(var(--accent))] transition-colors"
              onClick={() => setIsQuickNavPanelOpen(true)}
              title={t('quickNav.title')}
            >
              <Compass className="h-4 w-4" />
            </button>
            <button
              className="flex items-center justify-center w-9 h-9 rounded-lg text-[rgb(var(--foreground))] hover:bg-[rgb(var(--accent))] transition-colors"
              onClick={() => setIsAboutPanelOpen(true)}
              title={t('about.title')}
              aria-label={t('about.title')}
            >
              <HelpCircle className="h-4 w-4" />
            </button>
          </div>

          {/* New Terminal button */}
          <button
            onClick={onCreateWindow}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[rgb(var(--primary))] text-[rgb(var(--primary-foreground))] font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" />
            <span>{t('common.newTerminal')}</span>
          </button>

          {/* Create Group button */}
          {activeWindows.length >= 2 && (
            <button
              onClick={onCreateGroup}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-zinc-700 text-zinc-100 font-medium hover:bg-zinc-600 transition-colors"
              title="创建窗口组"
            >
              <Folder className="h-4 w-4" />
              <span>创建组</span>
            </button>
          )}

          {/* Batch button - always show */}
          <button
            onClick={() => setIsBatchDialogOpen(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[rgb(var(--primary))] text-[rgb(var(--primary-foreground))] font-medium hover:opacity-90 transition-opacity"
            title={t('sidebar.batchAdd')}
          >
            <FolderPlus className="h-4 w-4" />
            <span>{t('sidebar.batchAdd')}</span>
          </button>

          {/* Clear button - show for both active and archived tabs */}
          {currentTab === 'active' && activeWindows.length > 0 && (
            <button
              onClick={() => setIsConfirmDialogOpen(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-red-600 text-zinc-300 hover:text-white transition-colors"
              title={t('sidebar.confirmClearActiveTitle')}
            >
              <Trash2 className="h-4 w-4" />
              <span>{t('sidebar.clearActive')}</span>
            </button>
          )}
          {currentTab === 'archived' && archivedWindows.length > 0 && (
            <button
              onClick={() => setIsConfirmDialogOpen(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-red-600 text-zinc-300 hover:text-white transition-colors"
              title={t('sidebar.confirmClearArchivedTitle')}
            >
              <Trash2 className="h-4 w-4" />
              <span>{t('sidebar.clearArchived')}</span>
            </button>
          )}
        </div>
      </aside>

      <CreateWindowDialog
        open={isDialogOpen}
        onOpenChange={onDialogChange ?? (() => {})}
      />

      <BatchCreateWindowDialog
        open={isBatchDialogOpen}
        onOpenChange={setIsBatchDialogOpen}
        onConfirm={handleBatchCreate}
      />

      <ConfirmDialog
        open={isConfirmDialogOpen}
        onOpenChange={setIsConfirmDialogOpen}
        title={currentTab === 'active' ? t('sidebar.confirmClearActiveTitle') : t('sidebar.confirmClearArchivedTitle')}
        description={
          currentTab === 'active'
            ? t('sidebar.confirmClearActiveDescription', { count: activeWindows.length })
            : t('sidebar.confirmClearArchivedDescription', { count: archivedWindows.length })
        }
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        onConfirm={currentTab === 'active' ? handleClearAllWindows : handleClearArchivedWindows}
        variant="danger"
      />

      <SettingsPanel
        open={isSettingsPanelOpen}
        onClose={() => setIsSettingsPanelOpen(false)}
      />

      <QuickNavPanel
        open={isQuickNavPanelOpen}
        onClose={() => setIsQuickNavPanelOpen(false)}
      />

      <AboutPanel
        open={isAboutPanelOpen}
        onClose={() => setIsAboutPanelOpen(false)}
        appName={appName}
        version={version}
      />

      <CreateCategoryDialog
        open={isCreateCategoryDialogOpen}
        onOpenChange={setIsCreateCategoryDialogOpen}
        defaultParentId={parentIdForNewCategory}
      />

      <EditCategoryDialog
        open={isEditCategoryDialogOpen}
        onOpenChange={setIsEditCategoryDialogOpen}
        category={editingCategory}
      />

      <ConfirmDialog
        open={!!categoryToDelete}
        onOpenChange={(open) => { if (!open) setCategoryToDelete(null); }}
        title={t('category.delete')}
        description={
          categoryToDelete
            ? t('category.deleteConfirm', { name: categoryToDelete.name })
            : ''
        }
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        onConfirm={async () => {
          if (categoryToDelete) {
            await removeCustomCategory(categoryToDelete.id);
            // 如果当前选中的是被删除的分类，切换到活跃终端
            if (currentTab === categoryToDelete.id) {
              onTabChange?.('active');
            }
            setCategoryToDelete(null);
          }
        }}
        variant="danger"
      />
    </>
  );
}


