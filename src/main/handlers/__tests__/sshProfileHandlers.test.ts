import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerSSHProfileHandlers } from '../sshProfileHandlers';
import type { HandlerContext } from '../HandlerContext';

const { mockIpcHandle } = vi.hoisted(() => ({
  mockIpcHandle: vi.fn(),
}));

const { mockImportProfiles, mockDetectPrivateKeys } = vi.hoisted(() => ({
  mockImportProfiles: vi.fn(),
  mockDetectPrivateKeys: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: mockIpcHandle,
  },
}));

vi.mock('../../services/ssh/OpenSSHProfileImporter', () => ({
  OpenSSHProfileImporter: vi.fn().mockImplementation(() => ({
    importProfiles: mockImportProfiles,
    detectPrivateKeys: mockDetectPrivateKeys,
  })),
}));

function getRegisteredHandler(channel: string) {
  const call = mockIpcHandle.mock.calls.find(([name]) => name === channel);
  expect(call, `IPC handler ${channel} should be registered`).toBeTruthy();
  return call?.[1] as (event: unknown, ...args: any[]) => Promise<unknown>;
}

describe('registerSSHProfileHandlers', () => {
  beforeEach(() => {
    mockIpcHandle.mockReset();
    mockImportProfiles.mockReset();
    mockDetectPrivateKeys.mockReset();
    mockImportProfiles.mockResolvedValue([]);
    mockDetectPrivateKeys.mockResolvedValue([]);
  });

  it('creates and lists SSH profiles through the profile store', async () => {
    const sshProfileStore = {
      list: vi.fn().mockResolvedValue([{ id: 'profile-1', name: 'prod-web-01' }]),
      get: vi.fn(),
      create: vi.fn().mockResolvedValue({ id: 'profile-1', name: 'prod-web-01' }),
      update: vi.fn(),
      upsert: vi.fn(),
      remove: vi.fn(),
    };

    registerSSHProfileHandlers({
      mainWindow: null,
      processManager: null,
      statusPoller: null,
      viewSwitcher: null,
      workspaceManager: null,
      autoSaveManager: null,
      ptySubscriptionManager: null,
      gitBranchWatcher: null,
      currentWorkspace: null,
      getCurrentWorkspace: () => null,
      setCurrentWorkspace: () => undefined,
      sshProfileStore: sshProfileStore as any,
      sshVaultService: null,
      sshKnownHostsStore: null,
    } as HandlerContext);

    const createHandler = getRegisteredHandler('create-ssh-profile');
    const listHandler = getRegisteredHandler('list-ssh-profiles');

    const createResponse = await createHandler({}, { name: 'prod-web-01' });
    const listResponse = await listHandler({});

    expect(sshProfileStore.create).toHaveBeenCalledWith({ name: 'prod-web-01' });
    expect(createResponse).toEqual({
      success: true,
      data: { id: 'profile-1', name: 'prod-web-01' },
    });
    expect(listResponse).toEqual({
      success: true,
      data: [{ id: 'profile-1', name: 'prod-web-01' }],
    });
  });

  it('exposes the SSH algorithm catalog for profile editing', async () => {
    registerSSHProfileHandlers({
      mainWindow: null,
      processManager: null,
      statusPoller: null,
      viewSwitcher: null,
      workspaceManager: null,
      autoSaveManager: null,
      ptySubscriptionManager: null,
      gitBranchWatcher: null,
      currentWorkspace: null,
      getCurrentWorkspace: () => null,
      setCurrentWorkspace: () => undefined,
      sshProfileStore: null,
      sshVaultService: null,
      sshKnownHostsStore: null,
    } as HandlerContext);

    const handler = getRegisteredHandler('get-ssh-algorithm-catalog');
    const response = await handler({});

    expect(response).toEqual({
      success: true,
      data: expect.objectContaining({
        defaults: expect.objectContaining({
          kex: expect.any(Array),
          hostKey: expect.any(Array),
          cipher: expect.any(Array),
          hmac: expect.any(Array),
          compression: expect.any(Array),
        }),
        supported: expect.objectContaining({
          kex: expect.any(Array),
          hostKey: expect.any(Array),
          cipher: expect.any(Array),
          hmac: expect.any(Array),
          compression: expect.any(Array),
        }),
      }),
    });
  });

  it('removes vault secrets when deleting an SSH profile', async () => {
    const sshProfileStore = {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    const sshVaultService = {
      remove: vi.fn().mockResolvedValue(undefined),
    };

    registerSSHProfileHandlers({
      mainWindow: null,
      processManager: null,
      statusPoller: null,
      viewSwitcher: null,
      workspaceManager: null,
      autoSaveManager: null,
      ptySubscriptionManager: null,
      gitBranchWatcher: null,
      currentWorkspace: null,
      getCurrentWorkspace: () => null,
      setCurrentWorkspace: () => undefined,
      sshProfileStore: sshProfileStore as any,
      sshVaultService: sshVaultService as any,
      sshKnownHostsStore: null,
    } as HandlerContext);

    const deleteHandler = getRegisteredHandler('delete-ssh-profile');
    const response = await deleteHandler({}, 'profile-1');

    expect(sshProfileStore.remove).toHaveBeenCalledWith('profile-1');
    expect(sshVaultService.remove).toHaveBeenCalledWith('profile-1');
    expect(response).toEqual({ success: true, data: undefined });
  });

  it('routes vault and known-host requests to the correct services', async () => {
    const sshVaultService = {
      getCredentialState: vi.fn().mockResolvedValue({ hasPassword: true, hasPassphrase: false }),
      setPassword: vi.fn().mockResolvedValue(undefined),
      clearPassword: vi.fn().mockResolvedValue(undefined),
      setPrivateKeyPassphrase: vi.fn().mockResolvedValue(undefined),
      clearPrivateKeyPassphrase: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn(),
    };
    const sshKnownHostsStore = {
      list: vi.fn().mockResolvedValue([{ id: 'host-1' }]),
      remove: vi.fn().mockResolvedValue(undefined),
    };

    registerSSHProfileHandlers({
      mainWindow: null,
      processManager: null,
      statusPoller: null,
      viewSwitcher: null,
      workspaceManager: null,
      autoSaveManager: null,
      ptySubscriptionManager: null,
      gitBranchWatcher: null,
      currentWorkspace: null,
      getCurrentWorkspace: () => null,
      setCurrentWorkspace: () => undefined,
      sshProfileStore: null,
      sshVaultService: sshVaultService as any,
      sshKnownHostsStore: sshKnownHostsStore as any,
    } as HandlerContext);

    const credentialStateHandler = getRegisteredHandler('get-ssh-credential-state');
    const setPasswordHandler = getRegisteredHandler('set-ssh-password');
    const setPassphraseHandler = getRegisteredHandler('set-ssh-private-key-passphrase');
    const detectPrivateKeysHandler = getRegisteredHandler('detect-local-ssh-private-keys');
    const listKnownHostsHandler = getRegisteredHandler('list-known-hosts');
    const removeKnownHostHandler = getRegisteredHandler('remove-known-host');

    expect(await credentialStateHandler({}, 'profile-1')).toEqual({
      success: true,
      data: { hasPassword: true, hasPassphrase: false },
    });

    await setPasswordHandler({}, 'profile-1', 'secret');
    await setPassphraseHandler({}, 'profile-1', '/keys/id_ed25519', 'key-secret');

    expect(await listKnownHostsHandler({})).toEqual({
      success: true,
      data: [{ id: 'host-1' }],
    });
    expect(await detectPrivateKeysHandler({})).toEqual({
      success: true,
      data: [],
    });

    await removeKnownHostHandler({}, 'host-1');

    expect(sshVaultService.setPassword).toHaveBeenCalledWith('profile-1', 'secret');
    expect(sshVaultService.setPrivateKeyPassphrase).toHaveBeenCalledWith('profile-1', '/keys/id_ed25519', 'key-secret');
    expect(sshKnownHostsStore.remove).toHaveBeenCalledWith('host-1');
  });

  it('imports OpenSSH profiles through the importer service and upserts them into the store', async () => {
    mockImportProfiles.mockResolvedValue([
      {
        id: 'openssh-config:app',
        input: {
          name: 'app (.ssh/config)',
          host: '10.0.0.21',
          port: 2222,
          user: 'deploy',
          auth: 'publicKey',
          privateKeys: ['/home/test/.ssh/id_ed25519'],
          keepaliveInterval: 15,
          keepaliveCountMax: 4,
          readyTimeout: 10000,
          verifyHostKeys: true,
          x11: false,
          skipBanner: false,
          agentForward: true,
          warnOnClose: true,
          reuseSession: true,
          forwardedPorts: [],
          tags: [],
        },
      },
    ]);

    const sshProfileStore = {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn().mockImplementation(async (profile) => profile),
      remove: vi.fn(),
    };

    registerSSHProfileHandlers({
      mainWindow: null,
      processManager: null,
      statusPoller: null,
      viewSwitcher: null,
      workspaceManager: null,
      autoSaveManager: null,
      ptySubscriptionManager: null,
      gitBranchWatcher: null,
      currentWorkspace: null,
      getCurrentWorkspace: () => null,
      setCurrentWorkspace: () => undefined,
      sshProfileStore: sshProfileStore as any,
      sshVaultService: null,
      sshKnownHostsStore: null,
    } as HandlerContext);

    const importHandler = getRegisteredHandler('import-openssh-profiles');
    const response = await importHandler({});

    expect(mockImportProfiles).toHaveBeenCalledTimes(1);
    expect(sshProfileStore.upsert).toHaveBeenCalledWith(expect.objectContaining({
      id: 'openssh-config:app',
      name: 'app (.ssh/config)',
      host: '10.0.0.21',
      port: 2222,
      user: 'deploy',
      auth: 'publicKey',
      privateKeys: ['/home/test/.ssh/id_ed25519'],
    }));
    expect(response).toEqual({
      success: true,
      data: {
        profiles: [
          expect.objectContaining({
            id: 'openssh-config:app',
            name: 'app (.ssh/config)',
          }),
        ],
        createdCount: 1,
        updatedCount: 0,
        skippedCount: 0,
      },
    });
  });
});
