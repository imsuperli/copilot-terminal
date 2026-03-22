import { AppLanguage } from '../i18n';
import { QuickNavConfig } from './quick-nav';
import { Window } from './window';
import { WindowGroup } from './window-group';
import { CustomCategory } from './custom-category';

export interface IDEConfig {
  id: string;
  name: string;
  command: string;
  path?: string;
  enabled: boolean;
  icon?: string;
  iconSourceType?: 'image-file' | 'shortcut-icon' | 'shortcut-file' | 'shortcut-target' | 'uninstall-display-icon' | 'install-dir-icon' | 'executable';
  iconSourcePath?: string;
  iconConfidence?: number;
  installPath?: string;
  detected?: boolean;
  source?: string;
  version?: string;
  catalogId?: string;
  isCustom?: boolean;
}

export interface StatusLineConfig {
  enabled: boolean;
  displayLocation: 'cli' | 'card' | 'both';
  cliFormat: 'full' | 'compact';
  cardFormat: 'full' | 'compact' | 'badge';
  showModel: boolean;
  showContext: boolean;
  showCost: boolean;
  showTime: boolean;
  showTokens: boolean;
}

export interface TerminalSettings {
  useBundledConptyDll: boolean;
  defaultShellProgram: string;
}

export interface TmuxSettings {
  enabled: boolean;
  autoInjectPath: boolean;
  enableForAllPanes: boolean;
}

export interface Settings {
  notificationsEnabled: boolean;
  theme: 'dark' | 'light';
  autoSave: boolean;
  autoSaveInterval: number;
  language?: AppLanguage;
  ides: IDEConfig[];
  quickNav?: QuickNavConfig;
  statusLine?: StatusLineConfig;
  terminal?: TerminalSettings;
  tmux?: TmuxSettings;
  customCategories?: CustomCategory[];
  defaultSidebarTab?: 'all' | 'active' | 'archived' | string; // string 为自定义分类 ID
}

export interface Workspace {
  version: string;
  windows: Window[];
  groups: WindowGroup[];
  settings: Settings;
  lastSavedAt: string;
}
