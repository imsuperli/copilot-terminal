import { randomUUID } from 'crypto';
import { join, posix as posixPath } from 'path';
import { dialog, ipcMain } from 'electron';
import {
  AddSSHSessionPortForwardConfig,
  CloneSSHPaneConfig,
  CreateSSHSftpDirectoryConfig,
  CreateSSHWindowConfig,
  DeleteSSHSftpEntryConfig,
  DownloadSSHSftpDirectoryConfig,
  DownloadSSHSftpFileConfig,
  GetSSHSessionMetricsConfig,
  ListSSHSftpDirectoryConfig,
  RemoveSSHSessionPortForwardConfig,
  SSHSessionPortForwardTarget,
  StartSSHPaneConfig,
  UploadSSHSftpDirectoryConfig,
  UploadSSHSftpFilesConfig,
} from '../../shared/types/electron-api';
import { SSHProfile, SSHVaultEntry } from '../../shared/types/ssh';
import { Pane, Window, WindowStatus } from '../../shared/types/window';
import { getPaneCapabilities } from '../../shared/utils/terminalCapabilities';
import { HandlerContext } from './HandlerContext';
import { errorResponse, successResponse } from './HandlerResponse';
import type { SSHSessionConfig, TerminalConfig } from '../types/process';
import { createPtyDataForwarder } from '../utils/ptyDataForwarder';

