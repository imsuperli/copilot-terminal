import React, { useState, useEffect, useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Select from '@radix-ui/react-select';
import * as Switch from '@radix-ui/react-switch';
import * as Tabs from '@radix-ui/react-tabs';
import { X, Plus, Trash2, Search, Check, ChevronDown, Globe, Folder, Edit2, GripVertical, FolderOpen } from 'lucide-react';
import { IDEIcon } from './icons/IDEIcons';
import { notifyIDESettingsUpdated } from '../hooks/useIDESettings';
import { QuickNavItem } from '../../shared/types/quick-nav';
import { useI18n } from '../i18n';
import { AppLanguage } from '../../shared/i18n';

interface IDEConfig {
  id: string;
  name: string;
  command: string;
  path?: string;
  enabled: boolean;
  icon?: string;
}

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ open, onClose }) => {
  const { language, setLanguage, t } = useI18n();
  const isWindows = window.electronAPI.platform === 'win32';
  const [ides, setIDEs] = useState<IDEConfig[]>([]);
  const [supportedIDENames, setSupportedIDENames] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [editingIDE, setEditingIDE] = useState<IDEConfig | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);

  // 快捷导航状态
  const [quickNavItems, setQuickNavItems] = useState<QuickNavItem[]>([]);
  const [editingNavItem, setEditingNavItem] = useState<QuickNavItem | null>(null);
  const [showNavDialog, setShowNavDialog] = useState(false);
  const [currentTab, setCurrentTab] = useState<'general' | 'ide' | 'quicknav' | 'statusline' | 'tmux'>('general');

  // StatusLine 配置状态
  const [statusLineConfig, setStatusLineConfig] = useState({
    enabled: false,
    format: 'full' as 'full' | 'compact',
    showModel: true,
    showContext: true,
    showCost: true,
  });
  const [terminalSettings, setTerminalSettings] = useState({
    useBundledConptyDll: true,
  });

  // tmux 兼容模式配置状态
  const [tmuxSettings, setTmuxSettings] = useState({
    enabled: true,
    autoInjectPath: true,
    enableForAllPanes: false,
  });

  // 加载设置
  useEffect(() => {
    if (open) {
      loadSettings();
      loadSupportedIDENames();
    }
  }, [open]);

  const loadSettings = async () => {
    try {
      const response = await window.electronAPI.getSettings();
      if (response.success && response.data) {
        setIDEs(response.data.ides || []);
        setQuickNavItems((response.data.quickNav?.items || []).sort((a: QuickNavItem, b: QuickNavItem) => a.order - b.order));

        // 加载 StatusLine 配置（合并默认值）
        if (response.data.statusLine) {
          setStatusLineConfig({
            enabled: response.data.statusLine.enabled ?? false,
            format: response.data.statusLine.format ?? 'full',
            showModel: response.data.statusLine.showModel ?? true,
            showContext: response.data.statusLine.showContext ?? true,
            showCost: response.data.statusLine.showCost ?? true,
          });
        }

        if (response.data.terminal) {
          setTerminalSettings({
            useBundledConptyDll: response.data.terminal.useBundledConptyDll ?? true,
          });
        }

        // 加载 tmux 兼容模式配置
        if (response.data.tmux) {
          setTmuxSettings({
            enabled: response.data.tmux.enabled ?? true,
            autoInjectPath: response.data.tmux.autoInjectPath ?? true,
            enableForAllPanes: response.data.tmux.enableForAllPanes ?? false,
          });
        }
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const loadSupportedIDENames = async () => {
    try {
      const response = await window.electronAPI.getSupportedIDENames();
      if (response.success && response.data) {
        setSupportedIDENames(response.data);
      }
    } catch (error) {
      console.error('Failed to load supported IDE names:', error);
    }
  };

  const handleScanAll = async () => {
    setScanning(true);
    try {
      const response = await window.electronAPI.scanIDEs();
      if (response.success && response.data) {
        // 合并扫描结果和现有配置
        const scannedIDEs = response.data as IDEConfig[];
        const mergedIDEs = scannedIDEs.map(scanned => {
          const existing = ides.find(ide => ide.id === scanned.id);
          return existing ? { ...scanned, enabled: existing.enabled } : scanned;
        });
        setIDEs(mergedIDEs);

        // 保存到设置
        await window.electronAPI.updateSettings({ ides: mergedIDEs });

        // 通知其他组件刷新
        notifyIDESettingsUpdated();
      }
    } catch (error) {
      console.error('Failed to scan IDEs:', error);
    } finally {
      setScanning(false);
    }
  };

  const handleToggleIDE = async (ideId: string, enabled: boolean) => {
    const updatedIDEs = ides.map(ide =>
      ide.id === ideId ? { ...ide, enabled } : ide
    );
    setIDEs(updatedIDEs);

    try {
      await window.electronAPI.updateSettings({ ides: updatedIDEs });
      // 通知其他组件刷新
      notifyIDESettingsUpdated();
    } catch (error) {
      console.error('Failed to update IDE:', error);
    }
  };

  const handleDeleteIDE = async (ideId: string) => {
    try {
      const response = await window.electronAPI.deleteIDEConfig(ideId);
      if (response.success && response.data) {
        setIDEs(response.data);
        // 通知其他组件刷新
        notifyIDESettingsUpdated();
      }
    } catch (error) {
      console.error('Failed to delete IDE:', error);
    }
  };

  const handleAddIDE = () => {
    setEditingIDE({
      id: '',
      name: '',
      command: '',
      path: '',
      enabled: true,
      icon: '',
    });
    setShowAddDialog(true);
  };

  const handleSaveIDE = async () => {
    if (!editingIDE || !editingIDE.name || !editingIDE.command) {
      return;
    }

    try {
      const ideToSave = {
        ...editingIDE,
        id: editingIDE.id || editingIDE.command.toLowerCase().replace(/\s+/g, '-'),
      };

      const response = await window.electronAPI.updateIDEConfig(ideToSave);
      if (response.success && response.data) {
        setIDEs(response.data);
        setShowAddDialog(false);
        setEditingIDE(null);
        // 通知其他组件刷新
        notifyIDESettingsUpdated();
      }
    } catch (error) {
      console.error('Failed to save IDE:', error);
    }
  };

  const handleScanSpecific = async (ideName: string) => {
    try {
      const response = await window.electronAPI.scanSpecificIDE(ideName);
      if (response.success && response.data) {
        setEditingIDE(prev => prev ? { ...prev, path: response.data } : null);
      }
    } catch (error) {
      console.error('Failed to scan specific IDE:', error);
    }
  };

  // 快捷导航处理函数
  const handleAddNavItem = () => {
    setEditingNavItem({
      id: Date.now().toString(),
      name: '',
      type: 'url',
      path: '',
      order: quickNavItems.length,
    });
    setShowNavDialog(true);
  };

  const handleEditNavItem = (item: QuickNavItem) => {
    setEditingNavItem({ ...item });
    setShowNavDialog(true);
  };

  const handleSaveNavItem = async () => {
    if (!editingNavItem || !editingNavItem.name || !editingNavItem.path) {
      return;
    }

    try {
      let updatedItems: QuickNavItem[];
      const existingIndex = quickNavItems.findIndex(item => item.id === editingNavItem.id);

      if (existingIndex >= 0) {
        // 更新现有项
        updatedItems = [...quickNavItems];
        updatedItems[existingIndex] = editingNavItem;
      } else {
        // 添加新项
        updatedItems = [...quickNavItems, editingNavItem];
      }

      // 保存到设置
      await window.electronAPI.updateSettings({
        quickNav: { items: updatedItems }
      });

      setQuickNavItems(updatedItems);
      setShowNavDialog(false);
      setEditingNavItem(null);
    } catch (error) {
      console.error('Failed to save quick nav item:', error);
    }
  };

  const handleDeleteNavItem = async (itemId: string) => {
    try {
      const updatedItems = quickNavItems.filter(item => item.id !== itemId);
      // 重新排序
      const reorderedItems = updatedItems.map((item, index) => ({
        ...item,
        order: index,
      }));

      await window.electronAPI.updateSettings({
        quickNav: { items: reorderedItems }
      });

      setQuickNavItems(reorderedItems);
    } catch (error) {
      console.error('Failed to delete quick nav item:', error);
    }
  };

  // 自动检测路径类型
  const detectPathType = (path: string): 'url' | 'folder' => {
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return 'url';
    }
    return 'folder';
  };

  // 自动获取网站标题（简化版，实际需要主进程支持）
  const handlePathChange = (path: string) => {
    if (!editingNavItem) return;

    const type = detectPathType(path);
    setEditingNavItem(prev => prev ? { ...prev, path, type } : null);

    // 如果是 URL 且名称为空，尝试从 URL 提取名称
    if (type === 'url' && !editingNavItem.name) {
      try {
        const url = new URL(path);
        const hostname = url.hostname.replace('www.', '');
        setEditingNavItem(prev => prev ? { ...prev, name: hostname } : null);
      } catch (e) {
        // 忽略无效 URL
      }
    } else if (type === 'folder' && !editingNavItem.name) {
      // 从路径提取文件夹名称
      const folderName = path.split(/[/\\]/).filter(Boolean).pop() || '';
      setEditingNavItem(prev => prev ? { ...prev, name: folderName } : null);
    }
  };

  // 浏览文件夹
  const handleBrowseFolder = async () => {
    try {
      const result = await window.electronAPI.selectDirectory();
      if (result.success && result.data) {
        handlePathChange(result.data);
      }
    } catch (error) {
      console.error('Failed to select directory:', error);
    }
  };

  // StatusLine 配置处理
  const handleStatusLineConfigChange = async (updates: Partial<typeof statusLineConfig>) => {
    const newConfig = { ...statusLineConfig, ...updates };
    setStatusLineConfig(newConfig);

    try {
      await window.electronAPI.updateSettings({ statusLine: newConfig });
    } catch (error) {
      console.error('Failed to update StatusLine config:', error);
    }
  };

  const handleTerminalSettingsChange = async (updates: Partial<typeof terminalSettings>) => {
    const newConfig = { ...terminalSettings, ...updates };
    setTerminalSettings(newConfig);

    try {
      await window.electronAPI.updateSettings({ terminal: newConfig });
    } catch (error) {
      console.error('Failed to update terminal settings:', error);
    }
  };

  const handleTmuxSettingsChange = async (updates: Partial<typeof tmuxSettings>) => {
    const newConfig = { ...tmuxSettings, ...updates };
    setTmuxSettings(newConfig);

    try {
      await window.electronAPI.updateSettings({ tmux: newConfig });
    } catch (error) {
      console.error('Failed to update tmux settings:', error);
    }
  };

  const handleToggleStatusLine = async (enabled: boolean) => {
    await handleStatusLineConfigChange({ enabled });

    if (enabled) {
      // 自动配置 Claude Code
      try {
        const response = await window.electronAPI.statusLineConfigure();
        if (response.success) {
          console.log('Claude Code configured successfully');
        } else {
          console.error('Failed to configure Claude Code:', response.error);
        }
      } catch (error) {
        console.error('Failed to configure Claude Code:', error);
      }
    } else {
      // 移除 Claude Code 配置
      try {
        const response = await window.electronAPI.statusLineRemove();
        if (response.success) {
          console.log('Claude Code configuration removed');
        } else {
          console.error('Failed to remove Claude Code configuration:', response.error);
        }
      } catch (error) {
        console.error('Failed to remove Claude Code configuration:', error);
      }
    }
  };

  const handleLanguageChange = useCallback(async (nextLanguage: string) => {
    await setLanguage(nextLanguage as AppLanguage);
  }, [setLanguage]);

  return (
    <Dialog.Root open={open} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 animate-fade-in" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-5xl h-[85vh] bg-zinc-900 rounded-xl shadow-2xl border border-zinc-800 z-50 overflow-hidden flex flex-col animate-scale-in">
          {/* 标题栏 */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/50 backdrop-blur flex-shrink-0">
            <Dialog.Title className="text-xl font-semibold text-zinc-100">
              {t('settings.title')}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors">
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          {/* 主内容区域：左侧 Tab + 右侧内容 */}
          <div className="flex-1 flex overflow-hidden">
            {/* 左侧 Tab 列表 */}
            <Tabs.Root value={currentTab} onValueChange={(value) => setCurrentTab(value as 'general' | 'ide' | 'quicknav' | 'statusline' | 'tmux')} className="flex flex-1 overflow-hidden">
              <Tabs.List className="flex flex-col w-48 border-r border-zinc-800 bg-zinc-900/30 flex-shrink-0">
                <Tabs.Trigger
                  value="general"
                  className="px-6 py-4 text-left text-sm font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 data-[state=active]:text-zinc-100 data-[state=active]:bg-zinc-800 data-[state=active]:border-r-2 data-[state=active]:border-blue-500 transition-colors"
                >
                  {t('settings.tab.general')}
                </Tabs.Trigger>
                <Tabs.Trigger
                  value="ide"
                  className="px-6 py-4 text-left text-sm font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 data-[state=active]:text-zinc-100 data-[state=active]:bg-zinc-800 data-[state=active]:border-r-2 data-[state=active]:border-blue-500 transition-colors"
                >
                  {t('settings.tab.ide')}
                </Tabs.Trigger>
                <Tabs.Trigger
                  value="quicknav"
                  className="px-6 py-4 text-left text-sm font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 data-[state=active]:text-zinc-100 data-[state=active]:bg-zinc-800 data-[state=active]:border-r-2 data-[state=active]:border-blue-500 transition-colors"
                >
                  {t('settings.tab.quickNav')}
                </Tabs.Trigger>
                <Tabs.Trigger
                  value="statusline"
                  className="px-6 py-4 text-left text-sm font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 data-[state=active]:text-zinc-100 data-[state=active]:bg-zinc-800 data-[state=active]:border-r-2 data-[state=active]:border-blue-500 transition-colors"
                >
                  {t('settings.tab.statusLine')}
                </Tabs.Trigger>
                <Tabs.Trigger
                  value="tmux"
                  className="px-6 py-4 text-left text-sm font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 data-[state=active]:text-zinc-100 data-[state=active]:bg-zinc-800 data-[state=active]:border-r-2 data-[state=active]:border-blue-500 transition-colors"
                >
                  {t('settings.tab.tmux')}
                </Tabs.Trigger>
              </Tabs.List>

              {/* 右侧内容区域 */}
              <div className="flex-1 overflow-hidden flex flex-col">
                <Tabs.Content value="general" className="flex-1 overflow-y-auto p-6 data-[state=inactive]:hidden">
                  <div className="max-w-xl space-y-6">
                    <div className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
                      <div className="mb-4">
                        <h3 className="text-sm font-semibold text-zinc-100 mb-1">{t('settings.general.languageTitle')}</h3>
                        <p className="text-xs text-zinc-400">{t('settings.general.languageDescription')}</p>
                      </div>

                      <Select.Root value={language} onValueChange={handleLanguageChange}>
                        <Select.Trigger className="w-full flex items-center justify-between px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:border-blue-500 transition-colors">
                          <Select.Value />
                          <Select.Icon>
                            <ChevronDown size={16} className="text-zinc-400" />
                          </Select.Icon>
                        </Select.Trigger>

                        <Select.Portal>
                          <Select.Content
                            position="popper"
                            side="bottom"
                            align="start"
                            sideOffset={6}
                            className="z-[80] w-[var(--radix-select-trigger-width)] overflow-hidden bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl"
                          >
                            <Select.Viewport className="p-1">
                              <Select.Item value="zh-CN" className="px-3 py-2 rounded-md text-zinc-100 hover:bg-zinc-800 outline-none cursor-pointer">
                                <Select.ItemText>{t('settings.language.zhCN')}</Select.ItemText>
                              </Select.Item>
                              <Select.Item value="en-US" className="px-3 py-2 rounded-md text-zinc-100 hover:bg-zinc-800 outline-none cursor-pointer">
                                <Select.ItemText>{t('settings.language.enUS')}</Select.ItemText>
                              </Select.Item>
                            </Select.Viewport>
                          </Select.Content>
                        </Select.Portal>
                      </Select.Root>
                    </div>

                    {isWindows && (
                      <div className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <h3 className="text-sm font-semibold text-zinc-100 mb-1">{t('settings.general.bundledConptyTitle')}</h3>
                            <p className="text-xs text-zinc-400">{t('settings.general.bundledConptyDescription')}</p>
                          </div>
                          <Switch.Root
                            checked={terminalSettings.useBundledConptyDll}
                            onCheckedChange={(checked) => handleTerminalSettingsChange({ useBundledConptyDll: checked })}
                            className="w-11 h-6 bg-zinc-700 rounded-full relative data-[state=checked]:bg-blue-600 transition-colors flex-shrink-0"
                          >
                            <Switch.Thumb className="block w-5 h-5 bg-white rounded-full transition-transform translate-x-0.5 data-[state=checked]:translate-x-[22px]" />
                          </Switch.Root>
                        </div>
                      </div>
                    )}
                  </div>
                </Tabs.Content>

                {/* IDE 设置 Tab */}
                <Tabs.Content value="ide" className="flex-1 overflow-y-auto p-6 data-[state=inactive]:hidden">
                  {/* 扫描按钮 */}
                  <div className="mb-6 flex items-center gap-3">
              <button
                onClick={handleScanAll}
                disabled={scanning}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg transition-colors font-medium"
              >
                <Search size={16} />
                {scanning ? t('common.loading') : t('settings.ide.scan')}
              </button>
              <button
                onClick={handleAddIDE}
                className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg transition-colors font-medium"
              >
                <Plus size={16} />
                {t('settings.ide.addCustom')}
              </button>
            </div>

            {/* IDE 列表 */}
            <div className="space-y-3">
              {ides.length === 0 ? (
                <div className="text-center py-12 text-zinc-500">
                  <p className="text-lg mb-2">{t('settings.ide.emptyTitle')}</p>
                  <p className="text-sm">{t('settings.ide.emptyDescription')}</p>
                </div>
              ) : (
                ides.map((ide) => (
                  <div
                    key={ide.id}
                    className="flex items-center gap-4 p-4 bg-zinc-800/50 rounded-lg border border-zinc-700/50 hover:border-zinc-600 transition-colors"
                  >
                    {/* IDE 图标 */}
                    <div className="flex-shrink-0">
                      <IDEIcon icon={ide.icon || ''} size={32} />
                    </div>

                    {/* IDE 信息 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-zinc-100">{ide.name}</h3>
                        {ide.path && (
                          <span className="text-xs px-2 py-0.5 bg-green-900/30 text-green-400 rounded">
                            {t('settings.ide.found')}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-400 truncate">
                        {ide.path || t('settings.ide.commandPrefix', { command: ide.command })}
                      </p>
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex items-center gap-3">
                      <Switch.Root
                        checked={ide.enabled}
                        onCheckedChange={(checked) => handleToggleIDE(ide.id, checked)}
                        className="w-11 h-6 bg-zinc-700 rounded-full relative data-[state=checked]:bg-blue-600 transition-colors"
                      >
                        <Switch.Thumb className="block w-5 h-5 bg-white rounded-full transition-transform translate-x-0.5 data-[state=checked]:translate-x-[22px]" />
                      </Switch.Root>

                      <button
                        onClick={() => handleDeleteIDE(ide.id)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-900/30 text-zinc-400 hover:text-red-400 transition-colors"
                        title={t('common.delete')}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
                </Tabs.Content>

                {/* 快捷导航 Tab */}
                <Tabs.Content value="quicknav" className="flex-1 overflow-y-auto p-6 data-[state=inactive]:hidden">
            {/* 添加按钮 */}
            <div className="mb-6">
              <button
                onClick={handleAddNavItem}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
              >
                <Plus size={16} />
                {t('settings.quickNav.add')}
              </button>
            </div>

            {/* 快捷导航列表 */}
            <div className="space-y-3">
              {quickNavItems.length === 0 ? (
                <div className="text-center py-12 text-zinc-500">
                  <Globe size={48} className="mx-auto mb-4 opacity-50" />
                  <p className="text-lg mb-2">{t('settings.quickNav.emptyTitle')}</p>
                  <p className="text-sm">{t('settings.quickNav.emptyDescription')}</p>
                </div>
              ) : (
                quickNavItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-4 p-4 bg-zinc-800/50 rounded-lg border border-zinc-700/50 hover:border-zinc-600 transition-colors"
                  >
                    {/* 拖拽手柄 */}
                    <div className="flex-shrink-0 text-zinc-600 cursor-move">
                      <GripVertical size={20} />
                    </div>

                    {/* 图标 */}
                    <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg bg-zinc-700/50">
                      {item.type === 'url' ? (
                        <Globe size={20} className="text-blue-400" />
                      ) : (
                        <Folder size={20} className="text-yellow-400" />
                      )}
                    </div>

                    {/* 信息 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-zinc-100">{item.name}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          item.type === 'url'
                            ? 'bg-blue-900/30 text-blue-400'
                            : 'bg-yellow-900/30 text-yellow-400'
                        }`}>
                          {item.type === 'url' ? t('common.url') : t('common.folder')}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 truncate" title={item.path}>
                        {item.path}
                      </p>
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEditNavItem(item)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 transition-colors"
                        title={t('common.edit')}
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteNavItem(item.id)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-900/30 text-zinc-400 hover:text-red-400 transition-colors"
                        title={t('common.delete')}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Tabs.Content>

          {/* StatusLine Tab */}
          <Tabs.Content value="statusline" className="flex-1 overflow-y-auto p-6 data-[state=inactive]:hidden">
            <div className="max-w-2xl space-y-6">
              {/* 启用开关 */}
              <div className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100 mb-1">{t('settings.statusLine.enableTitle')}</h3>
                  <p className="text-xs text-zinc-400">{t('settings.statusLine.enableDescription')}</p>
                </div>
                <Switch.Root
                  checked={statusLineConfig.enabled}
                  onCheckedChange={handleToggleStatusLine}
                  className="w-11 h-6 bg-zinc-700 rounded-full relative data-[state=checked]:bg-blue-600 transition-colors"
                >
                  <Switch.Thumb className="block w-5 h-5 bg-white rounded-full transition-transform translate-x-0.5 data-[state=checked]:translate-x-[22px]" />
                </Switch.Root>
              </div>

              {/* 配置选项（仅在启用时显示） */}
              {statusLineConfig.enabled && (
                <>
                  {/* 显示格式 */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-zinc-100">{t('settings.statusLine.displayFormat')}</h3>
                    <div className="space-y-2">
                      <label className="flex items-center gap-3 p-3 bg-zinc-800/30 rounded-lg border border-zinc-700/50 hover:border-zinc-600 cursor-pointer transition-colors">
                        <input
                          type="radio"
                          name="format"
                          value="full"
                          checked={statusLineConfig.format === 'full'}
                          onChange={(e) => handleStatusLineConfigChange({ format: e.target.value as 'full' })}
                          className="w-4 h-4 text-blue-600"
                        />
                        <div className="flex-1">
                          <div className="text-sm text-zinc-100 mb-1">{t('settings.statusLine.full')}</div>
                          <div className="text-xs font-mono text-zinc-400 bg-zinc-900/50 px-2 py-1 rounded">
                            Model: Sonnet 4.6 | Context: 45% | Cost: $0.25
                          </div>
                        </div>
                      </label>
                      <label className="flex items-center gap-3 p-3 bg-zinc-800/30 rounded-lg border border-zinc-700/50 hover:border-zinc-600 cursor-pointer transition-colors">
                        <input
                          type="radio"
                          name="format"
                          value="compact"
                          checked={statusLineConfig.format === 'compact'}
                          onChange={(e) => handleStatusLineConfigChange({ format: e.target.value as 'compact' })}
                          className="w-4 h-4 text-blue-600"
                        />
                        <div className="flex-1">
                          <div className="text-sm text-zinc-100 mb-1">{t('settings.statusLine.compact')}</div>
                          <div className="text-xs font-mono text-zinc-400 bg-zinc-900/50 px-2 py-1 rounded">
                            Sonnet 4.6 • 45% • $0.25
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* 显示内容 */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-zinc-100">{t('settings.statusLine.displayContent')}</h3>
                    <div className="space-y-2">
                      <label className="flex items-center gap-3 p-3 bg-zinc-800/30 rounded-lg border border-zinc-700/50">
                        <input
                          type="checkbox"
                          checked={statusLineConfig.showModel}
                          className="w-4 h-4 text-blue-600"
                          disabled
                        />
                        <div className="flex-1">
                          <div className="text-sm text-zinc-100">{t('settings.statusLine.modelName')}</div>
                          <div className="text-xs text-zinc-400">{t('settings.statusLine.required')}</div>
                        </div>
                      </label>
                      <label className="flex items-center gap-3 p-3 bg-zinc-800/30 rounded-lg border border-zinc-700/50 hover:border-zinc-600 cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          checked={statusLineConfig.showContext}
                          onChange={(e) => handleStatusLineConfigChange({ showContext: e.target.checked })}
                          className="w-4 h-4 text-blue-600"
                        />
                        <div className="flex-1">
                          <div className="text-sm text-zinc-100">{t('settings.statusLine.contextPercentage')}</div>
                          <div className="text-xs text-zinc-400">{t('settings.statusLine.contextExample')}</div>
                        </div>
                      </label>
                      <label className="flex items-center gap-3 p-3 bg-zinc-800/30 rounded-lg border border-zinc-700/50 hover:border-zinc-600 cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          checked={statusLineConfig.showCost}
                          onChange={(e) => handleStatusLineConfigChange({ showCost: e.target.checked })}
                          className="w-4 h-4 text-blue-600"
                        />
                        <div className="flex-1">
                          <div className="text-sm text-zinc-100">{t('settings.statusLine.cost')}</div>
                          <div className="text-xs text-zinc-400">{t('settings.statusLine.costExample')}</div>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* 配置状态 */}
                  <div className="p-4 bg-green-900/20 border border-green-700/50 rounded-lg">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-green-600 flex items-center justify-center mt-0.5">
                        <Check size={14} className="text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-green-100 mb-1">{t('settings.statusLine.savedTitle')}</div>
                        <div className="text-xs text-green-200/70">
                          {t('settings.statusLine.savedDescription')}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </Tabs.Content>

          {/* tmux 兼容模式 Tab */}
          <Tabs.Content value="tmux" className="flex-1 overflow-y-auto p-6 data-[state=inactive]:hidden">
            <div className="max-w-2xl space-y-6">
              {/* 启用开关 */}
              <div className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100 mb-1">{t('settings.tmux.enableTitle')}</h3>
                  <p className="text-xs text-zinc-400">{t('settings.tmux.enableDescription')}</p>
                </div>
                <Switch.Root
                  checked={tmuxSettings.enabled}
                  onCheckedChange={(checked) => handleTmuxSettingsChange({ enabled: checked })}
                  className="w-11 h-6 bg-zinc-700 rounded-full relative data-[state=checked]:bg-blue-600 transition-colors flex-shrink-0"
                >
                  <Switch.Thumb className="block w-5 h-5 bg-white rounded-full transition-transform translate-x-0.5 data-[state=checked]:translate-x-[22px]" />
                </Switch.Root>
              </div>

              {/* 子选项（仅在启用时显示） */}
              {tmuxSettings.enabled && (
                <>
                  <div className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-100 mb-1">{t('settings.tmux.autoInjectPathTitle')}</h3>
                      <p className="text-xs text-zinc-400">{t('settings.tmux.autoInjectPathDescription')}</p>
                    </div>
                    <Switch.Root
                      checked={tmuxSettings.autoInjectPath}
                      onCheckedChange={(checked) => handleTmuxSettingsChange({ autoInjectPath: checked })}
                      className="w-11 h-6 bg-zinc-700 rounded-full relative data-[state=checked]:bg-blue-600 transition-colors flex-shrink-0"
                    >
                      <Switch.Thumb className="block w-5 h-5 bg-white rounded-full transition-transform translate-x-0.5 data-[state=checked]:translate-x-[22px]" />
                    </Switch.Root>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-100 mb-1">{t('settings.tmux.enableForAllPanesTitle')}</h3>
                      <p className="text-xs text-zinc-400">{t('settings.tmux.enableForAllPanesDescription')}</p>
                    </div>
                    <Switch.Root
                      checked={tmuxSettings.enableForAllPanes}
                      onCheckedChange={(checked) => handleTmuxSettingsChange({ enableForAllPanes: checked })}
                      className="w-11 h-6 bg-zinc-700 rounded-full relative data-[state=checked]:bg-blue-600 transition-colors flex-shrink-0"
                    >
                      <Switch.Thumb className="block w-5 h-5 bg-white rounded-full transition-transform translate-x-0.5 data-[state=checked]:translate-x-[22px]" />
                    </Switch.Root>
                  </div>
                </>
              )}
            </div>
          </Tabs.Content>
              </div>
            </Tabs.Root>
          </div>
        </Dialog.Content>
      </Dialog.Portal>

      {/* 添加/编辑 IDE 对话框 */}
          <Dialog.Root open={showAddDialog} onOpenChange={setShowAddDialog}>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[60]" />
              <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] bg-zinc-800 rounded-xl shadow-2xl border border-zinc-700 z-[70] p-6">
                <Dialog.Title className="text-lg font-semibold text-zinc-100 mb-4">
                  {editingIDE?.id ? t('settings.ideDialog.editTitle') : t('settings.ideDialog.addTitle')}
                </Dialog.Title>

                <div className="space-y-4">
                  {/* IDE 名称选择 */}
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                      {t('settings.ideDialog.nameLabel')}
                    </label>
                    <Select.Root
                      value={editingIDE?.name || ''}
                      onValueChange={(value) => {
                        setEditingIDE(prev => prev ? { ...prev, name: value } : null);
                        handleScanSpecific(value);
                      }}
                    >
                      <Select.Trigger className="w-full flex items-center justify-between px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 hover:border-zinc-600 transition-colors">
                        <Select.Value placeholder={t('settings.ideDialog.namePlaceholder')} />
                        <Select.Icon>
                          <ChevronDown size={16} />
                        </Select.Icon>
                      </Select.Trigger>
                      <Select.Portal>
                        <Select.Content className="bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl overflow-hidden z-[80]">
                          <Select.Viewport className="p-1">
                            {supportedIDENames.map((name) => (
                              <Select.Item
                                key={name}
                                value={name}
                                className="px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-700 rounded cursor-pointer outline-none flex items-center justify-between"
                              >
                                <Select.ItemText>{name}</Select.ItemText>
                                <Select.ItemIndicator>
                                  <Check size={14} />
                                </Select.ItemIndicator>
                              </Select.Item>
                            ))}
                          </Select.Viewport>
                        </Select.Content>
                      </Select.Portal>
                    </Select.Root>
                  </div>

                  {/* 命令 */}
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                      {t('settings.ideDialog.commandLabel')}
                    </label>
                    <input
                      type="text"
                      value={editingIDE?.command || ''}
                      onChange={(e) => setEditingIDE(prev => prev ? { ...prev, command: e.target.value } : null)}
                      placeholder={t('settings.ideDialog.commandPlaceholder')}
                      className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none transition-colors"
                    />
                  </div>

                  {/* 路径 */}
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                      {t('settings.ideDialog.pathLabel')}
                    </label>
                    <input
                      type="text"
                      value={editingIDE?.path || ''}
                      onChange={(e) => setEditingIDE(prev => prev ? { ...prev, path: e.target.value } : null)}
                      placeholder={t('settings.ideDialog.pathPlaceholder')}
                      className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none transition-colors"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 mt-6">
                  <button
                    onClick={() => setShowAddDialog(false)}
                    className="px-4 py-2 text-zinc-400 hover:text-zinc-100 transition-colors"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={handleSaveIDE}
                    disabled={!editingIDE?.name || !editingIDE?.command}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg transition-colors font-medium"
                  >
                    {t('common.save')}
                  </button>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>

          {/* 添加/编辑快捷导航对话框 */}
          <Dialog.Root open={showNavDialog} onOpenChange={setShowNavDialog}>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[60]" />
              <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] bg-zinc-800 rounded-xl shadow-2xl border border-zinc-700 z-[70] p-6">
                <Dialog.Title className="text-lg font-semibold text-zinc-100 mb-4">
                  {editingNavItem?.id && quickNavItems.find(i => i.id === editingNavItem.id) ? t('settings.quickNavDialog.editTitle') : t('settings.quickNavDialog.addTitle')}
                </Dialog.Title>

                <div className="space-y-4">
                  {/* 路径/URL */}
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                      {t('settings.quickNavDialog.pathLabel')}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editingNavItem?.path || ''}
                        onChange={(e) => handlePathChange(e.target.value)}
                        placeholder={t('settings.quickNavDialog.pathPlaceholder')}
                        className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none transition-colors"
                      />
                      <button
                        type="button"
                        onClick={handleBrowseFolder}
                        className="flex items-center justify-center w-10 h-10 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-400 hover:text-zinc-100 hover:border-blue-500 transition-colors"
                        title={t('settings.quickNavDialog.browseFolder')}
                      >
                        <FolderOpen size={18} />
                      </button>
                    </div>
                    {editingNavItem?.path && (
                      <p className="mt-1 text-xs text-zinc-500">
                        {t('settings.quickNavDialog.detectedAs', { type: editingNavItem.type === 'url' ? t('common.url') : t('common.folder') })}
                      </p>
                    )}
                  </div>

                  {/* 名称 */}
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                      {t('settings.quickNavDialog.nameLabel')}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editingNavItem?.name || ''}
                        onChange={(e) => setEditingNavItem(prev => prev ? { ...prev, name: e.target.value } : null)}
                        placeholder={t('settings.quickNavDialog.namePlaceholder')}
                        className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none transition-colors"
                      />
                      {/* 占位元素，保持与上方输入框宽度一致 */}
                      <div className="w-10"></div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 mt-6">
                  <button
                    onClick={() => setShowNavDialog(false)}
                    className="px-4 py-2 text-zinc-400 hover:text-zinc-100 transition-colors"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={handleSaveNavItem}
                    disabled={!editingNavItem?.name || !editingNavItem?.path}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg transition-colors font-medium"
                  >
                    {t('common.save')}
                  </button>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
    </Dialog.Root>
  );
};
