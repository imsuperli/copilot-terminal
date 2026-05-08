import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockLoadURL = vi.fn();
const mockLoadFile = vi.fn();
const mockWindowOn = vi.fn();
const mockWindowOnce = vi.fn();
const mockWindowShow = vi.fn();
const mockWindowHide = vi.fn();
const mockWindowFocus = vi.fn();
const mockWindowRestore = vi.fn();
const mockWindowMaximize = vi.fn();
const mockWindowSetOpacity = vi.fn();
const mockWindowIsDestroyed = vi.fn(() => false);
const mockWindowIsMinimized = vi.fn(() => false);
const mockWindowIsVisible = vi.fn(() => true);
const mockWindowIsMaximized = vi.fn(() => false);

const mockBeforeInputOn = vi.fn();
const mockWebContents = {
  openDevTools: vi.fn(),
  closeDevTools: vi.fn(),
  isDevToolsOpened: vi.fn(() => false),
  on: mockBeforeInputOn,
  once: vi.fn(),
  send: vi.fn(),
};

const mockMainWindow = {
  loadURL: mockLoadURL,
  loadFile: mockLoadFile,
  on: mockWindowOn,
  once: mockWindowOnce,
  show: mockWindowShow,
  hide: mockWindowHide,
  focus: mockWindowFocus,
  restore: mockWindowRestore,
  maximize: mockWindowMaximize,
  setOpacity: mockWindowSetOpacity,
  isDestroyed: mockWindowIsDestroyed,
  isMinimized: mockWindowIsMinimized,
  isVisible: mockWindowIsVisible,
  isMaximized: mockWindowIsMaximized,
  webContents: mockWebContents,
};

const mockGetAllWindows = vi.fn(() => [mockMainWindow]);
const mockSetName = vi.fn();
const mockSetPath = vi.fn();
const mockRequestSingleInstanceLock = vi.fn(() => true);
const mockWhenReady = vi.fn(() => Promise.resolve());
const mockAppOn = vi.fn();
const mockAppQuit = vi.fn();
const mockAppExit = vi.fn();
const mockRegisterSchemesAsPrivileged = vi.fn();
const mockSetApplicationMenu = vi.fn();
const mockBuildFromTemplate = vi.fn(() => ({}));
const mockGetPath = vi.fn((name: string) => {
  if (name === 'appData') {
    return '/mock/app/data';
  }

  if (name === 'userData') {
    return '/mock/app/data/synapse';
  }

  return '/mock/path';
});
const mockNativeTheme = {
  themeSource: 'system',
};
const mockScreen = {
  getCursorScreenPoint: vi.fn(() => ({ x: 0, y: 0 })),
  getDisplayNearestPoint: vi.fn(() => ({
    workArea: {
      width: 1024,
      height: 768,
      x: 0,
      y: 0,
    },
  })),
};
const mockProtocol = {
  registerSchemesAsPrivileged: mockRegisterSchemesAsPrivileged,
  handle: vi.fn(),
};
const mockNet = {
  fetch: vi.fn(),
};

const mockRecoverFromCrash = vi.fn(() => Promise.resolve());
const mockLoadWorkspace = vi.fn(() => Promise.resolve({
  version: '3.0',
  windows: [],
  groups: [],
  canvasWorkspaces: [],
  settings: {},
  lastSavedAt: '2026-05-08T00:00:00.000Z',
}));

class MockWorkspaceManagerImpl {
  recoverFromCrash = mockRecoverFromCrash;
  loadWorkspace = mockLoadWorkspace;
}

class MockProcessManager {
  setSSHKnownHostsStore = vi.fn();
  setSSHHostKeyPromptService = vi.fn();
  setZmodemDialogHandlers = vi.fn();
  warmupConPtyDll = vi.fn(() => Promise.resolve());
  setTmuxCompatService = vi.fn();
  getStatusDetector = vi.fn(() => ({}));
}

class MockStatusPoller {
  startPolling = vi.fn();
  addPane = vi.fn();
  removePane = vi.fn();
}

class MockViewSwitcherImpl {
  switchToUnifiedView = vi.fn();
  getCurrentView = vi.fn(() => 'unified');
}

