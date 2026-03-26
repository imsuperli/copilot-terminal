import type { IpcResponse } from '../../shared/types/electron-api';
import { SSH_AUTH_FAILED_ERROR_CODE } from '../../shared/types/electron-api';
import {
  authNeedsPassword,
  dispatchSSHPasswordCleared,
  ensureSSHPasswordSaved,
  promptAndSaveSSHPassword,
  type SSHPasswordPromptRequest,
} from './sshPasswordPrompt';

export const SSH_PASSWORD_PROMPT_CANCELLED_ERROR = 'SSH password entry was cancelled';

export function isSSHPasswordPromptCancelled(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message === SSH_PASSWORD_PROMPT_CANCELLED_ERROR;
}

export async function runSSHActionWithPasswordRetry<T>(options: {
  request: SSHPasswordPromptRequest;
  action: () => Promise<IpcResponse<T>>;
}): Promise<IpcResponse<T>> {
  const { request, action } = options;
  let retryMessage: string | undefined;

  while (true) {
    const shouldContinue = retryMessage
      ? await promptForReplacementPassword({ ...request, retryMessage })
      : await ensureSSHPasswordSaved(request);

    if (!shouldContinue) {
      return {
        success: false,
        error: SSH_PASSWORD_PROMPT_CANCELLED_ERROR,
      };
    }

    const response = await action();
    if (!isSSHAuthenticationFailure(response) || !authNeedsPassword(request.authType)) {
      return response;
    }

    retryMessage = response.error;
  }
}

async function promptForReplacementPassword(request: SSHPasswordPromptRequest): Promise<boolean> {
  const clearResponse = await window.electronAPI.clearSSHPassword(request.profileId);
  if (!clearResponse?.success) {
    throw new Error(clearResponse?.error || '清除已保存的 SSH 密码失败');
  }

  dispatchSSHPasswordCleared(request.profileId);
  return promptAndSaveSSHPassword(request);
}

function isSSHAuthenticationFailure(response: IpcResponse<unknown> | null | undefined): boolean {
  if (!response || response.success) {
    return false;
  }

  if (response.errorCode === SSH_AUTH_FAILED_ERROR_CODE) {
    return true;
  }

  const normalizedMessage = response.error?.trim().toLowerCase() ?? '';
  return normalizedMessage.includes('authentication failed')
    || normalizedMessage.includes('all configured authentication methods failed');
}
