import React, { useState, useEffect, useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Select from '@radix-ui/react-select';
import * as Switch from '@radix-ui/react-switch';
import * as Tabs from '@radix-ui/react-tabs';
import { X, Plus, Trash2, Search, Check, ChevronDown, Globe, Folder, Edit2, FolderOpen, Languages, Compass, Plug, Wrench, Monitor, Command, Palette, Wallpaper, SunMoon } from 'lucide-react';
import { IDEIcon } from './icons/IDEIcons';
import { notifyIDESettingsUpdated } from '../hooks/useIDESettings';
import { notifyWorkspaceSettingsUpdated } from '../utils/settingsEvents';
import { notifyTerminalSettingsUpdated } from '../utils/terminalSettingsEvents';
import { QuickNavItem } from '../../shared/types/quick-nav';
import { FeatureSettings, IDEConfig, StatusLineConfig } from '../../shared/types/workspace';
import { KnownHostEntry } from '../../shared/types/ssh';
import type { AppearanceReadabilityMode, AppearanceSettings, AppearanceSkinMotionMode, AppearanceThemeId } from '../../shared/types/appearance';
import { DEFAULT_APPEARANCE_SETTINGS, normalizeAppearanceSettings } from '../../shared/utils/appearance';
import { useI18n } from '../i18n';
import type { TranslationKey } from '../i18n';
import { AppLanguage } from '../../shared/i18n';
import { ChatSettingsTab } from './ChatSettingsTab';
import { PluginCenter } from './settings/PluginCenter';
import { applyAppearanceToDocument, getAppearanceBackdropDescriptor, getAppearanceSkinStyle } from '../utils/appearance';

interface ShellProgramOption {
  command: string;
  path: string;
  isDefault: boolean;
}

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

type SettingsTab = 'general' | 'appearance' | 'quicknav' | 'chat' | 'plugins' | 'advanced';
type QuickNavSubTab = 'ide' | 'custom';
const AUTO_SHELL_OPTION_VALUE = '__auto__';
const DEFAULT_STATUSLINE_CONFIG: StatusLineConfig = {
  enabled: false,
  displayLocation: 'both',
  cliFormat: 'full',
  cardFormat: 'compact',
  showModel: true,
  showContext: true,
  showCost: true,
  showTime: false,
  showTokens: false,
};
const DEFAULT_FEATURE_SETTINGS: FeatureSettings = {
  sshEnabled: true,
};

const APPEARANCE_OPACITY_OPTIONS = [0.72, 0.82, 0.88, 0.94];
const APPEARANCE_SKIN_DIM_OPTIONS = [0.28, 0.42, 0.52, 0.64, 0.76];
const APPEARANCE_SKIN_BLUR_OPTIONS = [0, 6, 12, 18];
const APPEARANCE_SKIN_MOTION_MODES: AppearanceSkinMotionMode[] = ['none', 'ambient'];

const APPEARANCE_THEME_PRESETS: Array<{
  id: AppearanceThemeId;
  preview: string;
}> = [
  {
    id: 'obsidian',
    preview: 'linear-gradient(135deg, #0b0d11 0%, #1b1f27 58%, #090b0e 100%)',
  },
  {
    id: 'aurora',
    preview: 'linear-gradient(135deg, #05151a 0%, #0d3940 52%, #082228 100%)',
  },
  {
    id: 'paper',
    preview: 'linear-gradient(135deg, #f4ecde 0%, #e2d8c3 58%, #f7f1e8 100%)',
  },
];

const APPEARANCE_SKIN_PRESETS: Array<{
  id: string;
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
  preview: string;
  skin: AppearanceSettings['skin'];
}> = [
  {
    id: 'none',
    labelKey: 'settings.appearance.skin.none',
    descriptionKey: 'settings.appearance.skin.noneDescription',
    preview: 'linear-gradient(135deg, rgba(120, 120, 120, 0.16) 0%, rgba(120, 120, 120, 0.04) 100%)',
    skin: {
      presetId: 'none',
      kind: 'none',
      gradient: DEFAULT_APPEARANCE_SETTINGS.skin.gradient,
      dim: 0.62,
      blur: 0,
      motion: 'none',
    },
  },
  {
    id: 'midnight',
    labelKey: 'settings.appearance.skin.midnight',
    descriptionKey: 'settings.appearance.skin.midnightDescription',
    preview: 'radial-gradient(circle at 18% 18%, rgba(86, 130, 255, 0.38), transparent 30%), radial-gradient(circle at 82% 22%, rgba(244, 158, 73, 0.24), transparent 28%), linear-gradient(135deg, #05070a 0%, #111317 52%, #060607 100%)',
    skin: {
      presetId: 'midnight',
      kind: 'gradient',
      gradient: 'radial-gradient(circle at 15% 12%, rgba(57, 114, 255, 0.30), transparent 28%), radial-gradient(circle at 82% 18%, rgba(245, 158, 11, 0.18), transparent 24%), linear-gradient(135deg, #05070a 0%, #111317 48%, #060607 100%)',
      dim: 0.52,
      blur: 0,
      motion: 'ambient',
    },
  },
  {
    id: 'aurora',
    labelKey: 'settings.appearance.skin.aurora',
    descriptionKey: 'settings.appearance.skin.auroraDescription',
    preview: 'radial-gradient(circle at 22% 18%, rgba(78, 244, 207, 0.32), transparent 28%), radial-gradient(circle at 78% 16%, rgba(103, 164, 255, 0.22), transparent 30%), linear-gradient(140deg, #041417 0%, #0b2c31 54%, #07191d 100%)',
    skin: {
      presetId: 'aurora',
      kind: 'gradient',
      gradient: 'radial-gradient(circle at 22% 18%, rgba(78, 244, 207, 0.22), transparent 28%), radial-gradient(circle at 78% 16%, rgba(103, 164, 255, 0.16), transparent 30%), linear-gradient(140deg, #041417 0%, #0b2c31 54%, #07191d 100%)',
      dim: 0.44,
      blur: 0,
      motion: 'ambient',
    },
  },
  {
    id: 'paper',
    labelKey: 'settings.appearance.skin.paper',
    descriptionKey: 'settings.appearance.skin.paperDescription',
    preview: 'radial-gradient(circle at 16% 16%, rgba(255, 255, 255, 0.55), transparent 24%), radial-gradient(circle at 84% 20%, rgba(184, 137, 71, 0.20), transparent 26%), linear-gradient(135deg, #efe4d1 0%, #dac9ae 48%, #f6eee2 100%)',
    skin: {
      presetId: 'paper',
      kind: 'gradient',
      gradient: 'radial-gradient(circle at 16% 16%, rgba(255, 255, 255, 0.42), transparent 24%), radial-gradient(circle at 84% 20%, rgba(184, 137, 71, 0.14), transparent 26%), linear-gradient(135deg, #efe4d1 0%, #dac9ae 48%, #f6eee2 100%)',
      dim: 0.28,
      blur: 0,
      motion: 'ambient',
    },
  },
];

const APPEARANCE_READABILITY_MODES: AppearanceReadabilityMode[] = ['balanced', 'readability', 'immersive'];

function isSameSkinPreset(currentSkin: AppearanceSettings['skin'], presetSkin: AppearanceSettings['skin']): boolean {
  if (currentSkin.kind !== presetSkin.kind) {
    return false;
  }

  if (presetSkin.kind === 'none') {
    return true;
  }

  if (presetSkin.kind === 'image') {
    return currentSkin.presetId === presetSkin.presetId && currentSkin.imagePath === presetSkin.imagePath;
  }

  return currentSkin.presetId === presetSkin.presetId && currentSkin.gradient === presetSkin.gradient;
}

function getNumericOptionsWithCurrent(options: number[], currentValue: number): number[] {
  if (options.includes(currentValue)) {
    return options;
  }

  return [...options, currentValue].sort((left, right) => left - right);
}

function AppearanceSkinPreview({ appearance }: { appearance: AppearanceSettings }) {
  const descriptor = getAppearanceBackdropDescriptor(appearance);

  return (
    <>
      <div className="absolute inset-0" style={descriptor.baseStyle} />
      {descriptor.layers.map((layer, index) => (
        <div
          key={`${appearance.skin.presetId}:${appearance.skin.kind}:${index}`}
          className={layer.className}
          style={layer.style}
        />
      ))}
      <div className="absolute inset-0 bg-black" style={descriptor.dimStyle} />
    </>
  );
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ open, onClose }) => {
  const { language, setLanguage, t } = useI18n();
  const isWindows = window.electronAPI.platform === 'win32';
  const [ides, setIDEs] = useState<IDEConfig[]>([]);
  const [supportedIDENames, setSupportedIDENames] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string>('');
  const [editingIDE, setEditingIDE] = useState<IDEConfig | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [availableShells, setAvailableShells] = useState<ShellProgramOption[]>([]);

  // 快捷导航状态
  const [quickNavItems, setQuickNavItems] = useState<QuickNavItem[]>([]);
  const [editingNavItem, setEditingNavItem] = useState<QuickNavItem | null>(null);
  const [showNavDialog, setShowNavDialog] = useState(false);
  const [currentTab, setCurrentTab] = useState<SettingsTab>('general');
  const [hasVisitedPluginTab, setHasVisitedPluginTab] = useState(false);
  const [quickNavTab, setQuickNavTab] = useState<QuickNavSubTab>('ide');

  // StatusLine 配置状态
  const [statusLineConfig, setStatusLineConfig] = useState<StatusLineConfig>(DEFAULT_STATUSLINE_CONFIG);
  const [terminalSettings, setTerminalSettings] = useState({
    useBundledConptyDll: true,
    defaultShellProgram: '',
    fontFamily: '',
    fontSize: 14,
  });
  const [appearanceSettings, setAppearanceSettings] = useState<AppearanceSettings>(DEFAULT_APPEARANCE_SETTINGS);
  const [featureSettings, setFeatureSettings] = useState<FeatureSettings>(DEFAULT_FEATURE_SETTINGS);
  const [knownHosts, setKnownHosts] = useState<KnownHostEntry[]>([]);
  const [knownHostsLoading, setKnownHostsLoading] = useState(false);
  const [knownHostsError, setKnownHostsError] = useState<string | null>(null);
  const [removingKnownHostId, setRemovingKnownHostId] = useState<string | null>(null);

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
      setKnownHostsError(null);
      setRemovingKnownHostId(null);
      return;
    }

    void loadSettings();
    void loadKnownHosts();
    void loadAvailableShells();
    void loadSupportedIDENames();
  }, [open]);

  useEffect(() => {
    if (currentTab === 'plugins') {
      setHasVisitedPluginTab(true);
    }
  }, [currentTab]);

  const loadSettings = async () => {
    try {
      const response = await window.electronAPI.getSettings();
      if (response.success && response.data) {
        const settings = response.data;

        setIDEs(settings.ides || []);
        setQuickNavItems([...(settings.quickNav?.items || [])].sort((a: QuickNavItem, b: QuickNavItem) => a.order - b.order));
        setStatusLineConfig({
          ...DEFAULT_STATUSLINE_CONFIG,
          ...settings.statusLine,
        });
        setTerminalSettings({
          useBundledConptyDll: settings.terminal?.useBundledConptyDll ?? true,
          defaultShellProgram: settings.terminal?.defaultShellProgram ?? '',
          fontFamily: settings.terminal?.fontFamily ?? '',
          fontSize: settings.terminal?.fontSize ?? 14,
        });
        setAppearanceSettings(normalizeAppearanceSettings(settings.appearance));
        setFeatureSettings({
          ...DEFAULT_FEATURE_SETTINGS,
          ...settings.features,
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

  const loadKnownHosts = async () => {
    setKnownHostsLoading(true);
    setKnownHostsError(null);

    try {
      const response = await window.electronAPI.listKnownHosts();
      if (response.success && response.data) {
        setKnownHosts(response.data);
        return;
      }

      setKnownHostsError(response.error || t('settings.ssh.knownHostsLoadFailed'));
    } catch (error) {
      console.error('Failed to load SSH known hosts:', error);
      setKnownHostsError(error instanceof Error ? error.message : t('settings.ssh.knownHostsLoadFailed'));
    } finally {
      setKnownHostsLoading(false);
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
    setScanMessage('');
    try {
      const response = await window.electronAPI.scanIDEs();
      if (response.success && response.data) {
        const scannedIDEs = response.data as IDEConfig[];
        const existingById = new Map(ides.map(ide => [ide.id, ide]));
        const mergedDetected = scannedIDEs.map(scanned => {
          const existing = existingById.get(scanned.id);
          if (!existing) {
            return scanned;
          }

          const shouldKeepCustomIcon = existing.iconSourceType === 'custom-image' && Boolean(existing.icon);

          return {
            ...scanned,
            enabled: existing.enabled,
            isCustom: existing.isCustom ?? false,
            ...(shouldKeepCustomIcon
              ? {
                  icon: existing.icon,
                  iconSourceType: existing.iconSourceType,
                  iconSourcePath: existing.iconSourcePath || existing.icon,
                  iconConfidence: existing.iconConfidence ?? 1000,
                }
              : {}),
          };
        });

        const customEntries = ides.filter(ide => ide.isCustom || !ide.detected);
        const mergedIDEs = [...mergedDetected];

        for (const customEntry of customEntries) {
          if (!mergedIDEs.some(ide => ide.id === customEntry.id)) {
            mergedIDEs.push(customEntry);
          }
        }

        setIDEs(mergedIDEs);
        setScanMessage(
          scannedIDEs.length > 0
            ? t('settings.ide.scanResultFound', { count: scannedIDEs.length })
            : t('settings.ide.scanResultEmpty')
        );

        await window.electronAPI.updateSettings({ ides: mergedIDEs });
        notifyIDESettingsUpdated();
      } else {
        setScanMessage(response.error || t('settings.ide.scanResultEmpty'));
      }
    } catch (error) {
      console.error('Failed to scan IDEs:', error);
      setScanMessage(error instanceof Error ? error.message : t('settings.ide.scanResultError'));
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

  const handleSelectIDEIcon = async (ideId: string) => {
    try {
      const currentIDE = ides.find(ide => ide.id === ideId);
      const response = await window.electronAPI.selectImageFile(currentIDE?.icon);
      if (!response?.success || !response.data) {
        return;
      }
      const selectedIcon = response.data;

      const updatedIDEs = ides.map(ide => (
        ide.id === ideId
          ? {
              ...ide,
              icon: selectedIcon,
              iconSourceType: 'custom-image' as const,
              iconSourcePath: selectedIcon,
              iconConfidence: 1000,
            }
          : ide
      ));

      setIDEs(updatedIDEs);
      await window.electronAPI.updateSettings({ ides: updatedIDEs });
      notifyIDESettingsUpdated();
    } catch (error) {
      console.error('Failed to select IDE icon:', error);
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
      isCustom: true,
      detected: false,
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
        isCustom: editingIDE.isCustom ?? true,
        detected: editingIDE.detected ?? false,
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
        setEditingIDE(prev => prev ? { ...prev, path: response.data ?? undefined } : null);
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
  const handleStatusLineConfigChange = async (updates: Partial<StatusLineConfig>) => {
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

      // 如果更新了字体或字号，通知所有终端实例
      if ('fontFamily' in updates || 'fontSize' in updates) {
        notifyTerminalSettingsUpdated({
          fontFamily: newConfig.fontFamily,
          fontSize: newConfig.fontSize,
        });
      }
    } catch (error) {
      console.error('Failed to update terminal settings:', error);
    }
  };

  const handleAppearanceSettingsChange = async (updates: Partial<AppearanceSettings>) => {
    const previousConfig = appearanceSettings;
    const nextConfig = normalizeAppearanceSettings({
      ...previousConfig,
      ...updates,
      skin: updates.skin
        ? {
            ...previousConfig.skin,
            ...updates.skin,
          }
        : previousConfig.skin,
    });

    setAppearanceSettings(nextConfig);
    applyAppearanceToDocument(nextConfig);

    try {
      await window.electronAPI.updateSettings({ appearance: nextConfig });
      notifyWorkspaceSettingsUpdated({ appearance: nextConfig });
    } catch (error) {
      console.error('Failed to update appearance settings:', error);
      setAppearanceSettings(previousConfig);
      applyAppearanceToDocument(previousConfig);
    }
  };

  const handleSelectAppearanceImage = async () => {
    try {
      const response = await window.electronAPI.selectImageFile(appearanceSettings.skin.imagePath);
      if (!response?.success || !response.data) {
        return;
      }

      await handleAppearanceSettingsChange({
        skin: {
          presetId: 'custom',
          kind: 'image',
          imagePath: response.data,
          gradient: appearanceSettings.skin.gradient,
          dim: Math.max(appearanceSettings.skin.dim, 0.42),
          blur: 0,
          motion: 'none',
        },
      });
    } catch (error) {
      console.error('Failed to select appearance image:', error);
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

  const handleFeatureSettingsChange = async (updates: Partial<FeatureSettings>) => {
    const previousConfig = featureSettings;
    const newConfig = { ...previousConfig, ...updates };
    setFeatureSettings(newConfig);

    try {
      await window.electronAPI.updateSettings({ features: newConfig });
      notifyWorkspaceSettingsUpdated({ features: newConfig });
    } catch (error) {
      console.error('Failed to update feature settings:', error);
      setFeatureSettings(previousConfig);
    }
  };

  const handleRemoveKnownHost = async (entryId: string) => {
    setRemovingKnownHostId(entryId);
    setKnownHostsError(null);

    try {
      const response = await window.electronAPI.removeKnownHost(entryId);
      if (!response.success) {
        throw new Error(response.error || t('settings.ssh.removeKnownHostFailed'));
      }

      setKnownHosts((previousEntries) => previousEntries.filter((entry) => entry.id !== entryId));
    } catch (error) {
      console.error('Failed to remove SSH known host:', error);
      setKnownHostsError(error instanceof Error ? error.message : t('settings.ssh.removeKnownHostFailed'));
    } finally {
      setRemovingKnownHostId(null);
    }
  };

  const handleToggleStatusLine = async (enabled: boolean) => {
    await handleStatusLineConfigChange({ enabled });

    if (enabled) {
      // 自动配置 Claude Code
      try {
        const response = await window.electronAPI.statusLineConfigure();
        if (!response.success) {
          console.error('Failed to configure Claude Code:', response.error);
        }
      } catch (error) {
        console.error('Failed to configure Claude Code:', error);
      }
    } else {
      // 移除 Claude Code 配置
      try {
        const response = await window.electronAPI.statusLineRemove();
        if (!response.success) {
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

  const formatKnownHostTimestamp = useCallback((timestamp: string) => {
    const locale = language === 'zh-CN' ? 'zh-CN' : 'en-US';
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(timestamp));
  }, [language]);

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
      value: 'appearance' as SettingsTab,
      label: t('settings.tab.appearance'),
      icon: Palette,
    },
    {
      value: 'quicknav' as SettingsTab,
      label: t('settings.tab.quickNav'),
      icon: Compass,
    },
    {
      value: 'plugins' as SettingsTab,
      label: t('settings.tab.statusLine'),
      icon: Plug,
    },
    {
      value: 'chat' as SettingsTab,
      label: t('settings.tab.chat'),
      icon: Command,
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
  const activeSkinPreset = APPEARANCE_SKIN_PRESETS.find((preset) => isSameSkinPreset(appearanceSettings.skin, preset.skin)) ?? APPEARANCE_SKIN_PRESETS[0];
  const skinDimOptions = getNumericOptionsWithCurrent(APPEARANCE_SKIN_DIM_OPTIONS, appearanceSettings.skin.dim);
  const skinBlurOptions = getNumericOptionsWithCurrent(APPEARANCE_SKIN_BLUR_OPTIONS, appearanceSettings.skin.blur);
  return (
    <Dialog.Root open={open} onOpenChange={handleSettingsOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-sm animate-fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[9999] flex h-[72vh] w-[94vw] max-h-[720px] max-w-6xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[28px] border border-[rgb(var(--border))] bg-[rgb(var(--background))] shadow-2xl animate-scale-in">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(var(--primary),0.16),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(var(--accent),0.18),_transparent_32%)]" />

          <div className="relative flex items-center justify-between border-b border-[rgb(var(--border))] px-8 py-4">
            <div>
              <Dialog.Title className="text-2xl font-semibold text-[rgb(var(--foreground))]">
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
                          <h3 className="text-base font-semibold text-[rgb(var(--foreground))]">{t('settings.general.languageTitle')}</h3>
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
                          <h3 className="text-base font-semibold text-[rgb(var(--foreground))]">{t('settings.general.defaultShellTitle')}</h3>
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

                  <section className="rounded-[24px] border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.24)]">
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgb(var(--accent))] text-[rgb(var(--primary))]">
                        <Monitor size={22} />
                      </div>
                      <div className="flex-1">
                        <div className="mb-5">
                          <h3 className="text-base font-semibold text-[rgb(var(--foreground))]">{t('settings.general.terminalFontTitle')}</h3>
                          <p className="mt-2 text-sm leading-6 text-[rgb(var(--muted-foreground))]">{t('settings.general.terminalFontDescription')}</p>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <label htmlFor="terminal-font-family" className="mb-2 block text-sm font-medium text-[rgb(var(--foreground))]">
                              {t('settings.general.fontFamilyLabel')}
                            </label>
                            <Select.Root
                              value={terminalSettings.fontFamily || 'default'}
                              onValueChange={(value) => handleTerminalSettingsChange({
                                fontFamily: value === 'default' ? '' : value,
                              })}
                            >
                              <Select.Trigger
                                id="terminal-font-family"
                                className="flex w-full items-center justify-between rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-4 py-3 text-left text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--accent))] focus:outline-none focus:border-[rgb(var(--ring))]"
                              >
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
                                    <Select.Item value="default" className="cursor-pointer rounded-xl px-3 py-2 text-[rgb(var(--foreground))] outline-none transition-colors hover:bg-[rgb(var(--accent))]">
                                      <Select.ItemText>默认</Select.ItemText>
                                    </Select.Item>
                                    <Select.Item value="JetBrains Mono" className="cursor-pointer rounded-xl px-3 py-2 text-[rgb(var(--foreground))] outline-none transition-colors hover:bg-[rgb(var(--accent))]">
                                      <Select.ItemText>JetBrains Mono</Select.ItemText>
                                    </Select.Item>
                                    <Select.Item value="Fira Code" className="cursor-pointer rounded-xl px-3 py-2 text-[rgb(var(--foreground))] outline-none transition-colors hover:bg-[rgb(var(--accent))]">
                                      <Select.ItemText>Fira Code</Select.ItemText>
                                    </Select.Item>
                                    <Select.Item value="Cascadia Code" className="cursor-pointer rounded-xl px-3 py-2 text-[rgb(var(--foreground))] outline-none transition-colors hover:bg-[rgb(var(--accent))]">
                                      <Select.ItemText>Cascadia Code</Select.ItemText>
                                    </Select.Item>
                                    <Select.Item value="Consolas" className="cursor-pointer rounded-xl px-3 py-2 text-[rgb(var(--foreground))] outline-none transition-colors hover:bg-[rgb(var(--accent))]">
                                      <Select.ItemText>Consolas</Select.ItemText>
                                    </Select.Item>
                                  </Select.Viewport>
                                </Select.Content>
                              </Select.Portal>
                            </Select.Root>
                          </div>

                          <div>
                            <label htmlFor="terminal-font-size" className="mb-2 block text-sm font-medium text-[rgb(var(--foreground))]">
                              {t('settings.general.fontSizeLabel')}
                            </label>
                            <Select.Root
                              value={String(terminalSettings.fontSize)}
                              onValueChange={(value) => handleTerminalSettingsChange({
                                fontSize: Number(value),
                              })}
                            >
                              <Select.Trigger
                                id="terminal-font-size"
                                className="flex w-full items-center justify-between rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-4 py-3 text-left text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--accent))] focus:outline-none focus:border-[rgb(var(--ring))]"
                              >
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
                                    {[12, 13, 14, 15, 16, 18, 20].map((size) => (
                                      <Select.Item
                                        key={size}
                                        value={String(size)}
                                        className="cursor-pointer rounded-xl px-3 py-2 text-[rgb(var(--foreground))] outline-none transition-colors hover:bg-[rgb(var(--accent))]"
                                      >
                                        <Select.ItemText>{size}</Select.ItemText>
                                      </Select.Item>
                                    ))}
                                  </Select.Viewport>
                                </Select.Content>
                              </Select.Portal>
                            </Select.Root>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              </Tabs.Content>

              <Tabs.Content value="appearance" className="h-full overflow-y-auto px-8 py-8 data-[state=inactive]:hidden">
                <div className="mx-auto max-w-5xl space-y-6">
                  <section className="rounded-[24px] border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.24)]">
                    <div className="mb-6 flex items-start gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgb(var(--accent))] text-[rgb(var(--primary))]">
                        <Palette size={22} />
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-[rgb(var(--foreground))]">{t('settings.appearance.themeTitle')}</h3>
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-[rgb(var(--muted-foreground))]">{t('settings.appearance.themeDescription')}</p>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                      {APPEARANCE_THEME_PRESETS.map((preset) => {
                        const selected = appearanceSettings.themeId === preset.id;

                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => handleAppearanceSettingsChange({ themeId: preset.id })}
                            className={`rounded-[22px] border p-4 text-left transition-all ${
                              selected
                                ? 'border-[rgb(var(--primary))] bg-[rgb(var(--accent))]'
                                : 'border-[rgb(var(--border))] bg-[rgb(var(--secondary))] hover:border-[rgb(var(--ring))] hover:bg-[rgb(var(--accent))]'
                            }`}
                          >
                            <div
                              className="h-24 rounded-[18px] border border-black/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                              style={{ background: preset.preview }}
                            />
                            <div className="mt-4 flex items-center justify-between gap-3">
                              <div>
                                <div className="text-sm font-semibold text-[rgb(var(--foreground))]">
                                  {t(`settings.appearance.theme.${preset.id}`)}
                                </div>
                                <div className="mt-1 text-xs text-[rgb(var(--muted-foreground))]">
                                  {t(`settings.appearance.theme.${preset.id}Description`)}
                                </div>
                              </div>
                              {selected && (
                                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[rgb(var(--primary))] text-[rgb(var(--primary-foreground))]">
                                  <Check size={14} />
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  <section className="rounded-[24px] border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.24)]">
                    <div className="mb-6 flex items-start gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgb(var(--accent))] text-[rgb(var(--primary))]">
                        <Wallpaper size={22} />
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-[rgb(var(--foreground))]">{t('settings.appearance.skinTitle')}</h3>
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-[rgb(var(--muted-foreground))]">{t('settings.appearance.skinDescription')}</p>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      {APPEARANCE_SKIN_PRESETS.map((preset) => {
                        const selected = activeSkinPreset.id === preset.id;

                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => handleAppearanceSettingsChange({ skin: preset.skin })}
                            className={`rounded-[22px] border p-4 text-left transition-all ${
                              selected
                                ? 'border-[rgb(var(--primary))] bg-[rgb(var(--accent))]'
                                : 'border-[rgb(var(--border))] bg-[rgb(var(--secondary))] hover:border-[rgb(var(--ring))] hover:bg-[rgb(var(--accent))]'
                            }`}
                          >
                            <div className="relative h-28 overflow-hidden rounded-[18px] border border-black/10 bg-[rgb(var(--background))]">
                              <AppearanceSkinPreview
                                appearance={{
                                  ...appearanceSettings,
                                  reduceMotion: true,
                                  skin: preset.skin,
                                }}
                              />
                              <div
                                className="absolute inset-x-4 bottom-4 rounded-2xl border border-white/10 px-4 py-3 text-sm shadow-[0_12px_28px_rgba(0,0,0,0.18)]"
                                style={{
                                  ...getAppearanceSkinStyle({
                                    ...appearanceSettings,
                                    skin: preset.skin,
                                  }),
                                  background: 'color-mix(in srgb, rgb(var(--card)) 78%, transparent)',
                                  backdropFilter: 'blur(10px)',
                                  filter: undefined,
                                }}
                              >
                                <div className="font-semibold text-[rgb(var(--foreground))]">{t('settings.appearance.previewTitle')}</div>
                                <div className="mt-1 text-xs text-[rgb(var(--muted-foreground))]">{t('settings.appearance.previewSubtitle')}</div>
                              </div>
                            </div>
                            <div className="mt-4 flex items-center justify-between gap-3">
                              <div>
                                <div className="text-sm font-semibold text-[rgb(var(--foreground))]">{t(preset.labelKey)}</div>
                                <div className="mt-1 text-xs text-[rgb(var(--muted-foreground))]">{t(preset.descriptionKey)}</div>
                              </div>
                              {selected && (
                                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[rgb(var(--primary))] text-[rgb(var(--primary-foreground))]">
                                  <Check size={14} />
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-4 rounded-[22px] border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] p-5">
                      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0">
                          <h4 className="text-base font-semibold text-[rgb(var(--foreground))]">{t('settings.appearance.customImageTitle')}</h4>
                          <p className="mt-2 text-sm leading-6 text-[rgb(var(--muted-foreground))]">{t('settings.appearance.customImageDescription')}</p>
                          {appearanceSettings.skin.kind === 'image' && appearanceSettings.skin.imagePath && (
                            <p className="mt-2 truncate text-xs text-[rgb(var(--muted-foreground))]">
                              {appearanceSettings.skin.imagePath}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={handleSelectAppearanceImage}
                            className="inline-flex h-11 items-center justify-center rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] px-4 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--accent))]"
                          >
                            {t('settings.appearance.customImageButton')}
                          </button>
                          {appearanceSettings.skin.kind === 'image' && (
                            <button
                              type="button"
                              onClick={() => handleAppearanceSettingsChange({ skin: APPEARANCE_SKIN_PRESETS[1].skin })}
                              className="inline-flex h-11 items-center justify-center rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-4 text-sm font-medium text-[rgb(var(--muted-foreground))] transition-colors hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--foreground))]"
                            >
                              {t('settings.appearance.customImageReset')}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-[24px] border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.24)]">
                    <div className="mb-6 flex items-start gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgb(var(--accent))] text-[rgb(var(--primary))]">
                        <SunMoon size={22} />
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-[rgb(var(--foreground))]">{t('settings.appearance.readabilityTitle')}</h3>
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-[rgb(var(--muted-foreground))]">{t('settings.appearance.readabilityDescription')}</p>
                      </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-[1.3fr_0.9fr]">
                      <div className="rounded-[22px] border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] p-5">
                        <label htmlFor="appearance-readability" className="mb-2 block text-sm font-medium text-[rgb(var(--foreground))]">
                          {t('settings.appearance.readabilityLabel')}
                        </label>
                        <Select.Root
                          value={appearanceSettings.readabilityMode}
                          onValueChange={(value) => handleAppearanceSettingsChange({ readabilityMode: value as AppearanceReadabilityMode })}
                        >
                          <Select.Trigger
                            id="appearance-readability"
                            aria-label={t('settings.appearance.readabilityLabel')}
                            className="flex w-full items-center justify-between rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] px-4 py-3 text-left text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--accent))] focus:outline-none focus:border-[rgb(var(--ring))]"
                          >
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
                                {APPEARANCE_READABILITY_MODES.map((mode) => (
                                  <Select.Item
                                    key={mode}
                                    value={mode}
                                    className="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-[rgb(var(--foreground))] outline-none transition-colors hover:bg-[rgb(var(--accent))]"
                                  >
                                    <Select.ItemText>{t(`settings.appearance.readability.${mode}`)}</Select.ItemText>
                                    <Select.ItemIndicator>
                                      <Check size={14} />
                                    </Select.ItemIndicator>
                                  </Select.Item>
                                ))}
                              </Select.Viewport>
                            </Select.Content>
                          </Select.Portal>
                        </Select.Root>
                        <p className="mt-2 text-xs leading-5 text-[rgb(var(--muted-foreground))]">
                          {t(`settings.appearance.readability.${appearanceSettings.readabilityMode}Description`)}
                        </p>
                      </div>

                      <div className="rounded-[22px] border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] p-5">
                        <label htmlFor="appearance-terminal-opacity" className="mb-2 block text-sm font-medium text-[rgb(var(--foreground))]">
                          {t('settings.appearance.opacityLabel')}
                        </label>
                        <Select.Root
                          value={String(appearanceSettings.terminalOpacity)}
                          onValueChange={(value) => handleAppearanceSettingsChange({ terminalOpacity: Number(value) })}
                        >
                          <Select.Trigger
                            id="appearance-terminal-opacity"
                            aria-label={t('settings.appearance.opacityLabel')}
                            className="flex w-full items-center justify-between rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] px-4 py-3 text-left text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--accent))] focus:outline-none focus:border-[rgb(var(--ring))]"
                          >
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
                                {APPEARANCE_OPACITY_OPTIONS.map((value) => (
                                  <Select.Item
                                    key={value}
                                    value={String(value)}
                                    className="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-[rgb(var(--foreground))] outline-none transition-colors hover:bg-[rgb(var(--accent))]"
                                  >
                                    <Select.ItemText>{t('settings.appearance.opacityValue', { value: Math.round(value * 100) })}</Select.ItemText>
                                    <Select.ItemIndicator>
                                      <Check size={14} />
                                    </Select.ItemIndicator>
                                  </Select.Item>
                                ))}
                              </Select.Viewport>
                            </Select.Content>
                          </Select.Portal>
                        </Select.Root>
                        <p className="mt-2 text-xs leading-5 text-[rgb(var(--muted-foreground))]">{t('settings.appearance.opacityDescription')}</p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 lg:grid-cols-3">
                      <div className="rounded-[22px] border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] p-5">
                        <label htmlFor="appearance-skin-dim" className="mb-2 block text-sm font-medium text-[rgb(var(--foreground))]">
                          {t('settings.appearance.skinDimLabel')}
                        </label>
                        <Select.Root
                          value={String(appearanceSettings.skin.dim)}
                          onValueChange={(value) => handleAppearanceSettingsChange({
                            skin: {
                              ...appearanceSettings.skin,
                              dim: Number(value),
                            },
                          })}
                        >
                          <Select.Trigger
                            id="appearance-skin-dim"
                            aria-label={t('settings.appearance.skinDimLabel')}
                            className="flex w-full items-center justify-between rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] px-4 py-3 text-left text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--accent))] focus:outline-none focus:border-[rgb(var(--ring))]"
                          >
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
                                {skinDimOptions.map((value) => (
                                  <Select.Item
                                    key={value}
                                    value={String(value)}
                                    className="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-[rgb(var(--foreground))] outline-none transition-colors hover:bg-[rgb(var(--accent))]"
                                  >
                                    <Select.ItemText>{t('settings.appearance.skinDimValue', { value: Math.round(value * 100) })}</Select.ItemText>
                                    <Select.ItemIndicator>
                                      <Check size={14} />
                                    </Select.ItemIndicator>
                                  </Select.Item>
                                ))}
                              </Select.Viewport>
                            </Select.Content>
                          </Select.Portal>
                        </Select.Root>
                        <p className="mt-2 text-xs leading-5 text-[rgb(var(--muted-foreground))]">{t('settings.appearance.skinDimDescription')}</p>
                      </div>

                      <div className="rounded-[22px] border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] p-5">
                        <label htmlFor="appearance-skin-blur" className="mb-2 block text-sm font-medium text-[rgb(var(--foreground))]">
                          {t('settings.appearance.skinBlurLabel')}
                        </label>
                        <Select.Root
                          value={String(appearanceSettings.skin.blur)}
                          onValueChange={(value) => handleAppearanceSettingsChange({
                            skin: {
                              ...appearanceSettings.skin,
                              blur: Number(value),
                            },
                          })}
                        >
                          <Select.Trigger
                            id="appearance-skin-blur"
                            aria-label={t('settings.appearance.skinBlurLabel')}
                            className="flex w-full items-center justify-between rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] px-4 py-3 text-left text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--accent))] focus:outline-none focus:border-[rgb(var(--ring))]"
                          >
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
                                {skinBlurOptions.map((value) => (
                                  <Select.Item
                                    key={value}
                                    value={String(value)}
                                    className="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-[rgb(var(--foreground))] outline-none transition-colors hover:bg-[rgb(var(--accent))]"
                                  >
                                    <Select.ItemText>{t('settings.appearance.skinBlurValue', { value })}</Select.ItemText>
                                    <Select.ItemIndicator>
                                      <Check size={14} />
                                    </Select.ItemIndicator>
                                  </Select.Item>
                                ))}
                              </Select.Viewport>
                            </Select.Content>
                          </Select.Portal>
                        </Select.Root>
                        <p className="mt-2 text-xs leading-5 text-[rgb(var(--muted-foreground))]">{t('settings.appearance.skinBlurDescription')}</p>
                      </div>

                      <div className="rounded-[22px] border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] p-5">
                        <label htmlFor="appearance-skin-motion" className="mb-2 block text-sm font-medium text-[rgb(var(--foreground))]">
                          {t('settings.appearance.skinMotionLabel')}
                        </label>
                        <Select.Root
                          value={appearanceSettings.skin.motion}
                          onValueChange={(value) => handleAppearanceSettingsChange({
                            skin: {
                              ...appearanceSettings.skin,
                              motion: value as AppearanceSkinMotionMode,
                            },
                          })}
                        >
                          <Select.Trigger
                            id="appearance-skin-motion"
                            aria-label={t('settings.appearance.skinMotionLabel')}
                            className="flex w-full items-center justify-between rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] px-4 py-3 text-left text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--accent))] focus:outline-none focus:border-[rgb(var(--ring))]"
                          >
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
                                {APPEARANCE_SKIN_MOTION_MODES.map((mode) => (
                                  <Select.Item
                                    key={mode}
                                    value={mode}
                                    className="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-[rgb(var(--foreground))] outline-none transition-colors hover:bg-[rgb(var(--accent))]"
                                  >
                                    <Select.ItemText>{t(`settings.appearance.skinMotion.${mode}`)}</Select.ItemText>
                                    <Select.ItemIndicator>
                                      <Check size={14} />
                                    </Select.ItemIndicator>
                                  </Select.Item>
                                ))}
                              </Select.Viewport>
                            </Select.Content>
                          </Select.Portal>
                        </Select.Root>
                        <p className="mt-2 text-xs leading-5 text-[rgb(var(--muted-foreground))]">{t('settings.appearance.skinMotionDescription')}</p>
                      </div>
                    </div>

                    <div className="mt-4 rounded-[22px] border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] p-5">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <h4 className="text-base font-semibold text-[rgb(var(--foreground))]">{t('settings.appearance.reduceMotionTitle')}</h4>
                          <p className="mt-2 text-sm leading-6 text-[rgb(var(--muted-foreground))]">{t('settings.appearance.reduceMotionDescription')}</p>
                        </div>
                        <Switch.Root
                          checked={appearanceSettings.reduceMotion}
                          onCheckedChange={(checked) => handleAppearanceSettingsChange({ reduceMotion: checked })}
                          aria-label={t('settings.appearance.reduceMotionTitle')}
                          className="relative h-7 w-12 flex-shrink-0 rounded-full bg-[rgb(var(--muted))] transition-colors data-[state=checked]:bg-[rgb(var(--primary))]"
                        >
                          <Switch.Thumb className="block h-6 w-6 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-[22px]" />
                        </Switch.Root>
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
                        className="rounded-xl px-4 py-2 text-sm font-medium text-[rgb(var(--muted-foreground))] transition-colors hover:text-[rgb(var(--foreground))] data-[state=active]:bg-[rgb(var(--accent))] data-[state=active]:text-[rgb(var(--primary))]"
                      >
                        {t('settings.quickNav.ideTab')}
                      </Tabs.Trigger>
                      <Tabs.Trigger
                        value="custom"
                        className="rounded-xl px-4 py-2 text-sm font-medium text-[rgb(var(--muted-foreground))] transition-colors hover:text-[rgb(var(--foreground))] data-[state=active]:bg-[rgb(var(--accent))] data-[state=active]:text-[rgb(var(--primary))]"
                      >
                        {t('settings.quickNav.customTab')}
                      </Tabs.Trigger>
                    </Tabs.List>

                    <Tabs.Content value="ide" className="space-y-4 data-[state=inactive]:hidden">
                      <div className="rounded-[24px] border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <p className="max-w-2xl text-sm leading-6 text-[rgb(var(--muted-foreground))]">{t('settings.quickNav.ideDescription')}</p>
                            {scanMessage && (
                              <p className="mt-3 text-sm text-[rgb(var(--muted-foreground))]">{scanMessage}</p>
                            )}
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
                                  <button
                                    type="button"
                                    onClick={() => handleSelectIDEIcon(ide.id)}
                                    className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] transition-colors hover:border-[rgb(var(--primary))] hover:bg-[rgb(var(--accent))]"
                                    title="点击自定义 IDE Logo"
                                  >
                                    <IDEIcon icon={ide.icon || ''} size={30} className="text-[rgb(var(--foreground))]" />
                                  </button>
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <h3 className="text-base font-semibold text-[rgb(var(--foreground))]">{ide.name}</h3>
                                      {ide.detected && ide.path && (
                                        <span className="rounded-full border border-[rgba(168,170,88,0.20)] bg-[rgba(168,170,88,0.10)] px-2 py-0.5 text-[11px] font-medium text-[rgb(var(--primary))]">
                                          {t('settings.ide.found')}
                                        </span>
                                      )}
                                      {ide.source && (
                                        <span className="rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-2 py-0.5 text-[11px] font-medium text-[rgb(var(--muted-foreground))]">
                                          {t('settings.ide.source', { source: ide.source })}
                                        </span>
                                      )}
                                      {ide.version && (
                                        <span className="rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-2 py-0.5 text-[11px] font-medium text-[rgb(var(--muted-foreground))]">
                                          {t('settings.ide.version', { version: ide.version })}
                                        </span>
                                      )}
                                    </div>
                                    <p className="mt-2 text-sm text-[rgb(var(--muted-foreground))]">{t('settings.ide.commandPrefix', { command: ide.command })}</p>
                                    {(ide.installPath || ide.path) && (
                                      <p className="mt-1 truncate text-xs text-[rgb(var(--muted-foreground))]" title={ide.installPath || ide.path}>
                                        {ide.installPath || ide.path}
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
                                    className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[rgba(255,92,92,0.14)] bg-[rgba(255,92,92,0.08)] text-[rgb(var(--muted-foreground))] transition-colors hover:border-[rgba(255,92,92,0.34)] hover:bg-[rgba(255,92,92,0.14)] hover:text-[rgb(var(--foreground))]"
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
                                      <h3 className="text-base font-semibold text-[rgb(var(--foreground))]">{item.name}</h3>
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
                                    className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[rgba(255,92,92,0.14)] bg-[rgba(255,92,92,0.08)] text-[rgb(var(--muted-foreground))] transition-colors hover:border-[rgba(255,92,92,0.34)] hover:bg-[rgba(255,92,92,0.14)] hover:text-[rgb(var(--foreground))]"
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

              <Tabs.Content value="plugins" forceMount className="h-full overflow-y-auto px-8 py-8 data-[state=inactive]:hidden">
                {hasVisitedPluginTab ? (
                  <PluginCenter
                    statusLineConfig={statusLineConfig}
                    onToggleStatusLine={handleToggleStatusLine}
                    onStatusLineConfigChange={handleStatusLineConfigChange}
                  />
                ) : null}
              </Tabs.Content>

              <Tabs.Content value="chat" className="h-full overflow-y-auto px-8 py-8 data-[state=inactive]:hidden">
                <ChatSettingsTab />
              </Tabs.Content>

              <Tabs.Content value="advanced" className="h-full overflow-y-auto px-8 py-8 data-[state=inactive]:hidden">
                <div className="mx-auto max-w-5xl space-y-6">
                  <section className="rounded-[24px] border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6">
                    <div className="mb-5 flex items-start gap-4">
                      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-[rgb(var(--accent))] text-[rgb(var(--primary))]">
                        <Globe size={20} />
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-[rgb(var(--foreground))]">{t('settings.advanced.sshSection')}</h3>
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-[rgb(var(--muted-foreground))]">{t('settings.advanced.sshDescription')}</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-[24px] border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] p-5">
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                          <div>
                            <h4 className="text-base font-semibold text-[rgb(var(--foreground))]">{t('settings.ssh.enableTitle')}</h4>
                            <p className="mt-2 text-sm leading-6 text-[rgb(var(--muted-foreground))]">{t('settings.ssh.enableDescription')}</p>
                          </div>

                          <Switch.Root
                            checked={featureSettings.sshEnabled}
                            onCheckedChange={(checked) => handleFeatureSettingsChange({ sshEnabled: checked })}
                            aria-label={t('settings.ssh.enableTitle')}
                            className="relative h-7 w-12 flex-shrink-0 rounded-full bg-[rgb(var(--muted))] transition-colors data-[state=checked]:bg-[rgb(var(--primary))]"
                          >
                            <Switch.Thumb className="block h-6 w-6 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-[22px]" />
                          </Switch.Root>
                        </div>
                      </div>

                      <div className="rounded-[24px] border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] p-5">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <h4 className="text-base font-semibold text-[rgb(var(--foreground))]">{t('settings.ssh.knownHostsTitle')}</h4>
                            <p className="mt-2 max-w-3xl text-sm leading-6 text-[rgb(var(--muted-foreground))]">{t('settings.ssh.knownHostsDescription')}</p>
                            {knownHostsError && (
                              <p className="mt-3 text-sm text-[rgb(var(--foreground))]">{knownHostsError}</p>
                            )}
                          </div>

                          {knownHostsLoading && (
                            <div className="rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--card))] px-3 py-1 text-xs font-medium text-[rgb(var(--muted-foreground))]">
                              {t('common.loading')}
                            </div>
                          )}
                        </div>

                        <div className="mt-5">
                          {knownHosts.length === 0 ? (
                            <div className="rounded-[20px] border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--background))] px-5 py-10 text-center">
                              <Globe size={32} className="mx-auto text-[rgb(var(--muted-foreground))] opacity-50" />
                              <p className="mt-4 text-sm font-medium text-[rgb(var(--foreground))]">{t('settings.ssh.emptyTitle')}</p>
                              <p className="mt-2 text-sm text-[rgb(var(--muted-foreground))]">{t('settings.ssh.emptyDescription')}</p>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {knownHosts.map((entry) => {
                                const entryTarget = `${entry.host}:${entry.port}`;
                                const isRemoving = removingKnownHostId === entry.id;

                                return (
                                  <div
                                    key={entry.id}
                                    className="rounded-[20px] border border-[rgb(var(--border))] bg-[rgb(var(--background))] p-4"
                                  >
                                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                      <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <h5 className="text-sm font-semibold text-[rgb(var(--foreground))]">{entryTarget}</h5>
                                          <span className="rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--card))] px-2 py-0.5 text-[11px] font-medium text-[rgb(var(--muted-foreground))]">
                                            {entry.algorithm}
                                          </span>
                                        </div>
                                        <p className="mt-3 break-all font-mono text-xs text-[rgb(var(--foreground))]">
                                          {t('settings.ssh.fingerprint')}: {entry.digest}
                                        </p>
                                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[rgb(var(--muted-foreground))]">
                                          <span>{t('settings.ssh.addedAt')}: {formatKnownHostTimestamp(entry.createdAt)}</span>
                                          <span>{t('settings.ssh.updatedAt')}: {formatKnownHostTimestamp(entry.updatedAt)}</span>
                                        </div>
                                      </div>

                                      <button
                                        type="button"
                                        onClick={() => handleRemoveKnownHost(entry.id)}
                                        disabled={isRemoving}
                                        aria-label={t('settings.ssh.removeKnownHostAria', { host: entry.host, port: entry.port })}
                                        className="inline-flex h-10 items-center justify-center rounded-2xl border border-[rgba(255,92,92,0.14)] bg-[rgba(255,92,92,0.08)] px-4 text-sm font-medium text-[rgb(var(--muted-foreground))] transition-colors hover:border-[rgba(255,92,92,0.34)] hover:bg-[rgba(255,92,92,0.14)] hover:text-[rgb(var(--foreground))] disabled:cursor-not-allowed disabled:opacity-70"
                                      >
                                        {isRemoving ? t('common.loading') : t('settings.ssh.removeKnownHost')}
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-[24px] border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6">
                    {isWindows ? (
                      <div className="rounded-[24px] border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] p-5">
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                          <div className="flex items-start gap-4">
                            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-[rgb(var(--accent))] text-[rgb(var(--primary))]">
                              <Wrench size={20} />
                            </div>
                            <div>
                              <h4 className="text-base font-semibold text-[rgb(var(--foreground))]">{t('settings.general.bundledConptyTitle')}</h4>
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
                            <div className="text-base font-semibold text-[rgb(var(--foreground))]">{t('settings.advanced.windowsOnlyTitle')}</div>
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
                        <h3 className="text-base font-semibold text-[rgb(var(--foreground))]">{t('settings.advanced.tmuxSection')}</h3>
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-[rgb(var(--muted-foreground))]">{t('settings.advanced.tmuxDescription')}</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-[24px] border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] p-5">
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                          <div className="flex items-start gap-4">
                            <div>
                              <h4 className="text-base font-semibold text-[rgb(var(--foreground))]">{t('settings.tmux.enableTitle')}</h4>
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
                            <code className="mt-3 inline-flex rounded-xl border border-[rgba(var(--primary),0.24)] bg-[rgb(var(--card))] px-3 py-1.5 text-xs text-[rgb(var(--foreground))]">
                              CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
                            </code>
                          </div>
                        </div>
                      </div>

                      <div className={`grid gap-4 lg:grid-cols-2 ${!tmuxSettings.enabled ? 'opacity-50' : ''}`}>
                        <div className="rounded-[24px] border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] p-5">
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <h4 className="text-base font-semibold text-[rgb(var(--foreground))]">{t('settings.tmux.autoInjectPathTitle')}</h4>
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
                              <h4 className="text-base font-semibold text-[rgb(var(--foreground))]">{t('settings.tmux.enableForAllPanesTitle')}</h4>
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
          <Dialog.Overlay className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[10001] w-[92vw] max-w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-[28px] border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6 shadow-2xl">
            <Dialog.Title className="text-xl font-semibold text-[rgb(var(--foreground))]">
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
                className="rounded-2xl px-4 py-2 text-[rgb(var(--muted-foreground))] transition-colors hover:text-[rgb(var(--foreground))]"
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
          <Dialog.Overlay className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[10001] w-[92vw] max-w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-[28px] border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6 shadow-2xl">
            <Dialog.Title className="text-xl font-semibold text-[rgb(var(--foreground))]">
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
                className="rounded-2xl px-4 py-2 text-[rgb(var(--muted-foreground))] transition-colors hover:text-[rgb(var(--foreground))]"
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