class MockAutoSaveManagerImpl {
  startAutoSave = vi.fn();
}

class MockPtySubscriptionManager {}

class MockShutdownManager {
  shutdown = vi.fn(() => Promise.resolve());
}

class MockFileWatcherService {}

class MockGitBranchWatcher {}

class MockTmuxCompatService {
  on = vi.fn();
}

class MockSSHProfileStore {}
class MockSSHVaultService {}
class MockSSHKnownHostsStore {}
class MockChatProviderVaultService {}
class MockElectronSSHHostKeyPromptService {}
class MockCodeFileService {}
class MockCodeGitBlameService {}
class MockCodeGitHistoryService {}
class MockCodeGitOperationService {}
class MockCodeGitService {}
class MockCodeProjectIndexService {
  notifyChanges = vi.fn(() => Promise.resolve());
}
class MockCodePaneWatcherService {}
class MockCodeRefactorService {}
class MockCodeRunProfileService {}
class MockCodeTestService {}
class MockDebugAdapterSupervisor {}
class MockLanguageFeatureService {}
class MockLanguagePluginResolver {}
class MockLanguageProjectContributionService {}
class MockLanguageServerSupervisor {}
class MockLanguageWorkspaceHostService {}
class MockLanguageWorkspaceService {}
class MockPluginCatalogService {}
class MockPluginInstallerService {}
class MockPluginManager {}
class MockPluginCapabilityRuntimeService {}
class MockPluginRegistryStore {}
class MockSessionAggregationService {}
class MockTaskArtifactService {}
class MockBrowserSyncService {}
class MockMcpCapabilityService {}

const mockProjectConfigWatcher = {
  getWatchedWindowIds: vi.fn(() => []),
  stopWatching: vi.fn(),
  startWatching: vi.fn(() => Promise.resolve()),
};

const mockRegisterAllHandlers = vi.fn();
const mockCreatePtyDataForwarder = vi.fn(() => vi.fn());
const mockNormalizeImagePath = vi.fn();
const mockToFileUrl = vi.fn(() => 'file:///mock/image.png');
const mockGetAgentController = vi.fn(() => null);

vi.mock('electron', () => ({
  app: {
    setName: mockSetName,
    setPath: mockSetPath,
    getPath: mockGetPath,
    requestSingleInstanceLock: mockRequestSingleInstanceLock,
    whenReady: mockWhenReady,
    on: mockAppOn,
    quit: mockAppQuit,
    exit: mockAppExit,
    name: 'Synapse',
  },
  BrowserWindow: Object.assign(
    vi.fn(function MockBrowserWindow() {
      return mockMainWindow;
    }),
    {
      getAllWindows: mockGetAllWindows,
    },
  ),
  dialog: {
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn(),
  },
  ipcMain: {
    handle: vi.fn(),
    once: vi.fn(),
  },
  Menu: {
    setApplicationMenu: mockSetApplicationMenu,
    buildFromTemplate: mockBuildFromTemplate,
  },
  nativeTheme: mockNativeTheme,
  screen: mockScreen,
  protocol: mockProtocol,
  net: mockNet,
}));

vi.mock('../services/WorkspaceManager', () => ({
  WorkspaceManagerImpl: MockWorkspaceManagerImpl,
}));

vi.mock('../services/ProcessManager', () => ({
  ProcessManager: MockProcessManager,
}));

vi.mock('../services/StatusPoller', () => ({
  StatusPoller: MockStatusPoller,
}));

vi.mock('../services/ViewSwitcher', () => ({
  ViewSwitcherImpl: MockViewSwitcherImpl,
}));

vi.mock('../services/AutoSaveManager', () => ({
  AutoSaveManagerImpl: MockAutoSaveManagerImpl,
}));

vi.mock('../services/PtySubscriptionManager', () => ({
  PtySubscriptionManager: MockPtySubscriptionManager,
}));

vi.mock('../services/ShutdownManager', () => ({
  ShutdownManager: MockShutdownManager,
}));

vi.mock('../services/FileWatcherService', () => ({
  FileWatcherService: MockFileWatcherService,
}));

