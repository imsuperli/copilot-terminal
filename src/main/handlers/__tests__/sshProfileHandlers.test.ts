import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerSSHProfileHandlers } from '../sshProfileHandlers';
import type { HandlerContext } from '../HandlerContext';

const { mockIpcHandle } = vi.hoisted(() => ({
  mockIpcHandle: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: mockIpcHandle,
  },
}));

function getRegisteredHandler(channel: string) {
  const call = mockIpcHandle.mock.calls.find(([name]) => name === channel);
  expect(call, `IPC handler ${channel} should be registered`).toBeTruthy();
  return call?.[1] as (event: unknown, ...args: any[]) => Promise<unknown>;
}

describe('registerSSHProfileHandlers', () => {
  beforeEach(() => {
    mockIpcHandle.mockReset();
  });

  it('creates and lists SSH profiles through the profile store', async () => {
    const sshProfileStore = {
      list: vi.fn().mockResolvedValue([{ id: 'profile-1', name: 'prod-web-01' }]),
      get: vi.fn(),
      create: vi.fn().mockResolvedValue({ id: 'profile-1', name: 'prod-web-01' }),
      update: vi.fn(),
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

  it('removes vault secrets when deleting an SSH profile', async () => {
    const sshProfileStore = {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
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

    await removeKnownHostHandler({}, 'host-1');

    expect(sshVaultService.setPassword).toHaveBeenCalledWith('profile-1', 'secret');
    expect(sshVaultService.setPrivateKeyPassphrase).toHaveBeenCalledWith('profile-1', '/keys/id_ed25519', 'key-secret');
    expect(sshKnownHostsStore.remove).toHaveBeenCalledWith('host-1');
  });
});
