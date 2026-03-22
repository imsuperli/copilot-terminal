import { randomUUID } from 'crypto';
import { ipcMain } from 'electron';
import {
  CloneSSHPaneConfig,
  CreateSSHWindowConfig,
  StartSSHPaneConfig,
} from '../../shared/types/electron-api';
import { SSHProfile, SSHVaultEntry } from '../../shared/types/ssh';
import { Pane, Window, WindowStatus } from '../../shared/types/window';
import { getPaneCapabilities } from '../../shared/utils/terminalCapabilities';
import { HandlerContext } from './HandlerContext';
import { errorResponse, successResponse } from './HandlerResponse';
import type { SSHSessionConfig, TerminalConfig } from '../types/process';

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
        remoteCwd: sourcePane.ssh.remoteCwd ?? sourcePane.cwd,
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
  return {
    backend: 'ssh',
    workingDirectory: options.remoteCwd || profile.defaultRemoteCwd || '~',
    command: options.command || profile.remoteCommand || 'shell',
    windowId: options.windowId,
    paneId: options.paneId,
    ssh: await buildSSHSessionConfig(profile, vaultEntry, {
      remoteCwd: options.remoteCwd,
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
      skipBanner: profile.skipBanner,
      ...(options.remoteCwd || profile.defaultRemoteCwd ? { remoteCwd: options.remoteCwd || profile.defaultRemoteCwd } : {}),
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
  const pane: Pane = {
    id: options.paneId,
    cwd: options.remoteCwd || profile.defaultRemoteCwd || '~',
    command: options.command || profile.remoteCommand || 'shell',
    status: WindowStatus.Restoring,
    pid: null,
    backend: 'ssh',
    ssh: {
      profileId: profile.id,
      host: profile.host,
      port: profile.port,
      user: profile.user,
      authType: profile.auth,
      ...(options.remoteCwd || profile.defaultRemoteCwd ? { remoteCwd: options.remoteCwd || profile.defaultRemoteCwd } : {}),
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

  const unsubscribe = processManager.subscribePtyData(pid, (data: string) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      setImmediate(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('pty-data', {
            windowId,
            paneId,
            data,
            seq: processManager.getLatestPaneOutputSeq(paneId),
          });
        }
      });
    }
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