vi.mock('../services/GitBranchWatcher', () => ({
  GitBranchWatcher: MockGitBranchWatcher,
}));

vi.mock('../services/ProjectConfigWatcher', () => ({
  initProjectConfigWatcher: vi.fn(),
  projectConfigWatcher: mockProjectConfigWatcher,
}));

vi.mock('../handlers', () => ({
  registerAllHandlers: mockRegisterAllHandlers,
}));

vi.mock('../services/TmuxCompatService', () => ({
  TmuxCompatService: MockTmuxCompatService,
}));

vi.mock('../services/ssh/SSHProfileStore', () => ({
  SSHProfileStore: MockSSHProfileStore,
}));

vi.mock('../services/ssh/SSHVaultService', () => ({
  SSHVaultService: MockSSHVaultService,
}));

vi.mock('../services/ssh/SSHKnownHostsStore', () => ({
  SSHKnownHostsStore: MockSSHKnownHostsStore,
}));

vi.mock('../services/ssh/SSHHostKeyPromptService', () => ({
  ElectronSSHHostKeyPromptService: MockElectronSSHHostKeyPromptService,
}));

vi.mock('../services/chat/ChatProviderVaultService', () => ({
  ChatProviderVaultService: MockChatProviderVaultService,
}));

vi.mock('../services/code/CodeFileService', () => ({
  CodeFileService: MockCodeFileService,
}));

vi.mock('../services/code/CodeGitBlameService', () => ({
  CodeGitBlameService: MockCodeGitBlameService,
}));

vi.mock('../services/code/CodeGitHistoryService', () => ({
  CodeGitHistoryService: MockCodeGitHistoryService,
}));

vi.mock('../services/code/CodeGitOperationService', () => ({
  CodeGitOperationService: MockCodeGitOperationService,
}));

vi.mock('../services/code/CodeGitService', () => ({
  CodeGitService: MockCodeGitService,
}));

vi.mock('../services/code/CodeProjectIndexService', () => ({
  CodeProjectIndexService: MockCodeProjectIndexService,
}));

vi.mock('../services/code/CodePaneWatcherService', () => ({
  CodePaneWatcherService: MockCodePaneWatcherService,
}));

vi.mock('../services/code/CodeRefactorService', () => ({
  CodeRefactorService: MockCodeRefactorService,
}));

vi.mock('../services/code/CodeRunProfileService', () => ({
  CodeRunProfileService: MockCodeRunProfileService,
}));

vi.mock('../services/code/CodeTestService', () => ({
  CodeTestService: MockCodeTestService,
}));

vi.mock('../services/debug/DebugAdapterSupervisor', () => ({
  DebugAdapterSupervisor: MockDebugAdapterSupervisor,
}));

vi.mock('../services/language/LanguageFeatureService', () => ({
  LanguageFeatureService: MockLanguageFeatureService,
}));

vi.mock('../services/language/LanguagePluginResolver', () => ({
  LanguagePluginResolver: MockLanguagePluginResolver,
}));

vi.mock('../services/language/LanguageProjectContributionService', () => ({
  LanguageProjectContributionService: MockLanguageProjectContributionService,
}));

vi.mock('../services/language/LanguageServerSupervisor', () => ({
  LanguageServerSupervisor: MockLanguageServerSupervisor,
}));

vi.mock('../services/language/LanguageWorkspaceHostService', () => ({
  LanguageWorkspaceHostService: MockLanguageWorkspaceHostService,
}));

vi.mock('../services/language/LanguageWorkspaceService', () => ({
  LanguageWorkspaceService: MockLanguageWorkspaceService,
}));

vi.mock('../services/plugins/PluginCatalogService', () => ({
  PluginCatalogService: MockPluginCatalogService,
}));

vi.mock('../services/plugins/PluginInstallerService', () => ({
  PluginInstallerService: MockPluginInstallerService,
}));

vi.mock('../services/plugins/PluginManager', () => ({
  PluginManager: MockPluginManager,
}));

vi.mock('../services/plugins/PluginCapabilityRuntimeService', () => ({
  PluginCapabilityRuntimeService: MockPluginCapabilityRuntimeService,
}));

