import type { SSHAuthType } from '../../shared/types/ssh';

export interface SSHPasswordPromptRequest {
  profileId: string;
  profileName: string;
  host: string;
  user: string;
  authType: SSHAuthType;
  retryMessage?: string;
}

type SSHPasswordPromptHandler = (request: SSHPasswordPromptRequest) => Promise<string | null>;

export const SSH_PASSWORD_SAVED_EVENT = 'ssh-password-saved';
export const SSH_PASSWORD_CLEARED_EVENT = 'ssh-password-cleared';

let sshPasswordPromptHandler: SSHPasswordPromptHandler | null = null;

export function authNeedsPassword(authType: SSHAuthType): boolean {
  return authType === 'password' || authType === 'keyboardInteractive';
}

export function setSSHPasswordPromptHandler(handler: SSHPasswordPromptHandler | null): void {
  sshPasswordPromptHandler = handler;
}

export async function requestSSHPassword(request: SSHPasswordPromptRequest): Promise<string | null> {
  if (!sshPasswordPromptHandler) {
    throw new Error('SSH password prompt is unavailable');
  }

  return sshPasswordPromptHandler(request);
}

function dispatchSSHPasswordSaved(profileId: string): void {
  window.dispatchEvent(new CustomEvent(SSH_PASSWORD_SAVED_EVENT, {
    detail: {
      profileId,
    },
  }));
}

export function dispatchSSHPasswordCleared(profileId: string): void {
  window.dispatchEvent(new CustomEvent(SSH_PASSWORD_CLEARED_EVENT, {
    detail: {
      profileId,
    },
  }));
}

export async function promptAndSaveSSHPassword(request: SSHPasswordPromptRequest): Promise<boolean> {
  const password = (await requestSSHPassword(request))?.trim();
  if (!password) {
    return false;
  }

  const saveResponse = await window.electronAPI.setSSHPassword(request.profileId, password);
  if (!saveResponse?.success) {
    throw new Error(saveResponse?.error || '保存 SSH 密码失败');
  }

  dispatchSSHPasswordSaved(request.profileId);

  return true;
}

export async function ensureSSHPasswordSaved(request: SSHPasswordPromptRequest): Promise<boolean> {
  if (!authNeedsPassword(request.authType)) {
    return true;
  }

  const credentialStateResponse = await window.electronAPI.getSSHCredentialState(request.profileId);
  const hasStoredPassword = credentialStateResponse?.success && credentialStateResponse.data
    ? credentialStateResponse.data.hasPassword
    : false;

  if (hasStoredPassword) {
    return true;
  }

  return promptAndSaveSSHPassword(request);
}
