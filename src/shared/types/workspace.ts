import { AppLanguage } from '../i18n';
import { QuickNavConfig } from './quick-nav';
import { Window } from './window';

export interface IDEConfig {
  id: string;
  name: string;
  command: string;
  path?: string;
  enabled: boolean;
  icon?: string;
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
}

export interface Workspace {
  version: string;
  windows: Window[];
  settings: Settings;
  lastSavedAt: string;
}
