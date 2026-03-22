import { ipcMain } from 'electron';
import { HandlerContext } from './HandlerContext';
import { errorResponse, successResponse } from './HandlerResponse';
import { SSHProfileInput, SSHProfilePatch } from '../../shared/types/ssh';

export function registerSSHProfileHandlers(ctx: HandlerContext) {
  const {
    sshProfileStore,
    sshVaultService,
    sshKnownHostsStore,
  } = ctx;

  ipcMain.handle('list-ssh-profiles', async () => {
    try {
      if (!sshProfileStore) {
        throw new Error('SSH profile store not initialized');
      }

      return successResponse(await sshProfileStore.list());
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('get-ssh-profile', async (_event, profileId: string) => {
    try {
      if (!sshProfileStore) {
        throw new Error('SSH profile store not initialized');
      }

      const profile = await sshProfileStore.get(profileId);
      if (!profile) {
        throw new Error(`SSH profile not found: ${profileId}`);
      }

      return successResponse(profile);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('create-ssh-profile', async (_event, input: SSHProfileInput) => {
    try {
      if (!sshProfileStore) {
        throw new Error('SSH profile store not initialized');
      }

      return successResponse(await sshProfileStore.create(input));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('update-ssh-profile', async (_event, profileId: string, patch: SSHProfilePatch) => {
    try {
      if (!sshProfileStore) {
        throw new Error('SSH profile store not initialized');
      }

      return successResponse(await sshProfileStore.update(profileId, patch));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('delete-ssh-profile', async (_event, profileId: string) => {
    try {
      if (!sshProfileStore) {
        throw new Error('SSH profile store not initialized');
      }

      await sshProfileStore.remove(profileId);
      await sshVaultService?.remove(profileId);

      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('get-ssh-credential-state', async (_event, profileId: string) => {
    try {
      if (!sshVaultService) {
        throw new Error('SSH vault service not initialized');
      }

      return successResponse(await sshVaultService.getCredentialState(profileId));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('set-ssh-password', async (_event, profileId: string, password: string) => {
    try {
      if (!sshVaultService) {
        throw new Error('SSH vault service not initialized');
      }

      await sshVaultService.setPassword(profileId, password);
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('clear-ssh-password', async (_event, profileId: string) => {
    try {
      if (!sshVaultService) {
        throw new Error('SSH vault service not initialized');
      }

      await sshVaultService.clearPassword(profileId);
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('set-ssh-private-key-passphrase', async (_event, profileId: string, keyPath: string, passphrase: string) => {
    try {
      if (!sshVaultService) {
        throw new Error('SSH vault service not initialized');
      }

      await sshVaultService.setPrivateKeyPassphrase(profileId, keyPath, passphrase);
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('clear-ssh-private-key-passphrase', async (_event, profileId: string, keyPath: string) => {
    try {
      if (!sshVaultService) {
        throw new Error('SSH vault service not initialized');
      }

      await sshVaultService.clearPrivateKeyPassphrase(profileId, keyPath);
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('list-known-hosts', async () => {
    try {
      if (!sshKnownHostsStore) {
        throw new Error('SSH known hosts store not initialized');
      }

      return successResponse(await sshKnownHostsStore.list());
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('remove-known-host', async (_event, entryId: string) => {
    try {
      if (!sshKnownHostsStore) {
        throw new Error('SSH known hosts store not initialized');
      }

      await sshKnownHostsStore.remove(entryId);
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });
}
