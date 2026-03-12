import React, { useState, useEffect, useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Select from '@radix-ui/react-select';
import * as Switch from '@radix-ui/react-switch';
import * as Tabs from '@radix-ui/react-tabs';
import { X, Plus, Trash2, Search, Check, ChevronDown, Globe, Folder, Edit2, FolderOpen, Languages, Compass, Plug, Wrench, Monitor, Command } from 'lucide-react';
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

interface ShellProgramOption {
  command: string;
  path: string;
  isDefault: boolean;
}

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

type SettingsTab = 'general' | 'quicknav' | 'statusline' | 'advanced';
type QuickNavSubTab = 'ide' | 'custom';
const AUTO_SHELL_OPTION_VALUE = '__auto__';

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ open, onClose }) => {
  const { language, setLanguage, t } = useI18n();
  const isWindows = window.electronAPI.platform === 'win32';
  const [ides, setIDEs] = useState<IDEConfig[]>([]);
  const [supportedIDENames, setSupportedIDENames] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [editingIDE, setEditingIDE] = useState<IDEConfig | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [availableShells, setAvailableShells] = useState<ShellProgramOption[]>([]);

  // 快捷导航状态
  const [quickNavItems, setQuickNavItems] = useState<QuickNavItem[]>([]);
  const [editingNavItem, setEditingNavItem] = useState<QuickNavItem | null>(null);
  const [showNavDialog, setShowNavDialog] = useState(false);
  const [currentTab, setCurrentTab] = useState<SettingsTab>('general');
  const [quickNavTab, setQuickNavTab] = useState<QuickNavSubTab>('ide');

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
    defaultShellProgram: '',
  });

  // tmux 兼容模式配置状态
  const [tmuxSettings, setTmuxSettings] = useState({
    enabled: true,
    autoInjectPath: true,
    enableForAllPanes: false,
  });

  // 加载设置
  useEffect(() => {
    if (!open) {
      setShowAddDialog(false);
      setShowNavDialog(false);
      setEditingIDE(null);
      setEditingNavItem(null);
      return;
    }

    loadSettings();
    loadAvailableShells();
    loadSupportedIDENames();
  }, [open]);

  const loadSettings = async () => {
    try {
      const response = await window.electronAPI.getSettings();
      if (response.success && response.data) {
        const settings = response.data;

        setIDEs(settings.ides || []);
        setQuickNavItems([...(settings.quickNav?.items || [])].sort((a: QuickNavItem, b: QuickNavItem) => a.order - b.order));
        setStatusLineConfig({
          enabled: settings.statusLine?.enabled ?? false,
          format: settings.statusLine?.format ?? 'full',
          showModel: settings.statusLine?.showModel ?? true,
          showContext: settings.statusLine?.showContext ?? true,
          showCost: settings.statusLine?.showCost ?? true,
        });
        setTerminalSettings({
          useBundledConptyDll: settings.terminal?.useBundledConptyDll ?? true,
          defaultShellProgram: settings.terminal?.defaultShellProgram ?? '',
        });
        setTmuxSettings({
          enabled: settings.tmux?.enabled ?? true,
          autoInjectPath: settings.tmux?.autoInjectPath ?? true,
          enableForAllPanes: settings.tmux?.enableForAllPanes ?? false,
        });
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

  const loadAvailableShells = async () => {
    try {
      const response = await window.electronAPI.getAvailableShells();
      if (response.success && response.data) {
        setAvailableShells(response.data);
      }
    } catch (error) {
      console.error('Failed to load available shells:', error);
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
      if (result?.success && result.data) {
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

  const handleSelectCustomShell = async () => {
    try {
      const response = await window.electronAPI.selectExecutableFile();
      if (response?.success && response.data) {
        await handleTerminalSettingsChange({ defaultShellProgram: response.data });
      }
    } catch (error) {
      console.error('Failed to select custom shell:', error);
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

  const handleSettingsOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) {
      onClose();
    }
  }, [onClose]);

  const handleAddDialogChange = useCallback((nextOpen: boolean) => {
    setShowAddDialog(nextOpen);
    if (!nextOpen) {
      setEditingIDE(null);
    }
  }, []);

  const handleNavDialogChange = useCallback((nextOpen: boolean) => {
    setShowNavDialog(nextOpen);
    if (!nextOpen) {
      setEditingNavItem(null);
    }
  }, []);

  const navigationTabs = [
    {
      value: 'general' as SettingsTab,
      label: t('settings.tab.general'),
      icon: Languages,
    },
    {
      value: 'quicknav' as SettingsTab,
      label: t('settings.tab.quickNav'),
      icon: Compass,
    },
    {
      value: 'statusline' as SettingsTab,
      label: t('settings.tab.statusLine'),
      icon: Plug,
    },
    {
      value: 'advanced' as SettingsTab,
      label: t('settings.tab.advanced'),
      icon: Wrench,
    },
  ];
  const recommendedShell = availableShells.find((shell) => shell.isDefault);
  const autoShellTarget = recommendedShell?.path ?? '';
  const detectedShellOptions = availableShells.slice();
  const currentShellValue = terminalSettings.defaultShellProgram.trim();
  const matchedShell = detectedShellOptions.find((shell) => (
    shell.path === currentShellValue || shell.command === currentShellValue
  ));
  const selectedShellOptions = currentShellValue && !matchedShell
    ? [
        {
          command: currentShellValue,
          path: currentShellValue,
          isDefault: false,
        },
        ...detectedShellOptions,
      ]
    : detectedShellOptions;
  const filteredShellOptions = autoShellTarget
    ? selectedShellOptions.filter((shell) => shell.path !== autoShellTarget)
    : selectedShellOptions;
  const effectiveSelectedShell = matchedShell?.path ?? currentShellValue;
  const selectedShellValue = !effectiveSelectedShell || effectiveSelectedShell === autoShellTarget
    ? AUTO_SHELL_OPTION_VALUE
    : effectiveSelectedShell;

  return (
    <Dialog.Root open={open} onOpenChange={handleSettingsOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-sm animate-fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[9999] flex h-[72vh] w-[94vw] max-h-[720px] max-w-6xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[28px] border border-[rgb(var(--border))] bg-[rgb(var(--background))] shadow-2xl animate-scale-in">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(168,170,88,0.16),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(84,72,31,0.18),_transparent_32%)]" />

          <div className="relative flex items-center justify-between border-b border-[rgb(var(--border))] px-8 py-4">
            <div>
              <Dialog.Title className="text-2xl font-semibold text-white">
                {t('settings.title')}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-[rgb(var(--muted-foreground))]">
                {t('settings.panelDescription')}
              </Dialog.Description>
            </div>

            <Dialog.Close asChild>
              <button className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] text-[rgb(var(--muted-foreground))] transition-colors hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--primary))]">
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          <Tabs.Root value={currentTab} onValueChange={(value) => setCurrentTab(value as SettingsTab)} className="relative flex min-h-0 flex-1 overflow-hidden">
            <aside className="flex w-[168px] flex-col border-r border-[rgb(var(--border))] bg-[rgb(var(--sidebar))]">
              <Tabs.List className="flex flex-1 flex-col gap-1.5 p-2.5">
                {navigationTabs.map(({ value, label, icon: Icon }) => (
                  <Tabs.Trigger
                    key={value}
                    value={value}
                    className="group rounded-xl border border-transparent bg-transparent px-3 py-2 text-left transition-colors hover:bg-[rgb(var(--accent))] data-[state=active]:border-[rgb(var(--border))] data-[state=active]:bg-[rgb(var(--accent))]"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--secondary))] text-[rgb(var(--muted-foreground))] transition-colors group-data-[state=active]:bg-[rgb(var(--card))] group-data-[state=active]:text-[rgb(var(--primary))]">
                        <Icon size={16} />
                      </div>
                      <div className="min-w-0 text-sm font-semibold text-[rgb(var(--foreground))] group-data-[state=active]:text-[rgb(var(--primary))]">{label}</div>
                    </div>
                  </Tabs.Trigger>
                ))}
              </Tabs.List>
            </aside>

            <div className="flex-1 overflow-hidden bg-[rgb(var(--background))]">
              <Tabs.Content value="general" className="h-full overflow-y-auto px-8 py-8 data-[state=inactive]:hidden">
                <div className="mx-auto max-w-3xl space-y-6">
                  <section className="rounded-[24px] border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.24)]">
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgb(var(--accent))] text-[rgb(var(--primary))]">
                        <Languages size={22} />
                      </div>
                      <div className="flex-1">
                        <div className="mb-5">
                          <h3 className="text-base font-semibold text-white">{t('settings.general.languageTitle')}</h3>
                          <p className="mt-2 text-sm leading-6 text-[rgb(var(--muted-foreground))]">{t('settings.general.languageDescription')}</p>
                        </div>

                        <Select.Root value={language} onValueChange={handleLanguageChange}>
                          <Select.Trigger className="flex w-full items-center justify-between rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-4 py-3 text-left text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--accent))] focus:outline-none focus:border-[rgb(var(--ring))]">
                            <Select.Value />
                            <Select.Icon>
                              <ChevronDown size={16} className="text-[rgb(var(--muted-foreground))]" />
                            </Select.Icon>
                          </Select.Trigger>

                          <Select.Portal>
                            <Select.Content
                              position="popper"
                              side="bottom"
                              align="start"
                              sideOffset={6}
                              className="z-[10000] w-[var(--radix-select-trigger-width)] overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] shadow-2xl"
                            >
                              <Select.Viewport className="p-1">
                                <Select.Item value="zh-CN" className="cursor-pointer rounded-xl px-3 py-2 text-[rgb(var(--foreground))] outline-none transition-colors hover:bg-[rgb(var(--accent))]">
                                  <Select.ItemText>{t('settings.language.zhCN')}</Select.ItemText>
                                </Select.Item>
                                <Select.Item value="en-US" className="cursor-pointer rounded-xl px-3 py-2 text-[rgb(var(--foreground))] outline-none transition-colors hover:bg-[rgb(var(--accent))]">
                                  <Select.ItemText>{t('settings.language.enUS')}</Select.ItemText>
                                </Select.Item>
                              </Select.Viewport>
                            </Select.Content>
                          </Select.Portal>
                        </Select.Root>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-[24px] border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.24)]">
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgb(var(--accent))] text-[rgb(var(--primary))]">
                        <Command size={22} />
                      </div>
                      <div className="flex-1">
                        <div className="mb-5">
                          <h3 className="text-base font-semibold text-white">{t('settings.general.defaultShellTitle')}</h3>
                          <p className="mt-2 text-sm leading-6 text-[rgb(var(--muted-foreground))]">{t('settings.general.defaultShellDescription')}</p>
                        </div>

                        <label htmlFor="default-shell-program" className="mb-2 block text-sm font-medium text-[rgb(var(--foreground))]">
                          {t('settings.general.defaultShellLabel')}
                        </label>
                        <div className="flex flex-col gap-3 md:flex-row md:items-start">
                          <div className="flex-1">
                            <Select.Root
                              value={selectedShellValue}
                              onValueChange={(value) => handleTerminalSettingsChange({
                                defaultShellProgram: value === AUTO_SHELL_OPTION_VALUE ? '' : value,
                              })}
                            >
                              <Select.Trigger
                                id="default-shell-program"
                                className="flex w-full items-center justify-between rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-4 py-3 text-left text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--accent))] focus:outline-none focus:border-[rgb(var(--ring))]"
                              >
                                <Select.Value placeholder={t('settings.general.defaultShellPlaceholder')} />
                                <Select.Icon>
                                  <ChevronDown size={16} className="text-[rgb(var(--muted-foreground))]" />
                                </Select.Icon>
                              </Select.Trigger>

                              <Select.Portal>
                                <Select.Content
                                  position="popper"
                                  side="bottom"
                                  align="start"
                                  sideOffset={6}
                                  className="z-[10000] w-[var(--radix-select-trigger-width)] overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] shadow-2xl"
                                >
                                  <Select.Viewport className="p-1">
                                    <Select.Item value={AUTO_SHELL_OPTION_VALUE} className="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-[rgb(var(--foreground))] outline-none transition-colors hover:bg-[rgb(var(--accent))]">
                                      <Select.ItemText>
                                        {autoShellTarget
                                          ? t('settings.general.defaultShellAutoOption', { shell: autoShellTarget })
                                          : t('settings.general.defaultShellAutoFallback')}
                                      </Select.ItemText>
                                      <Select.ItemIndicator>
                                        <Check size={14} />
                                      </Select.ItemIndicator>
                                    </Select.Item>
                                    {filteredShellOptions.map((shell) => (
                                      <Select.Item
                                        key={shell.path}
                                        value={shell.path}
                                        className="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-[rgb(var(--foreground))] outline-none transition-colors hover:bg-[rgb(var(--accent))]"
                                      >
                                        <Select.ItemText>
                                          {shell.path}
                                        </Select.ItemText>
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

                          <button
                            type="button"
                            onClick={handleSelectCustomShell}
                            className="inline-flex h-[50px] items-center justify-center rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-4 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--primary))] md:mt-[30px]"
                          >
                            {t('settings.general.defaultShellCustomButton')}
                          </button>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-[rgb(var(--muted-foreground))]">{t('settings.general.defaultShellHint')}</p>
                      </div>
                    </div>
                  </section>
                </div>
              </Tabs.Content>

              <Tabs.Content value="quicknav" className="h-full overflow-y-auto px-8 py-8 data-[state=inactive]:hidden">
                <div className="mx-auto max-w-5xl space-y-6">
                  <Tabs.Root value={quickNavTab} onValueChange={(value) => setQuickNavTab(value as QuickNavSubTab)} className="space-y-6">
                    <Tabs.List className="inline-flex rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-1">
                      <Tabs.Trigger
                        value="ide"
                        className="rounded-xl px-4 py-2 text-sm font-medium text-[rgb(var(--muted-foreground))] transition-colors hover:text-white data-[state=active]:bg-[rgb(var(--accent))] data-[state=active]:text-[rgb(var(--primary))]"
                      >
                        {t('settings.quickNav.ideTab')}
                      </Tabs.Trigger>
                      <Tabs.Trigger
                        value="custom"
                        className="rounded-xl px-4 py-2 text-sm font-medium text-[rgb(var(--muted-foreground))] transition-colors hover:text-white data-[state=active]:bg-[rgb(var(--accent))] data-[state=active]:text-[rgb(var(--primary))]"
                      >
                        {t('settings.quickNav.customTab')}
                      </Tabs.Trigger>
                    </Tabs.List>

                    <Tabs.Content value="ide" className="space-y-4 data-[state=inactive]:hidden">
                      <div className="rounded-[24px] border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <p className="max-w-2xl text-sm leading-6 text-[rgb(var(--muted-foreground))]">{t('settings.quickNav.ideDescription')}</p>
                          </div>

                          <div className="flex flex-wrap gap-3">
                            <button
                              onClick={handleScanAll}
                              disabled={scanning}
                              className="inline-flex items-center gap-2 rounded-2xl bg-[rgb(var(--primary))] px-4 py-3 text-sm font-medium text-[rgb(var(--primary-foreground))] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-[rgb(var(--muted))] disabled:text-[rgb(var(--muted-foreground))]"
                            >
                              <Search size={16} />
                              {scanning ? t('common.loading') : t('settings.ide.scan')}
                            </button>
                            <button
                              onClick={handleAddIDE}
                              className="inline-flex items-center gap-2 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-4 py-3 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--primary))]"
                            >
                              <Plus size={16} />
                              {t('settings.ide.addCustom')}
                            </button>
                          </div>
                        </div>
                      </div>

                      {ides.length === 0 ? (
                        <div className="rounded-[24px] border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--secondary))]/40 px-6 py-16 text-center">
                          <Monitor size={40} className="mx-auto text-[rgb(var(--muted-foreground))] opacity-50" />
                          <p className="mt-5 text-lg font-medium text-[rgb(var(--foreground))]">{t('settings.ide.emptyTitle')}</p>
                          <p className="mt-2 text-sm text-[rgb(var(--muted-foreground))]">{t('settings.ide.emptyDescription')}</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {ides.map((ide) => (
                            <div
                              key={ide.id}
                              className="rounded-[24px] border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-5 transition-colors hover:border-[rgb(var(--primary))]"
                            >
                              <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                                <div className="flex min-w-0 flex-1 items-center gap-4">
                                  <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--secondary))]">
                                    <IDEIcon icon={ide.icon || ''} size={30} className="text-[rgb(var(--foreground))]" />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <h3 className="text-base font-semibold text-white">{ide.name}</h3>
                                      {ide.path && (
                                        <span className="rounded-full border border-[rgba(168,170,88,0.20)] bg-[rgba(168,170,88,0.10)] px-2 py-0.5 text-[11px] font-medium text-[rgb(var(--primary))]">
                                          {t('settings.ide.found')}
                                        </span>
                                      )}
                                    </div>
                                    <p className="mt-2 text-sm text-[rgb(var(--muted-foreground))]">{t('settings.ide.commandPrefix', { command: ide.command })}</p>
                                    {ide.path && (
                                      <p className="mt-1 truncate text-xs text-[rgb(var(--muted-foreground))]" title={ide.path}>
                                        {ide.path}
                                      </p>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center justify-end gap-3">
                                  <Switch.Root
                                    checked={ide.enabled}
                                    onCheckedChange={(checked) => handleToggleIDE(ide.id, checked)}
                                    className="relative h-7 w-12 rounded-full bg-[rgb(var(--muted))] transition-colors data-[state=checked]:bg-[rgb(var(--primary))]"
                                  >
                                    <Switch.Thumb className="block h-6 w-6 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-[22px]" />
                                  </Switch.Root>
                                  <button
                                    onClick={() => {
                                      setEditingIDE(ide);
                                      setShowAddDialog(true);
                                    }}
                                    className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] text-[rgb(var(--muted-foreground))] transition-colors hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--primary))]"
                                    title={t('common.edit')}
                                  >
                                    <Edit2 size={16} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteIDE(ide.id)}
                                    className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[rgba(255,92,92,0.14)] bg-[rgba(255,92,92,0.08)] text-[rgb(var(--muted-foreground))] transition-colors hover:border-[rgba(255,92,92,0.34)] hover:bg-[rgba(255,92,92,0.14)] hover:text-[rgb(255,214,214)]"
                                    title={t('common.delete')}
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </Tabs.Content>

                    <Tabs.Content value="custom" className="space-y-4 data-[state=inactive]:hidden">
                      <div className="rounded-[24px] border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <p className="max-w-2xl text-sm leading-6 text-[rgb(var(--muted-foreground))]">{t('settings.quickNav.customDescription')}</p>
                          </div>

                          <button
                            onClick={handleAddNavItem}
                            className="inline-flex items-center gap-2 rounded-2xl bg-[rgb(var(--primary))] px-4 py-3 text-sm font-medium text-[rgb(var(--primary-foreground))] transition-opacity hover:opacity-90"
                          >
                            <Plus size={16} />
                            {t('settings.quickNav.add')}
                          </button>
                        </div>
                      </div>

                      {quickNavItems.length === 0 ? (
                        <div className="rounded-[24px] border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--secondary))]/40 px-6 py-16 text-center">
                          <Globe size={40} className="mx-auto text-[rgb(var(--muted-foreground))] opacity-50" />
                          <p className="mt-5 text-lg font-medium text-[rgb(var(--foreground))]">{t('settings.quickNav.emptyTitle')}</p>
                          <p className="mt-2 text-sm text-[rgb(var(--muted-foreground))]">{t('settings.quickNav.emptyDescription')}</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {quickNavItems.map((item) => (
                            <div
                              key={item.id}
                              className="rounded-[24px] border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-5 transition-colors hover:border-[rgb(var(--primary))]"
                            >
                              <div className="flex flex-col gap-4 md:flex-row md:items-center">
                                <div className="flex min-w-0 flex-1 items-center gap-4">
                                  <div className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl border ${
                                    item.type === 'url'
                                      ? 'border-[rgb(var(--border))] bg-[rgb(var(--accent))] text-[rgb(var(--primary))]'
                                      : 'border-[rgb(var(--border))] bg-[rgb(var(--accent))] text-[rgb(var(--primary))]'
                                  }`}>
                                    {item.type === 'url' ? <Globe size={22} /> : <Folder size={22} />}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <h3 className="text-base font-semibold text-white">{item.name}</h3>
                                      <span className="rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-2 py-0.5 text-[11px] font-medium text-[rgb(var(--muted-foreground))]">
                                        {item.type === 'url' ? t('common.url') : t('common.folder')}
                                      </span>
                                    </div>
                                    <p className="mt-2 truncate text-sm text-[rgb(var(--muted-foreground))]" title={item.path}>
                                      {item.path}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-center justify-end gap-3">
                                  <button
                                    onClick={() => handleEditNavItem(item)}
                                    className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] text-[rgb(var(--muted-foreground))] transition-colors hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--primary))]"
                                    title={t('common.edit')}
                                  >
                                    <Edit2 size={16} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteNavItem(item.id)}
                                    className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[rgba(255,92,92,0.14)] bg-[rgba(255,92,92,0.08)] text-[rgb(var(--muted-foreground))] transition-colors hover:border-[rgba(255,92,92,0.34)] hover:bg-[rgba(255,92,92,0.14)] hover:text-[rgb(255,214,214)]"
                                    title={t('common.delete')}
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </Tabs.Content>
                  </Tabs.Root>
                </div>
              </Tabs.Content>

              <Tabs.Content value="statusline" className="h-full overflow-y-auto px-8 py-8 data-[state=inactive]:hidden">
                <div className="mx-auto max-w-5xl space-y-6">
                  <section className="rounded-[24px] border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6">
                    <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                      <div className="flex items-start gap-4">
                        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-[rgb(var(--accent))] text-[rgb(var(--primary))]">
                          <Plug size={22} />
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-semibold text-white">{t('settings.statusLine.pluginName')}</h3>
                            <span className="rounded-full border border-[rgba(168,170,88,0.20)] bg-[rgba(168,170,88,0.10)] px-2 py-0.5 text-[11px] font-medium text-[rgb(var(--primary))]">
                              {t('settings.statusLine.builtInBadge')}
                            </span>
                          </div>
                          <p className="mt-2 max-w-2xl text-sm leading-6 text-[rgb(var(--muted-foreground))]">{t('settings.statusLine.pageDescription')}</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-4 rounded-[24px] border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-5 py-4 xl:min-w-[296px]">
                        <div>
                          <div className="text-sm font-medium text-white">{t('settings.statusLine.enableTitle')}</div>
                          <div className="mt-1 text-xs text-[rgb(var(--muted-foreground))]">{t('settings.statusLine.enableDescription')}</div>
                        </div>
                        <Switch.Root
                          checked={statusLineConfig.enabled}
                          onCheckedChange={handleToggleStatusLine}
                          className="relative h-7 w-12 rounded-full bg-[rgb(var(--muted))] transition-colors data-[state=checked]:bg-[rgb(var(--primary))]"
                        >
                          <Switch.Thumb className="block h-6 w-6 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-[22px]" />
                        </Switch.Root>
                      </div>
                    </div>
                  </section>

                  {statusLineConfig.enabled ? (
                    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                      <div className="rounded-[24px] border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6">
                        <h3 className="text-base font-semibold text-white">{t('settings.statusLine.displayFormat')}</h3>
                        <p className="mt-2 text-sm leading-6 text-[rgb(var(--muted-foreground))]">{t('settings.statusLine.enableDescription')}</p>

                        <div className="mt-5 space-y-3">
                          <label className="flex cursor-pointer items-start gap-4 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] p-4 transition-colors hover:bg-[rgb(var(--accent))]">
                            <input
                              type="radio"
                              name="format"
                              value="full"
                              checked={statusLineConfig.format === 'full'}
                              onChange={() => handleStatusLineConfigChange({ format: 'full' })}
                              className="mt-1 h-4 w-4 text-[rgb(var(--primary))]"
                            />
                            <div className="flex-1">
                              <div className="text-sm font-medium text-white">{t('settings.statusLine.full')}</div>
                              <div className="mt-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 font-mono text-xs text-[rgb(var(--muted-foreground))]">
                                Model: Sonnet 4.6 | Context: 45% | Cost: $0.25
                              </div>
                            </div>
                          </label>

                          <label className="flex cursor-pointer items-start gap-4 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] p-4 transition-colors hover:bg-[rgb(var(--accent))]">
                            <input
                              type="radio"
                              name="format"
                              value="compact"
                              checked={statusLineConfig.format === 'compact'}
                              onChange={() => handleStatusLineConfigChange({ format: 'compact' })}
                              className="mt-1 h-4 w-4 text-[rgb(var(--primary))]"
                            />
                            <div className="flex-1">
                              <div className="text-sm font-medium text-white">{t('settings.statusLine.compact')}</div>
                              <div className="mt-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 font-mono text-xs text-[rgb(var(--muted-foreground))]">
                                Sonnet 4.6 • 45% • $0.25
                              </div>
                            </div>
                          </label>
                        </div>
                      </div>

                      <div className="space-y-6">
                        <div className="rounded-[24px] border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6">
                          <h3 className="text-base font-semibold text-white">{t('settings.statusLine.displayContent')}</h3>
                          <div className="mt-5 space-y-3">
                            <label className="flex items-center gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] p-4">
                              <input
                                type="checkbox"
                                checked={statusLineConfig.showModel}
                                className="h-4 w-4 text-[rgb(var(--primary))]"
                                disabled
                              />
                              <div>
                                <div className="text-sm font-medium text-white">{t('settings.statusLine.modelName')}</div>
                                <div className="mt-1 text-xs text-[rgb(var(--muted-foreground))]">{t('settings.statusLine.required')}</div>
                              </div>
                            </label>

                            <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] p-4 transition-colors hover:bg-[rgb(var(--accent))]">
                              <input
                                type="checkbox"
                                checked={statusLineConfig.showContext}
                                onChange={(event) => handleStatusLineConfigChange({ showContext: event.target.checked })}
                                className="h-4 w-4 text-[rgb(var(--primary))]"
                              />
                              <div>
                                <div className="text-sm font-medium text-white">{t('settings.statusLine.contextPercentage')}</div>
                                <div className="mt-1 text-xs text-[rgb(var(--muted-foreground))]">{t('settings.statusLine.contextExample')}</div>
                              </div>
                            </label>

                            <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] p-4 transition-colors hover:bg-[rgb(var(--accent))]">
                              <input
                                type="checkbox"
                                checked={statusLineConfig.showCost}
                                onChange={(event) => handleStatusLineConfigChange({ showCost: event.target.checked })}
                                className="h-4 w-4 text-[rgb(var(--primary))]"
                              />
                              <div>
                                <div className="text-sm font-medium text-white">{t('settings.statusLine.cost')}</div>
                                <div className="mt-1 text-xs text-[rgb(var(--muted-foreground))]">{t('settings.statusLine.costExample')}</div>
                              </div>
                            </label>
                          </div>
                        </div>

                        <div className="rounded-[28px] border border-[rgba(168,170,88,0.24)] bg-[rgba(168,170,88,0.10)] p-5">
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[rgb(var(--primary))] text-[rgb(var(--primary-foreground))]">
                              <Check size={14} />
                            </div>
                            <div>
                              <div className="text-sm font-medium text-[rgb(var(--primary))]">{t('settings.statusLine.savedTitle')}</div>
                              <div className="mt-1 text-xs leading-5 text-[rgb(var(--muted-foreground))]">{t('settings.statusLine.savedDescription')}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-[24px] border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--secondary))]/40 px-6 py-14 text-center">
                      <Plug size={40} className="mx-auto text-[rgb(var(--muted-foreground))] opacity-50" />
                      <p className="mt-5 text-lg font-medium text-[rgb(var(--foreground))]">{t('settings.statusLine.enableTitle')}</p>
                      <p className="mt-2 text-sm text-[rgb(var(--muted-foreground))]">{t('settings.statusLine.enableDescription')}</p>
                    </div>
                  )}
                </div>
              </Tabs.Content>

              <Tabs.Content value="advanced" className="h-full overflow-y-auto px-8 py-8 data-[state=inactive]:hidden">
                <div className="mx-auto max-w-5xl space-y-6">
                  <section className="rounded-[24px] border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6">
                    {isWindows ? (
                      <div className="rounded-[24px] border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] p-5">
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                          <div className="flex items-start gap-4">
                            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-[rgb(var(--accent))] text-[rgb(var(--primary))]">
                              <Wrench size={20} />
                            </div>
                            <div>
                              <h4 className="text-base font-semibold text-white">{t('settings.general.bundledConptyTitle')}</h4>
                              <p className="mt-2 max-w-3xl text-sm leading-6 text-[rgb(var(--muted-foreground))]">{t('settings.general.bundledConptyDescription')}</p>
                            </div>
                          </div>

                          <Switch.Root
                            checked={terminalSettings.useBundledConptyDll}
                            onCheckedChange={(checked) => handleTerminalSettingsChange({ useBundledConptyDll: checked })}
                            className="relative h-7 w-12 flex-shrink-0 rounded-full bg-[rgb(var(--muted))] transition-colors data-[state=checked]:bg-[rgb(var(--primary))]"
                          >
                            <Switch.Thumb className="block h-6 w-6 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-[22px]" />
                          </Switch.Root>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-[24px] border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--secondary))]/40 p-5">
                        <div className="flex items-start gap-4">
                          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgb(var(--secondary))] text-[rgb(var(--muted-foreground))]">
                            <Monitor size={20} />
                          </div>
                          <div>
                            <div className="text-base font-semibold text-white">{t('settings.advanced.windowsOnlyTitle')}</div>
                            <p className="mt-2 text-sm leading-6 text-[rgb(var(--muted-foreground))]">{t('settings.advanced.windowsOnlyDescription')}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </section>

                  <section className="rounded-[24px] border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6">
                    <div className="mb-5 flex items-start gap-4">
                      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-[rgb(var(--accent))] text-[rgb(var(--primary))]">
                        <Command size={20} />
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-white">{t('settings.advanced.tmuxSection')}</h3>
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-[rgb(var(--muted-foreground))]">{t('settings.advanced.tmuxDescription')}</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-[24px] border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] p-5">
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                          <div className="flex items-start gap-4">
                            <div>
                              <h4 className="text-base font-semibold text-white">{t('settings.tmux.enableTitle')}</h4>
                              <p className="mt-2 text-sm leading-6 text-[rgb(var(--muted-foreground))]">{t('settings.tmux.enableDescription')}</p>
                            </div>
                          </div>

                          <Switch.Root
                            checked={tmuxSettings.enabled}
                            onCheckedChange={(checked) => handleTmuxSettingsChange({ enabled: checked })}
                            className="relative h-7 w-12 flex-shrink-0 rounded-full bg-[rgb(var(--muted))] transition-colors data-[state=checked]:bg-[rgb(var(--primary))]"
                          >
                            <Switch.Thumb className="block h-6 w-6 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-[22px]" />
                          </Switch.Root>
                        </div>
                      </div>

                      <div className={`rounded-[24px] border border-[rgba(168,170,88,0.24)] bg-[rgba(168,170,88,0.10)] p-5 ${!tmuxSettings.enabled ? 'opacity-50' : ''}`}>
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[rgb(var(--primary))] text-[rgb(var(--primary-foreground))]">
                            <Check size={14} />
                          </div>
                          <div>
                            <div className="text-sm font-medium text-[rgb(var(--primary))]">{t('settings.tmux.agentTeamsEnvTitle')}</div>
                            <div className="mt-1 text-xs leading-5 text-[rgb(var(--muted-foreground))]">{t('settings.tmux.agentTeamsEnvDescription')}</div>
                            <code className="mt-3 inline-flex rounded-xl border border-[rgba(168,170,88,0.24)] bg-[rgba(12,12,10,0.45)] px-3 py-1.5 text-xs text-[rgb(var(--foreground))]">
                              CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
                            </code>
                          </div>
                        </div>
                      </div>

                      <div className={`grid gap-4 lg:grid-cols-2 ${!tmuxSettings.enabled ? 'opacity-50' : ''}`}>
                        <div className="rounded-[24px] border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] p-5">
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <h4 className="text-base font-semibold text-white">{t('settings.tmux.autoInjectPathTitle')}</h4>
                              <p className="mt-2 text-sm leading-6 text-[rgb(var(--muted-foreground))]">{t('settings.tmux.autoInjectPathDescription')}</p>
                            </div>
                            <Switch.Root
                              checked={tmuxSettings.autoInjectPath}
                              disabled={!tmuxSettings.enabled}
                              onCheckedChange={(checked) => handleTmuxSettingsChange({ autoInjectPath: checked })}
                              className="relative h-7 w-12 flex-shrink-0 rounded-full bg-[rgb(var(--muted))] transition-colors data-[state=checked]:bg-[rgb(var(--primary))] disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              <Switch.Thumb className="block h-6 w-6 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-[22px]" />
                            </Switch.Root>
                          </div>
                        </div>

                        <div className="rounded-[24px] border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] p-5">
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <h4 className="text-base font-semibold text-white">{t('settings.tmux.enableForAllPanesTitle')}</h4>
                              <p className="mt-2 text-sm leading-6 text-[rgb(var(--muted-foreground))]">{t('settings.tmux.enableForAllPanesDescription')}</p>
                            </div>
                            <Switch.Root
                              checked={tmuxSettings.enableForAllPanes}
                              disabled={!tmuxSettings.enabled}
                              onCheckedChange={(checked) => handleTmuxSettingsChange({ enableForAllPanes: checked })}
                              className="relative h-7 w-12 flex-shrink-0 rounded-full bg-[rgb(var(--muted))] transition-colors data-[state=checked]:bg-[rgb(var(--primary))] disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              <Switch.Thumb className="block h-6 w-6 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-[22px]" />
                            </Switch.Root>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              </Tabs.Content>
            </div>
          </Tabs.Root>
        </Dialog.Content>
      </Dialog.Portal>

      <Dialog.Root open={showAddDialog} onOpenChange={handleAddDialogChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[70] w-[92vw] max-w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-[28px] border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6 shadow-2xl">
            <Dialog.Title className="text-xl font-semibold text-white">
              {editingIDE?.id ? t('settings.ideDialog.editTitle') : t('settings.ideDialog.addTitle')}
            </Dialog.Title>

            <div className="mt-6 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-[rgb(var(--foreground))]">{t('settings.ideDialog.nameLabel')}</label>
                <Select.Root
                  value={editingIDE?.name || ''}
                  onValueChange={(value) => {
                    setEditingIDE((prev) => (prev ? { ...prev, name: value } : null));
                    handleScanSpecific(value);
                  }}
                >
                  <Select.Trigger className="flex w-full items-center justify-between rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-4 py-3 text-left text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--accent))]">
                    <Select.Value placeholder={t('settings.ideDialog.namePlaceholder')} />
                    <Select.Icon>
                      <ChevronDown size={16} />
                    </Select.Icon>
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Content className="z-[10000] overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] shadow-2xl">
                      <Select.Viewport className="p-1">
                        {supportedIDENames.map((name) => (
                          <Select.Item
                            key={name}
                            value={name}
                            className="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none transition-colors hover:bg-[rgb(var(--accent))]"
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

              <div>
                <label className="mb-2 block text-sm font-medium text-[rgb(var(--foreground))]">{t('settings.ideDialog.commandLabel')}</label>
                <input
                  type="text"
                  value={editingIDE?.command || ''}
                  onChange={(event) => setEditingIDE((prev) => (prev ? { ...prev, command: event.target.value } : null))}
                  placeholder={t('settings.ideDialog.commandPlaceholder')}
                  className="w-full rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-4 py-3 text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--muted-foreground))] focus:border-[rgb(var(--ring))] focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-[rgb(var(--foreground))]">{t('settings.ideDialog.pathLabel')}</label>
                <input
                  type="text"
                  value={editingIDE?.path || ''}
                  onChange={(event) => setEditingIDE((prev) => (prev ? { ...prev, path: event.target.value } : null))}
                  placeholder={t('settings.ideDialog.pathPlaceholder')}
                  className="w-full rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-4 py-3 text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--muted-foreground))] focus:border-[rgb(var(--ring))] focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => handleAddDialogChange(false)}
                className="rounded-2xl px-4 py-2 text-[rgb(var(--muted-foreground))] transition-colors hover:text-white"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSaveIDE}
                disabled={!editingIDE?.name || !editingIDE?.command}
                className="rounded-2xl bg-[rgb(var(--primary))] px-4 py-2 font-medium text-[rgb(var(--primary-foreground))] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-[rgb(var(--muted))] disabled:text-[rgb(var(--muted-foreground))]"
              >
                {t('common.save')}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={showNavDialog} onOpenChange={handleNavDialogChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[70] w-[92vw] max-w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-[28px] border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6 shadow-2xl">
            <Dialog.Title className="text-xl font-semibold text-white">
              {editingNavItem?.id && quickNavItems.find((item) => item.id === editingNavItem.id)
                ? t('settings.quickNavDialog.editTitle')
                : t('settings.quickNavDialog.addTitle')}
            </Dialog.Title>

            <div className="mt-6 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-[rgb(var(--foreground))]">{t('settings.quickNavDialog.pathLabel')}</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editingNavItem?.path || ''}
                    onChange={(event) => handlePathChange(event.target.value)}
                    placeholder={t('settings.quickNavDialog.pathPlaceholder')}
                    className="flex-1 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-4 py-3 text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--muted-foreground))] focus:border-[rgb(var(--ring))] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleBrowseFolder}
                    className="flex h-[50px] w-[50px] items-center justify-center rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] text-[rgb(var(--muted-foreground))] transition-colors hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--primary))]"
                    title={t('settings.quickNavDialog.browseFolder')}
                  >
                    <FolderOpen size={18} />
                  </button>
                </div>
                {editingNavItem?.path && (
                  <p className="mt-2 text-xs text-[rgb(var(--muted-foreground))]">
                    {t('settings.quickNavDialog.detectedAs', {
                      type: editingNavItem.type === 'url' ? t('common.url') : t('common.folder'),
                    })}
                  </p>
                )}
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-[rgb(var(--foreground))]">{t('settings.quickNavDialog.nameLabel')}</label>
                <input
                  type="text"
                  value={editingNavItem?.name || ''}
                  onChange={(event) => setEditingNavItem((prev) => (prev ? { ...prev, name: event.target.value } : null))}
                  placeholder={t('settings.quickNavDialog.namePlaceholder')}
                  className="w-full rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-4 py-3 text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--muted-foreground))] focus:border-[rgb(var(--ring))] focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => handleNavDialogChange(false)}
                className="rounded-2xl px-4 py-2 text-[rgb(var(--muted-foreground))] transition-colors hover:text-white"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSaveNavItem}
                disabled={!editingNavItem?.name || !editingNavItem?.path}
                className="rounded-2xl bg-[rgb(var(--primary))] px-4 py-2 font-medium text-[rgb(var(--primary-foreground))] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-[rgb(var(--muted))] disabled:text-[rgb(var(--muted-foreground))]"
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
