export type PluginSource = 'builtin' | 'marketplace' | 'sideload';
export type PluginCategory = 'language' | 'formatter' | 'linter' | 'statusline' | 'tooling';
export type PluginCapabilityType =
  | 'language-server'
  | 'formatter'
  | 'linter'
  | 'statusline-adapter'
  | 'code-action-provider';
export type PluginInstallStatus = 'not-installed' | 'installing' | 'installed' | 'updating' | 'error';
export type PluginRuntimeState = 'idle' | 'starting' | 'running' | 'stopped' | 'error';
export type PluginHealth = 'unknown' | 'ok' | 'warning' | 'error';
export type PluginRequirementType = 'java' | 'python' | 'node' | 'binary' | 'env';
export type PluginRuntimeType = 'binary' | 'node' | 'java' | 'python';
export type PluginBindingScope = 'global' | 'workspace';
export type PluginWorkspaceMode = 'per-root' | 'per-pane';
export type PluginSettingScope = 'global' | 'workspace';
export type PluginSettingType = 'boolean' | 'string' | 'number' | 'enum';
export type PluginSettingInputKind = 'text' | 'directory';
export type PluginPlatformOS = 'darwin' | 'linux' | 'win32';
export type PluginPlatformArch = 'x64' | 'arm64';

export interface PluginCapabilityFeatures {
  definition?: boolean;
  hover?: boolean;
  references?: boolean;
  documentSymbol?: boolean;
  workspaceSymbol?: boolean;
  diagnostics?: boolean;
  completion?: boolean;
  rename?: boolean;
  codeAction?: boolean;
  formatting?: boolean;
}

export interface PluginRuntime {
  type: PluginRuntimeType;
  entry: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export interface PluginRequirement {
  type: PluginRequirementType;
  version?: string;
  command?: string;
  envVar?: string;
  optional?: boolean;
  message?: string;
}

export interface PluginSettingOption {
  label: string;
  value: string | number | boolean;
}

export interface PluginSettingSchemaEntry {
  type: PluginSettingType;
  title: string;
  description?: string;
  scope: PluginSettingScope;
  inputKind?: PluginSettingInputKind;
  placeholder?: string;
  defaultValue?: string | number | boolean;
  options?: PluginSettingOption[];
}

export interface PluginEngines {
  app: string;
}

export interface LanguageServerPluginCapability {
  type: 'language-server';
  languages: string[];
  fileExtensions?: string[];
  projectIndicators?: string[];
  priority?: number;
  takesOverBuiltinLanguageService?: boolean;
  workspaceMode?: PluginWorkspaceMode;
  features?: PluginCapabilityFeatures;
  runtime: PluginRuntime;
  requirements?: PluginRequirement[];
}

export type PluginCapability = LanguageServerPluginCapability;

export interface PluginManifest {
  schemaVersion: number;
  id: string;
  name: string;
  publisher: string;
  version: string;
  description?: string;
  homepage?: string;
  license?: string;
  categories?: PluginCategory[];
  tags?: string[];
  engines: PluginEngines;
  capabilities: PluginCapability[];
  settingsSchema?: Record<string, PluginSettingSchemaEntry>;
}

export interface PluginCatalogPlatformAsset {
  os: PluginPlatformOS;
  arch: PluginPlatformArch;
  downloadUrl: string;
  sha256: string;
  size?: number;
}

export interface PluginCatalogEntry {
  id: string;
  name: string;
  publisher: string;
  latestVersion: string;
  summary?: string;
  description?: string;
  homepage?: string;
  license?: string;
  categories?: PluginCategory[];
  tags?: string[];
  languages?: string[];
  platforms: PluginCatalogPlatformAsset[];
}

export interface PluginCatalog {
  schemaVersion: number;
  generatedAt: string;
  plugins: PluginCatalogEntry[];
}

export interface InstalledPluginRecord {
  source: PluginSource;
  installedVersion: string;
  installPath: string;
  enabledByDefault: boolean;
  status: PluginInstallStatus;
  lastCheckedAt?: string;
  lastKnownHealth?: PluginHealth;
  lastError?: string;
}

export interface PluginRegistry {
  schemaVersion: number;
  plugins: Record<string, InstalledPluginRecord>;
  globalPluginSettings?: Record<string, Record<string, unknown>>;
}

export interface PluginListItem {
  id: string;
  name: string;
  publisher: string;
  version?: string;
  latestVersion?: string;
  summary?: string;
  description?: string;
  source: PluginSource;
  categories?: PluginCategory[];
  tags?: string[];
  languages?: string[];
  installStatus: PluginInstallStatus;
  runtimeState?: PluginRuntimeState;
  health?: PluginHealth;
  enabledByDefault?: boolean;
  workspaceEnabled?: boolean;
  updateAvailable?: boolean;
  installPath?: string;
  manifest?: PluginManifest;
}

export interface WorkspacePluginSettings {
  enabledPluginIds?: string[];
  disabledPluginIds?: string[];
  pluginSettings?: Record<string, Record<string, unknown>>;
}