vi.mock('../services/plugins/PluginRegistryStore', () => ({
  PluginRegistryStore: MockPluginRegistryStore,
}));

vi.mock('../services/SessionAggregationService', () => ({
  SessionAggregationService: MockSessionAggregationService,
}));

vi.mock('../services/TaskArtifactService', () => ({
  TaskArtifactService: MockTaskArtifactService,
}));

vi.mock('../services/BrowserSyncService', () => ({
  BrowserSyncService: MockBrowserSyncService,
}));

vi.mock('../services/McpCapabilityService', () => ({
  McpCapabilityService: MockMcpCapabilityService,
}));

vi.mock('../utils/ptyDataForwarder', () => ({
  createPtyDataForwarder: mockCreatePtyDataForwarder,
}));

vi.mock('../../shared/utils/appImage', () => ({
  normalizeImagePath: mockNormalizeImagePath,
  toFileUrl: mockToFileUrl,
}));

vi.mock('../handlers/agentHandlers', () => ({
  getAgentController: mockGetAgentController,
}));

describe('Electron Main Process', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequestSingleInstanceLock.mockReturnValue(true);
    mockWhenReady.mockImplementation(() => Promise.resolve());
    mockLoadWorkspace.mockResolvedValue({
      version: '3.0',
      windows: [],
      groups: [],
      canvasWorkspaces: [],
      settings: {},
      lastSavedAt: '2026-05-08T00:00:00.000Z',
    });
    mockWindowIsDestroyed.mockReturnValue(false);
    mockWindowIsMinimized.mockReturnValue(false);
    mockWindowIsVisible.mockReturnValue(true);
    mockWindowIsMaximized.mockReturnValue(false);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('pins userData to the synapse directory', async () => {
    await import('../index');
    await Promise.resolve();

    expect(mockSetName).toHaveBeenCalledWith('Synapse');
    expect(mockSetPath).toHaveBeenCalledWith(
      'userData',
      '/mock/app/data/synapse',
    );
  });

  it('requests the single-instance lock before app startup', async () => {
    await import('../index');

    expect(mockRequestSingleInstanceLock).toHaveBeenCalledTimes(1);
    expect(mockWhenReady).toHaveBeenCalledTimes(1);
  });

  it('quits immediately when the single-instance lock is unavailable', async () => {
    mockRequestSingleInstanceLock.mockReturnValue(false);

    await import('../index');

    expect(mockAppQuit).toHaveBeenCalledTimes(1);
    expect(mockWhenReady).not.toHaveBeenCalled();
    const { BrowserWindow } = await import('electron');
    expect(BrowserWindow).not.toHaveBeenCalled();
  });

  it('configures BrowserWindow with the expected launch options', async () => {
    await import('../index');
    await Promise.resolve();

    const { BrowserWindow } = await import('electron');
    expect(BrowserWindow).toHaveBeenCalled();
    const config = vi.mocked(BrowserWindow).mock.calls[0][0];
    expect(config.width).toBe(1024);
    expect(config.height).toBe(768);
    expect(config.minWidth).toBe(480);
    expect(config.minHeight).toBe(360);
    expect(config.backgroundColor).toBe('#0a0a0a');
    expect(config.title).toBe('');
    expect(config.webPreferences.contextIsolation).toBe(true);
    expect(config.webPreferences.nodeIntegration).toBe(false);
  });

  it('focuses the existing window on second-instance', async () => {
    await import('../index');
    await Promise.resolve();

    const secondInstanceHandler = mockAppOn.mock.calls.find(([eventName]) => eventName === 'second-instance')?.[1];
    expect(secondInstanceHandler).toBeTypeOf('function');

    mockWindowIsMinimized.mockReturnValue(true);
    mockWindowIsVisible.mockReturnValue(false);
    secondInstanceHandler();

    expect(mockWindowRestore).toHaveBeenCalledTimes(1);
    expect(mockWindowShow).toHaveBeenCalledTimes(1);
    expect(mockWindowFocus).toHaveBeenCalledTimes(1);
  });
});
