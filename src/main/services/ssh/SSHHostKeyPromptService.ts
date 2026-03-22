import { BrowserWindow, dialog } from 'electron';

export type SSHHostKeyPromptReason = 'unknown' | 'mismatch';

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
    const buttons = [
      'Cancel',
      'Trust Once',
      request.reason === 'mismatch' ? 'Update Fingerprint and Trust' : 'Trust and Save',
    ];
    const options = {
      type: request.reason === 'mismatch' ? 'warning' : 'question',
      buttons,
      defaultId: 2,
      cancelId: 0,
      noLink: true,
      title: 'SSH Host Key Verification',
      message: request.reason === 'mismatch'
        ? `Host key fingerprint changed for ${request.host}:${request.port}`
        : `First-time SSH connection to ${request.host}:${request.port}`,
      detail: buildPromptDetail(request),
    } as const;
    const parentWindow = this.getMainWindow?.() ?? null;

    const response = parentWindow
      ? await dialog.showMessageBox(parentWindow, options)
      : await dialog.showMessageBox(options);

    if (response.response === 1) {
      return { trusted: true, persist: false };
    }

    if (response.response === 2) {
      return { trusted: true, persist: true };
    }

    return { trusted: false, persist: false };
  }
}

function buildPromptDetail(request: SSHHostKeyPromptRequest): string {
  const lines = [
    `Algorithm: ${request.algorithm}`,
    `Presented fingerprint: ${request.fingerprint}`,
  ];

  if (request.storedFingerprint) {
    lines.push(`Stored fingerprint: ${request.storedFingerprint}`);
  }

  lines.push(
    request.reason === 'mismatch'
      ? 'The stored fingerprint does not match the server response. Continue only if you trust the new host key.'
      : 'This host is not in the trusted hosts list yet.',
  );

  return lines.join('\n');
}
