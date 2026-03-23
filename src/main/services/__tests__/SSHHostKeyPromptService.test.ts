import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ElectronSSHHostKeyPromptService } from '../ssh/SSHHostKeyPromptService';

const SSH_HOST_KEY_PROMPT_CHANNEL = 'ssh-host-key-prompt';
const SSH_HOST_KEY_PROMPT_RESPONSE_CHANNEL = 'ssh-host-key-prompt-response';

const { ipcMain } = vi.hoisted(() => {
  const { EventEmitter } = require('events') as typeof import('events');
  return {
    ipcMain: new EventEmitter(),
  };
});

vi.mock('electron', () => ({
  ipcMain,
}));

function createMainWindow() {
  const { EventEmitter } = require('events') as typeof import('events');
  const window = new EventEmitter() as import('events').EventEmitter & {
    webContents: {
      send: ReturnType<typeof vi.fn>;
      isDestroyed: () => boolean;
    };
    isDestroyed: () => boolean;
  };

  window.webContents = {
    send: vi.fn(),
    isDestroyed: () => false,
  };
  window.isDestroyed = () => false;

  return window;
}

describe('ElectronSSHHostKeyPromptService', () => {
  beforeEach(() => {
    ipcMain.removeAllListeners();
  });

  it('emits a renderer prompt request and resolves with the renderer decision', async () => {
    const mainWindow = createMainWindow();
    const service = new ElectronSSHHostKeyPromptService({
      getMainWindow: () => mainWindow as any,
    });

    const confirmPromise = service.confirm({
      host: '10.0.0.21',
      port: 22,
      algorithm: 'ssh-ed25519',
      fingerprint: 'SHA256:new',
      reason: 'unknown',
    });

    expect(mainWindow.webContents.send).toHaveBeenCalledWith(
      SSH_HOST_KEY_PROMPT_CHANNEL,
      expect.objectContaining({
        host: '10.0.0.21',
        port: 22,
        algorithm: 'ssh-ed25519',
        fingerprint: 'SHA256:new',
        reason: 'unknown',
        requestId: expect.any(String),
      }),
    );

    const payload = mainWindow.webContents.send.mock.calls[0][1];
    ipcMain.emit(SSH_HOST_KEY_PROMPT_RESPONSE_CHANNEL, {}, {
      requestId: payload.requestId,
      trusted: true,
      persist: true,
    });

    await expect(confirmPromise).resolves.toEqual({
      trusted: true,
      persist: true,
    });
  });

  it('falls back to cancel when the main window closes before the renderer responds', async () => {
    const mainWindow = createMainWindow();
    const service = new ElectronSSHHostKeyPromptService({
      getMainWindow: () => mainWindow as any,
    });

    const confirmPromise = service.confirm({
      host: '10.0.0.21',
      port: 22,
      algorithm: 'ssh-ed25519',
      fingerprint: 'SHA256:new',
      reason: 'mismatch',
      storedFingerprint: 'SHA256:old',
    });

    mainWindow.emit('closed');

    await expect(confirmPromise).resolves.toEqual({
      trusted: false,
      persist: false,
    });
  });
});

