import { randomUUID } from 'crypto';
import { BrowserWindow, ipcMain } from 'electron';
import {
  SSH_HOST_KEY_PROMPT_CHANNEL,
  SSH_HOST_KEY_PROMPT_RESPONSE_CHANNEL,
} from '../../../shared/types/electron-api';
import type {
  SSHHostKeyPromptPayload,
  SSHHostKeyPromptReason,
  SSHHostKeyPromptResponse,
} from '../../../shared/types/electron-api';

export type { SSHHostKeyPromptReason };

export interface SSHHostKeyPromptRequest {
  host: string;
  port: number;
  algorithm: string;
  fingerprint: string;
  reason: SSHHostKeyPromptReason;
  storedFingerprint?: string;
}

export interface SSHHostKeyPromptDecision {
  trusted: boolean;
  persist: boolean;
}

export interface ISSHHostKeyPromptService {
  confirm(request: SSHHostKeyPromptRequest): Promise<SSHHostKeyPromptDecision>;
}

export interface ElectronSSHHostKeyPromptServiceOptions {
  getMainWindow?: () => BrowserWindow | null;
}

export class ElectronSSHHostKeyPromptService implements ISSHHostKeyPromptService {
  private readonly getMainWindow?: () => BrowserWindow | null;

  constructor(options: ElectronSSHHostKeyPromptServiceOptions = {}) {
    this.getMainWindow = options.getMainWindow;
  }

  async confirm(request: SSHHostKeyPromptRequest): Promise<SSHHostKeyPromptDecision> {
    const parentWindow = this.getMainWindow?.() ?? null;

    if (!parentWindow || parentWindow.isDestroyed() || parentWindow.webContents.isDestroyed()) {
      return { trusted: false, persist: false };
    }

    const payload: SSHHostKeyPromptPayload = {
      requestId: randomUUID(),
      ...request,
    };

    return new Promise<SSHHostKeyPromptDecision>((resolve) => {
      let settled = false;

      const settle = (decision: SSHHostKeyPromptDecision) => {
        if (settled) {
          return;
        }

        settled = true;
        ipcMain.removeListener(SSH_HOST_KEY_PROMPT_RESPONSE_CHANNEL, handleResponse);
        parentWindow.removeListener('closed', handleClosed);
        resolve(decision);
      };

      const handleResponse = (_event: unknown, response: SSHHostKeyPromptResponse) => {
        if (!response || response.requestId !== payload.requestId) {
          return;
        }

        settle({
          trusted: Boolean(response.trusted),
          persist: Boolean(response.persist),
        });
      };

      const handleClosed = () => {
        settle({ trusted: false, persist: false });
      };

      ipcMain.on(SSH_HOST_KEY_PROMPT_RESPONSE_CHANNEL, handleResponse);
      parentWindow.once('closed', handleClosed);
      parentWindow.webContents.send(SSH_HOST_KEY_PROMPT_CHANNEL, payload);
    });
  }
}