export function registerSSHSessionHandlers(ctx: HandlerContext) {
  const {
    mainWindow,
    processManager,
    statusPoller,
    ptySubscriptionManager,
    sshProfileStore,
    sshVaultService,
    getCurrentWorkspace,
  } = ctx;

  ipcMain.handle('create-ssh-window', async (_event, config: CreateSSHWindowConfig) => {
    try {
      if (!processManager || !sshProfileStore) {
        throw new Error('SSH session services are not initialized');
      }

      const profile = await requireSSHProfile(sshProfileStore, config.profileId);
      const vaultEntry = await sshVaultService?.get(profile.id) ?? null;
      const windowId = randomUUID();
      const paneId = randomUUID();
      const pane = createSshPaneDraft(profile, {
        paneId,
        remoteCwd: config.remoteCwd,
        command: config.command,
      });

      const handle = await processManager.spawnTerminal(await buildSSHSpawnConfig(profile, vaultEntry, {
        windowId,
        paneId,
        remoteCwd: pane.ssh?.remoteCwd,
        command: config.command,
      }, {
        sshProfileStore,
        sshVaultService,
      }));

      const runningPane: Pane = {
        ...pane,
        pid: handle.pid,
        sessionId: handle.sessionId,
        status: WindowStatus.WaitingForInput,
      };

      const window: Window = {
        id: windowId,
        name: config.name || profile.name,
        layout: {
          type: 'pane',
          id: paneId,
          pane: runningPane,
        },
        activePaneId: paneId,
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        kind: 'ssh',
        tags: profile.tags,
      };

      subscribePaneOutput({
        mainWindow,
        processManager,
        ptySubscriptionManager,
        statusPoller,
        windowId,
        paneId,
        pid: handle.pid,
      });

      return successResponse(window);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('start-ssh-pane', async (_event, config: StartSSHPaneConfig) => {
    try {
      if (!processManager || !sshProfileStore) {
        throw new Error('SSH session services are not initialized');
      }

      const profile = await requireSSHProfile(sshProfileStore, config.profileId);
      const vaultEntry = await sshVaultService?.get(profile.id) ?? null;
      const handle = await processManager.spawnTerminal(await buildSSHSpawnConfig(profile, vaultEntry, {
        windowId: config.windowId,
        paneId: config.paneId,
        remoteCwd: config.remoteCwd,
        command: config.command,
      }, {
        sshProfileStore,
        sshVaultService,
      }));

      subscribePaneOutput({
        mainWindow,
        processManager,
        ptySubscriptionManager,
        statusPoller,
        windowId: config.windowId,
        paneId: config.paneId,
        pid: handle.pid,
      });

      return successResponse({
        pid: handle.pid,
        sessionId: handle.sessionId,
        status: WindowStatus.WaitingForInput,
      });
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('clone-ssh-pane', async (_event, config: CloneSSHPaneConfig) => {
    try {
      if (!processManager || !sshProfileStore) {
        throw new Error('SSH session services are not initialized');
      }

      const workspace = getCurrentWorkspace();
      if (!workspace) {
        throw new Error('Workspace is not loaded');
      }

      const sourcePane = findPaneInWorkspace(workspace.windows, config.sourceWindowId, config.sourcePaneId);
      if (!sourcePane || sourcePane.backend !== 'ssh' || !sourcePane.ssh) {
        throw new Error(`SSH source pane not found: ${config.sourceWindowId}/${config.sourcePaneId}`);
      }

      const profile = await requireSSHProfile(sshProfileStore, sourcePane.ssh.profileId);
      const vaultEntry = await sshVaultService?.get(profile.id) ?? null;
      const handle = await processManager.spawnTerminal(await buildSSHSpawnConfig(profile, vaultEntry, {
        windowId: config.targetWindowId,
        paneId: config.targetPaneId,
        remoteCwd: resolvePaneRemoteCwd(sourcePane),
        command: sourcePane.command,
      }, {
        sshProfileStore,
        sshVaultService,
      }));

      subscribePaneOutput({
        mainWindow,
        processManager,
        ptySubscriptionManager,
        statusPoller,
        windowId: config.targetWindowId,
        paneId: config.targetPaneId,
        pid: handle.pid,
      });

      return successResponse({
        pid: handle.pid,
        sessionId: handle.sessionId,
      });
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('list-ssh-session-port-forwards', async (_event, config: SSHSessionPortForwardTarget) => {
    try {
      if (!processManager) {
        throw new Error('SSH session services are not initialized');
      }

      return successResponse(processManager.listSSHPortForwards(config.windowId, config.paneId));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('add-ssh-session-port-forward', async (_event, config: AddSSHSessionPortForwardConfig) => {
    try {
      if (!processManager) {
        throw new Error('SSH session services are not initialized');
      }

      return successResponse(await processManager.addSSHPortForward(config.windowId, config.paneId, config.forward));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('remove-ssh-session-port-forward', async (_event, config: RemoveSSHSessionPortForwardConfig) => {
    try {
      if (!processManager) {
        throw new Error('SSH session services are not initialized');
      }

      await processManager.removeSSHPortForward(config.windowId, config.paneId, config.forwardId);
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('list-ssh-sftp-directory', async (_event, config: ListSSHSftpDirectoryConfig) => {
    try {
      if (!processManager) {
        throw new Error('SSH session services are not initialized');
      }

      return successResponse(await processManager.listSSHSftpDirectory(config.windowId, config.paneId, config.path));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('get-ssh-session-metrics', async (_event, config: GetSSHSessionMetricsConfig) => {
    try {
      if (!processManager) {
        throw new Error('SSH session services are not initialized');
      }

      if (typeof processManager.getSSHSessionMetrics !== 'function') {
        throw new Error('SSH session metrics are not available in the current runtime');
      }

      return successResponse(await processManager.getSSHSessionMetrics(config.windowId, config.paneId, config.path));
    } catch (error) {
      if (isExpectedMissingSSHSessionError(error)) {
        return successResponse(null);
      }

      return errorResponse(error);
    }
  });

  ipcMain.handle('download-ssh-sftp-file', async (_event, config: DownloadSSHSftpFileConfig) => {
    try {
      if (!processManager) {
        throw new Error('SSH session services are not initialized');
      }

      if (!mainWindow) {
        throw new Error('Main window is not available');
      }

      const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: config.suggestedName?.trim() || posixPath.basename(config.remotePath),
      });
      if (result.canceled || !result.filePath) {
        return successResponse(null);
      }

      await processManager.downloadSSHSftpFile(config.windowId, config.paneId, config.remotePath, result.filePath);
      return successResponse(result.filePath);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('upload-ssh-sftp-files', async (_event, config: UploadSSHSftpFilesConfig) => {
    try {
      if (!processManager) {
        throw new Error('SSH session services are not initialized');
      }

      if (!mainWindow) {
        throw new Error('Main window is not available');
      }

      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile', 'multiSelections'],
      });
      if (result.canceled || result.filePaths.length === 0) {
        return successResponse({ uploadedCount: 0 });
      }

      const uploadedCount = await processManager.uploadSSHSftpFiles(
        config.windowId,
        config.paneId,
        config.remotePath,
        result.filePaths,
      );

      return successResponse({ uploadedCount });
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('upload-ssh-sftp-directory', async (_event, config: UploadSSHSftpDirectoryConfig) => {
    try {
      if (!processManager) {
        throw new Error('SSH session services are not initialized');
      }

      if (!mainWindow) {
        throw new Error('Main window is not available');
      }

      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
      });
      if (result.canceled || result.filePaths.length === 0) {
        return successResponse({ uploadedCount: 0 });
      }

      const uploadedCount = await processManager.uploadSSHSftpDirectory(
        config.windowId,
        config.paneId,
        config.remotePath,
        result.filePaths[0],
      );

      return successResponse({ uploadedCount });
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('download-ssh-sftp-directory', async (_event, config: DownloadSSHSftpDirectoryConfig) => {
    try {
      if (!processManager) {
        throw new Error('SSH session services are not initialized');
      }

      if (!mainWindow) {
        throw new Error('Main window is not available');
      }

      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory', 'createDirectory'],
      });
      if (result.canceled || result.filePaths.length === 0) {
        return successResponse(null);
      }

      const localPath = join(
        result.filePaths[0],
        config.suggestedName?.trim() || posixPath.basename(config.remotePath),
      );
      await processManager.downloadSSHSftpDirectory(config.windowId, config.paneId, config.remotePath, localPath);
      return successResponse(localPath);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('create-ssh-sftp-directory', async (_event, config: CreateSSHSftpDirectoryConfig) => {
    try {
      if (!processManager) {
        throw new Error('SSH session services are not initialized');
      }

      const trimmedName = config.name.trim();
      if (!trimmedName || trimmedName.includes('/') || trimmedName.includes('\\')) {
        throw new Error('Enter a valid directory name.');
      }

      return successResponse(await processManager.createSSHSftpDirectory(
        config.windowId,
        config.paneId,
        config.parentPath,
        trimmedName,
      ));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('delete-ssh-sftp-entry', async (_event, config: DeleteSSHSftpEntryConfig) => {
    try {
      if (!processManager) {
        throw new Error('SSH session services are not initialized');
      }

      await processManager.deleteSSHSftpEntry(config.windowId, config.paneId, config.remotePath);
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });
}

function isExpectedMissingSSHSessionError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.startsWith('Pane not found:')
    || error.message.startsWith('SSH SFTP session not found')
    || error.message.startsWith('Process already exited:');
}

async function requireSSHProfile(
  store: NonNullable<HandlerContext['sshProfileStore']>,
  profileId: string,
): Promise<SSHProfile> {
  const profile = await store.get(profileId);
  if (!profile) {
    throw new Error(`SSH profile not found: ${profileId}`);
  }

  return profile;
}

async function buildSSHSpawnConfig(
  profile: SSHProfile,
  vaultEntry: SSHVaultEntry | null,
  options: {
    windowId: string;
    paneId: string;
    remoteCwd?: string;
    command?: string;
  },
  context: {
    sshProfileStore: NonNullable<HandlerContext['sshProfileStore']>;
    sshVaultService: HandlerContext['sshVaultService'];
  },
): Promise<TerminalConfig> {
  const remoteCwd = resolveSSHRemoteCwd(options.remoteCwd, profile.defaultRemoteCwd);
  const remoteCommand = options.command || profile.remoteCommand || undefined;

  return {
    backend: 'ssh',
    workingDirectory: remoteCwd ?? '~',
    command: remoteCommand,
    windowId: options.windowId,
    paneId: options.paneId,
    ssh: await buildSSHSessionConfig(profile, vaultEntry, {
      remoteCwd,
      command: options.command,
    }, {
      sshProfileStore: context.sshProfileStore,
      sshVaultService: context.sshVaultService,
      visitedProfileIds: new Set<string>(),
    }),
  };
}

async function buildSSHSessionConfig(
  profile: SSHProfile,
  vaultEntry: SSHVaultEntry | null,
  options: {
    remoteCwd?: string;
    command?: string;
  },
  context: {
    sshProfileStore: NonNullable<HandlerContext['sshProfileStore']>;
    sshVaultService: HandlerContext['sshVaultService'];
    visitedProfileIds: Set<string>;
  },
): Promise<SSHSessionConfig> {
  const nextContext = context;
  const remoteCwd = resolveSSHRemoteCwd(options.remoteCwd, profile.defaultRemoteCwd);

  if (nextContext.visitedProfileIds.has(profile.id)) {
    throw new Error(`SSH jump host chain contains a loop at profile ${profile.id}`);
  }

  nextContext.visitedProfileIds.add(profile.id);

  try {
    let jumpHost: SSHSessionConfig | undefined;

    if (profile.jumpHostProfileId) {
      if (!nextContext.sshProfileStore) {
        throw new Error('SSH profile store is required to resolve jump host profiles');
      }

      const jumpProfile = await requireSSHProfile(nextContext.sshProfileStore, profile.jumpHostProfileId);
      const jumpVaultEntry = await nextContext.sshVaultService?.get(jumpProfile.id) ?? null;
      jumpHost = await buildSSHSessionConfig(jumpProfile, jumpVaultEntry, {}, nextContext);
    }

    return {
      profileId: profile.id,
      host: profile.host,
      port: profile.port,
      user: profile.user,
      authType: profile.auth,
      privateKeys: profile.privateKeys,
      privateKeyPassphrases: vaultEntry?.privateKeyPassphrases,
      password: vaultEntry?.password,
      keepaliveInterval: profile.keepaliveInterval,
      keepaliveCountMax: profile.keepaliveCountMax,
      readyTimeout: profile.readyTimeout,
      verifyHostKeys: profile.verifyHostKeys,
      agentForward: profile.agentForward,
      reuseSession: profile.reuseSession,
      ...(jumpHost ? { jumpHost } : {}),
      ...(profile.jumpHostProfileId ? { jumpHostProfileId: profile.jumpHostProfileId } : {}),
      ...(profile.proxyCommand ? { proxyCommand: profile.proxyCommand } : {}),
      ...(profile.socksProxyHost ? { socksProxyHost: profile.socksProxyHost } : {}),
      ...(profile.socksProxyPort !== undefined ? { socksProxyPort: profile.socksProxyPort } : {}),
      ...(profile.httpProxyHost ? { httpProxyHost: profile.httpProxyHost } : {}),
      ...(profile.httpProxyPort !== undefined ? { httpProxyPort: profile.httpProxyPort } : {}),
      forwardedPorts: profile.forwardedPorts,
      ...(profile.algorithms ? { algorithms: profile.algorithms } : {}),
      x11: profile.x11,
      skipBanner: profile.skipBanner,
      ...(remoteCwd ? { remoteCwd } : {}),
      ...(options.command || profile.remoteCommand ? { command: options.command || profile.remoteCommand } : {}),
    };
  } finally {
    nextContext.visitedProfileIds.delete(profile.id);
  }
}

function createSshPaneDraft(
  profile: SSHProfile,
  options: {
    paneId: string;
    remoteCwd?: string;
    command?: string;
  },
): Pane {
  const remoteCwd = resolveSSHRemoteCwd(options.remoteCwd, profile.defaultRemoteCwd);
  const remoteCommand = options.command || profile.remoteCommand || '';

  const pane: Pane = {
    id: options.paneId,
    cwd: remoteCwd ?? '~',
    command: remoteCommand,
    status: WindowStatus.Restoring,
    pid: null,
    backend: 'ssh',
    ssh: {
      profileId: profile.id,
      host: profile.host,
      port: profile.port,
      user: profile.user,
      authType: profile.auth,
      ...(remoteCwd ? { remoteCwd } : {}),
      ...(profile.jumpHostProfileId ? { jumpHostProfileId: profile.jumpHostProfileId } : {}),
      ...(profile.proxyCommand ? { proxyCommand: profile.proxyCommand } : {}),
      reuseSession: profile.reuseSession,
    },
  };

  return {
    ...pane,
    capabilities: getPaneCapabilities(pane),
  };
}

function subscribePaneOutput(params: {
  mainWindow: HandlerContext['mainWindow'];
  processManager: NonNullable<HandlerContext['processManager']>;
  ptySubscriptionManager: HandlerContext['ptySubscriptionManager'];
  statusPoller: HandlerContext['statusPoller'];
  windowId: string;
  paneId: string;
  pid: number;
}): void {
  const {
    mainWindow,
    processManager,
    ptySubscriptionManager,
    statusPoller,
    windowId,
    paneId,
    pid,
  } = params;
  const forwardPtyData = createPtyDataForwarder(() => mainWindow);

  const unsubscribe = processManager.subscribePtyData(pid, (data: string, seq?: number) => {
    forwardPtyData({
      windowId,
      paneId,
      data,
      seq,
    });
  });

  ptySubscriptionManager?.add(paneId, unsubscribe);
  statusPoller?.addPane(windowId, paneId, pid);
}

function findPaneInWorkspace(windows: Window[], windowId: string, paneId: string): Pane | null {
  const window = windows.find((item) => item.id === windowId);
  if (!window) {
    return null;
  }

  return findPaneInLayout(window.layout, paneId);
}

function findPaneInLayout(layout: Window['layout'], paneId: string): Pane | null {
  if (layout.type === 'pane') {
    return layout.pane.id === paneId ? layout.pane : null;
  }

  for (const child of layout.children) {
    const found = findPaneInLayout(child, paneId);
    if (found) {
      return found;
    }
  }

  return null;
}

function resolvePaneRemoteCwd(pane: Pane): string | undefined {
  return resolveSSHRemoteCwd(pane.ssh?.remoteCwd, pane.cwd);
}

function resolveSSHRemoteCwd(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const normalized = normalizeSSHRemoteCwd(value);
    if (normalized) {
      return normalized;
    }
  }

  return undefined;
}

function normalizeSSHRemoteCwd(value: string | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  let normalized = value.trim();
  if (!normalized) {
    return undefined;
  }

  normalized = unwrapBalancedQuotes(normalized);
  if (!normalized || normalized === '~') {
    return undefined;
  }

  return normalized;
}

function unwrapBalancedQuotes(value: string): string {
  const quote = value[0];
  if ((quote === '\'' || quote === '"') && value[value.length - 1] === quote) {
    return value.slice(1, -1).trim();
  }

  return value;
}
