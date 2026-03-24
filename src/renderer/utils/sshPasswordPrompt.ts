import type { SSHAuthType } from '../../shared/types/ssh';

export interface SSHPasswordPromptRequest {
  profileId: string;
  profileName: string;
  host: string;
  user: string;
  authType: SSHAuthType;
}

type SSHPasswordPromptHandler = (request: SSHPasswordPromptRequest) => Promise<string | null>;

export const SSH_PASSWORD_SAVED_EVENT = 'ssh-password-saved';

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

  const password = (await requestSSHPassword(request))?.trim();
  if (!password) {
    return false;
  }

  const saveResponse = await window.electronAPI.setSSHPassword(request.profileId, password);
  if (!saveResponse?.success) {
    throw new Error(saveResponse?.error || '保存 SSH 密码失败');
  }

  window.dispatchEvent(new CustomEvent(SSH_PASSWORD_SAVED_EVENT, {
    detail: {
      profileId: request.profileId,
    },
  }));

  return true;
}
