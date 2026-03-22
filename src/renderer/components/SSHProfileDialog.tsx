import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from './ui/Dialog';
import { Button } from './ui/Button';
import { useI18n } from '../i18n';
import { SSHAuthType, SSHCredentialState, SSHProfile, SSHProfileInput } from '../../shared/types/ssh';

interface SSHProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile?: SSHProfile | null;
  credentialState?: SSHCredentialState | null;
  onSaved: (profile: SSHProfile, credentialState: SSHCredentialState) => void;
}

interface SSHProfileFormState {
  name: string;
  host: string;
  port: string;
  user: string;
  auth: SSHAuthType;
  privateKeysText: string;
  defaultRemoteCwd: string;
  remoteCommand: string;
  keepaliveInterval: string;
  keepaliveCountMax: string;
  readyTimeout: string;
  verifyHostKeys: boolean;
  agentForward: boolean;
  skipBanner: boolean;
  warnOnClose: boolean;
  reuseSession: boolean;
  tagsText: string;
  notes: string;
}

const DEFAULT_CREDENTIAL_STATE: SSHCredentialState = {
  hasPassword: false,
  hasPassphrase: false,
};

function uniqueList(values: string[]): string[] {
  return Array.from(new Set(values));
}

function parseLineList(value: string): string[] {
  return uniqueList(
    value
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function parseTagList(value: string): string[] {
  return uniqueList(
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function trimOptional(value: string): string | undefined {
  const normalized = value.trim();
  return normalized || undefined;
}

function createInitialForm(profile?: SSHProfile | null): SSHProfileFormState {
  return {
    name: profile?.name ?? '',
    host: profile?.host ?? '',
    port: String(profile?.port ?? 22),
    user: profile?.user ?? '',
    auth: profile?.auth ?? 'password',
    privateKeysText: profile?.privateKeys.join('\n') ?? '',
    defaultRemoteCwd: profile?.defaultRemoteCwd ?? '',
    remoteCommand: profile?.remoteCommand ?? '',
    keepaliveInterval: String(profile?.keepaliveInterval ?? 30),
    keepaliveCountMax: String(profile?.keepaliveCountMax ?? 3),
    readyTimeout: profile?.readyTimeout ? String(profile.readyTimeout) : '',
    verifyHostKeys: profile?.verifyHostKeys ?? true,
    agentForward: profile?.agentForward ?? false,
    skipBanner: profile?.skipBanner ?? false,
    warnOnClose: profile?.warnOnClose ?? true,
    reuseSession: profile?.reuseSession ?? true,
    tagsText: profile?.tags.join(', ') ?? '',
    notes: profile?.notes ?? '',
  };
}

function readCredentialState(value?: SSHCredentialState | null): SSHCredentialState {
  return value ?? DEFAULT_CREDENTIAL_STATE;
}

export function SSHProfileDialog({
  open,
  onOpenChange,
  profile,
  credentialState,
  onSaved,
}: SSHProfileDialogProps) {
  const { t } = useI18n();
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<SSHProfileFormState>(() => createInitialForm(profile));
  const [password, setPassword] = useState('');
  const [clearStoredPassword, setClearStoredPassword] = useState(false);
  const [clearStoredPassphrases, setClearStoredPassphrases] = useState(false);
  const [passphrases, setPassphrases] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [detectKeysMessage, setDetectKeysMessage] = useState('');
  const [isDetectingKeys, setIsDetectingKeys] = useState(false);

  const currentCredentialState = readCredentialState(credentialState);
  const currentPrivateKeys = useMemo(
    () => parseLineList(form.privateKeysText),
    [form.privateKeysText],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    setForm(createInitialForm(profile));
    setPassword('');
    setClearStoredPassword(false);
    setClearStoredPassphrases(false);
    setPassphrases({});
    setSaveError('');
    setDetectKeysMessage('');

    setTimeout(() => {
      nameInputRef.current?.focus();
    }, 0);
  }, [open, profile]);

  useEffect(() => {
    setPassphrases((previous) => {
      const next: Record<string, string> = {};
      currentPrivateKeys.forEach((keyPath) => {
        next[keyPath] = previous[keyPath] ?? '';
      });
      return next;
    });
  }, [currentPrivateKeys]);

  const setField = <K extends keyof SSHProfileFormState>(field: K, value: SSHProfileFormState[K]) => {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const profileHasUnsupportedRouting = Boolean(
    profile?.jumpHostProfileId
    || profile?.proxyCommand
    || profile?.socksProxyHost
    || profile?.httpProxyHost,
  );

  const authNeedsPassword = form.auth === 'password' || form.auth === 'keyboardInteractive';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaveError('');

    const name = form.name.trim();
    const host = form.host.trim();
    const user = form.user.trim();
    const privateKeys = parseLineList(form.privateKeysText);
    const tags = parseTagList(form.tagsText);
    const passwordValue = password.trim();

    const port = Number(form.port);
    const keepaliveInterval = Number(form.keepaliveInterval);
    const keepaliveCountMax = Number(form.keepaliveCountMax);
    const readyTimeout = form.readyTimeout.trim() ? Number(form.readyTimeout) : null;

    if (!name || !host || !user) {
      setSaveError(t('sshProfileDialog.error.required'));
      return;
    }

    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      setSaveError(t('sshProfileDialog.error.port'));
      return;
    }

    if (!Number.isInteger(keepaliveInterval) || keepaliveInterval < 0) {
      setSaveError(t('sshProfileDialog.error.keepaliveInterval'));
      return;
    }

    if (!Number.isInteger(keepaliveCountMax) || keepaliveCountMax < 0) {
      setSaveError(t('sshProfileDialog.error.keepaliveCount'));
      return;
    }

    if (readyTimeout !== null && (!Number.isInteger(readyTimeout) || readyTimeout <= 0)) {
      setSaveError(t('sshProfileDialog.error.readyTimeout'));
      return;
    }

    if (form.auth === 'publicKey' && privateKeys.length === 0) {
      setSaveError(t('sshProfileDialog.error.privateKeysRequired'));
      return;
    }

    const hasPasswordAfterSave = Boolean(passwordValue)
      || (authNeedsPassword && !clearStoredPassword && currentCredentialState.hasPassword);
    if (authNeedsPassword && !hasPasswordAfterSave) {
      setSaveError(t('sshProfileDialog.error.passwordRequired'));
      return;
    }

    const input: SSHProfileInput = {
      name,
      host,
      port,
      user,
      auth: form.auth,
      privateKeys,
      keepaliveInterval,
      keepaliveCountMax,
      readyTimeout,
      verifyHostKeys: form.verifyHostKeys,
      x11: profile?.x11 ?? false,
      skipBanner: form.skipBanner,
      jumpHostProfileId: profile?.jumpHostProfileId,
      agentForward: form.agentForward,
      warnOnClose: form.warnOnClose,
      proxyCommand: profile?.proxyCommand,
      socksProxyHost: profile?.socksProxyHost,
      socksProxyPort: profile?.socksProxyPort,
      httpProxyHost: profile?.httpProxyHost,
      httpProxyPort: profile?.httpProxyPort,
      reuseSession: form.reuseSession,
      forwardedPorts: profile?.forwardedPorts ?? [],
      remoteCommand: trimOptional(form.remoteCommand),
      defaultRemoteCwd: trimOptional(form.defaultRemoteCwd),
      tags,
      notes: trimOptional(form.notes),
      icon: profile?.icon,
      color: profile?.color,
    };

    setIsSaving(true);
    try {
      const response = profile
        ? await window.electronAPI.updateSSHProfile(profile.id, input)
        : await window.electronAPI.createSSHProfile(input);

      if (!response?.success || !response.data) {
        throw new Error(response?.error || t('sshProfileDialog.error.saveFailed'));
      }

      const savedProfile = response.data;
      const existingPrivateKeys = profile?.privateKeys ?? [];

      if (authNeedsPassword) {
        if (passwordValue) {
          await window.electronAPI.setSSHPassword(savedProfile.id, passwordValue);
        } else if (clearStoredPassword && currentCredentialState.hasPassword) {
          await window.electronAPI.clearSSHPassword(savedProfile.id);
        }
      } else if (currentCredentialState.hasPassword) {
        await window.electronAPI.clearSSHPassword(savedProfile.id);
      }

      const keysToClear = new Set<string>();
      if (clearStoredPassphrases || form.auth !== 'publicKey') {
        [...existingPrivateKeys, ...currentPrivateKeys].forEach((keyPath) => keysToClear.add(keyPath));
      } else {
        existingPrivateKeys
          .filter((keyPath) => !currentPrivateKeys.includes(keyPath))
          .forEach((keyPath) => keysToClear.add(keyPath));
      }

      await Promise.all(
        Array.from(keysToClear).map((keyPath) => (
          window.electronAPI.clearSSHPrivateKeyPassphrase(savedProfile.id, keyPath)
        )),
      );

      if (form.auth === 'publicKey') {
        await Promise.all(
          currentPrivateKeys
            .filter((keyPath) => passphrases[keyPath]?.trim())
            .map((keyPath) => (
              window.electronAPI.setSSHPrivateKeyPassphrase(savedProfile.id, keyPath, passphrases[keyPath].trim())
            )),
        );
      }

      const credentialStateResponse = await window.electronAPI.getSSHCredentialState(savedProfile.id);
      const nextCredentialState = credentialStateResponse?.success && credentialStateResponse.data
        ? credentialStateResponse.data
        : DEFAULT_CREDENTIAL_STATE;

      onSaved(savedProfile, nextCredentialState);
      onOpenChange(false);
    } catch (error) {
      setSaveError((error as Error).message || t('sshProfileDialog.error.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDetectPrivateKeys = async () => {
    setDetectKeysMessage('');
    setIsDetectingKeys(true);

    try {
      const response = await window.electronAPI.detectLocalSSHPrivateKeys();
      if (!response?.success || !response.data) {
        throw new Error(response?.error || t('sshProfileDialog.detectKeysError'));
      }

      if (response.data.length === 0) {
        setDetectKeysMessage(t('sshProfileDialog.detectKeysEmpty'));
        return;
      }

      const mergedKeys = uniqueList([
        ...parseLineList(form.privateKeysText),
        ...response.data,
      ]);
      setField('privateKeysText', mergedKeys.join('\n'));
      setDetectKeysMessage(t('sshProfileDialog.detectKeysSuccess', { count: response.data.length }));
    } catch (error) {
      setDetectKeysMessage((error as Error).message || t('sshProfileDialog.detectKeysError'));
    } finally {
      setIsDetectingKeys(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={profile ? t('sshProfileDialog.editTitle') : t('sshProfileDialog.createTitle')}
      description={t('sshProfileDialog.description')}
      contentClassName="max-w-[760px]"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label htmlFor="ssh-profile-name" className="block text-sm font-medium text-text-primary mb-2">
              {t('sshProfileDialog.nameLabel')}
            </label>
            <input
              id="ssh-profile-name"
              ref={nameInputRef}
              type="text"
              value={form.name}
              onChange={(event) => setField('name', event.target.value)}
              className="w-full px-3 py-2 bg-bg-app border border-border-subtle rounded text-text-primary placeholder-text-disabled focus:outline-none focus:ring-2 focus:ring-status-running"
            />
          </div>

          <div>
            <label htmlFor="ssh-profile-host" className="block text-sm font-medium text-text-primary mb-2">
              {t('sshProfileDialog.hostLabel')}
            </label>
            <input
              id="ssh-profile-host"
              type="text"
              value={form.host}
              onChange={(event) => setField('host', event.target.value)}
              className="w-full px-3 py-2 bg-bg-app border border-border-subtle rounded text-text-primary placeholder-text-disabled focus:outline-none focus:ring-2 focus:ring-status-running"
            />
          </div>

          <div>
            <label htmlFor="ssh-profile-port" className="block text-sm font-medium text-text-primary mb-2">
              {t('sshProfileDialog.portLabel')}
            </label>
            <input
              id="ssh-profile-port"
              type="number"
              min="1"
              max="65535"
              value={form.port}
              onChange={(event) => setField('port', event.target.value)}
              className="w-full px-3 py-2 bg-bg-app border border-border-subtle rounded text-text-primary placeholder-text-disabled focus:outline-none focus:ring-2 focus:ring-status-running"
            />
          </div>

          <div>
            <label htmlFor="ssh-profile-user" className="block text-sm font-medium text-text-primary mb-2">
              {t('sshProfileDialog.userLabel')}
            </label>
            <input
              id="ssh-profile-user"
              type="text"
              value={form.user}
              onChange={(event) => setField('user', event.target.value)}
              className="w-full px-3 py-2 bg-bg-app border border-border-subtle rounded text-text-primary placeholder-text-disabled focus:outline-none focus:ring-2 focus:ring-status-running"
            />
          </div>

          <div>
            <label htmlFor="ssh-profile-auth" className="block text-sm font-medium text-text-primary mb-2">
              {t('sshProfileDialog.authLabel')}
            </label>
            <select
              id="ssh-profile-auth"
              value={form.auth}
              onChange={(event) => setField('auth', event.target.value as SSHAuthType)}
              className="w-full px-3 py-2 bg-bg-app border border-border-subtle rounded text-text-primary focus:outline-none focus:ring-2 focus:ring-status-running"
            >
              <option value="password">{t('ssh.auth.password')}</option>
              <option value="publicKey">{t('ssh.auth.publicKey')}</option>
              <option value="agent">{t('ssh.auth.agent')}</option>
              <option value="keyboardInteractive">{t('ssh.auth.keyboardInteractive')}</option>
            </select>
          </div>

          <div>
            <label htmlFor="ssh-profile-remote-cwd" className="block text-sm font-medium text-text-primary mb-2">
              {t('sshProfileDialog.remoteCwdLabel')}
            </label>
            <input
              id="ssh-profile-remote-cwd"
              type="text"
              value={form.defaultRemoteCwd}
              onChange={(event) => setField('defaultRemoteCwd', event.target.value)}
              placeholder="~"
              className="w-full px-3 py-2 bg-bg-app border border-border-subtle rounded text-text-primary placeholder-text-disabled focus:outline-none focus:ring-2 focus:ring-status-running"
            />
          </div>

          <div>
            <label htmlFor="ssh-profile-remote-command" className="block text-sm font-medium text-text-primary mb-2">
              {t('sshProfileDialog.remoteCommandLabel')}
            </label>
            <input
              id="ssh-profile-remote-command"
              type="text"
              value={form.remoteCommand}
              onChange={(event) => setField('remoteCommand', event.target.value)}
              className="w-full px-3 py-2 bg-bg-app border border-border-subtle rounded text-text-primary placeholder-text-disabled focus:outline-none focus:ring-2 focus:ring-status-running"
            />
          </div>
        </div>

        {form.auth === 'publicKey' && (
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label htmlFor="ssh-profile-keys" className="block text-sm font-medium text-text-primary">
                {t('sshProfileDialog.privateKeysLabel')}
              </label>
              <button
                type="button"
                onClick={handleDetectPrivateKeys}
                disabled={isDetectingKeys}
                className="text-xs text-status-running hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDetectingKeys ? t('common.loading') : t('sshProfileDialog.detectKeys')}
              </button>
            </div>
            <textarea
              id="ssh-profile-keys"
              value={form.privateKeysText}
              onChange={(event) => setField('privateKeysText', event.target.value)}
              placeholder={t('sshProfileDialog.privateKeysPlaceholder')}
              rows={4}
              className="w-full px-3 py-2 bg-bg-app border border-border-subtle rounded text-text-primary placeholder-text-disabled focus:outline-none focus:ring-2 focus:ring-status-running"
            />
            {detectKeysMessage && (
              <p className="mt-2 text-xs text-text-secondary">
                {detectKeysMessage}
              </p>
            )}

            {currentPrivateKeys.length > 0 && (
              <div className="mt-3 space-y-3">
                {currentCredentialState.hasPassphrase && (
                  <div className="flex items-center justify-between gap-3 text-xs text-text-secondary bg-bg-app border border-border-subtle rounded px-3 py-2">
                    <span>{t('sshProfileDialog.passphraseHint')}</span>
                    <button
                      type="button"
                      onClick={() => setClearStoredPassphrases((value) => !value)}
                      className={`text-xs ${clearStoredPassphrases ? 'text-status-error' : 'text-status-running'}`}
                    >
                      {t('sshProfileDialog.clearSavedPassphrases')}
                    </button>
                  </div>
                )}

                {currentPrivateKeys.map((keyPath) => (
                  <div key={keyPath}>
                    <label className="block text-xs font-medium text-text-secondary mb-1">
                      {keyPath}
                    </label>
                    <input
                      type="password"
                      value={passphrases[keyPath] ?? ''}
                      onChange={(event) => setPassphrases((previous) => ({
                        ...previous,
                        [keyPath]: event.target.value,
                      }))}
                      placeholder={t('sshProfileDialog.passphraseInputPlaceholder')}
                      className="w-full px-3 py-2 bg-bg-app border border-border-subtle rounded text-text-primary placeholder-text-disabled focus:outline-none focus:ring-2 focus:ring-status-running"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {authNeedsPassword && (
          <div>
            <label htmlFor="ssh-profile-password" className="block text-sm font-medium text-text-primary mb-2">
              {t('sshProfileDialog.passwordLabel')}
            </label>
            <input
              id="ssh-profile-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t('sshProfileDialog.passwordPlaceholder')}
              className="w-full px-3 py-2 bg-bg-app border border-border-subtle rounded text-text-primary placeholder-text-disabled focus:outline-none focus:ring-2 focus:ring-status-running"
            />

            {currentCredentialState.hasPassword && (
              <div className="mt-2 flex items-center justify-between gap-3 text-xs text-text-secondary bg-bg-app border border-border-subtle rounded px-3 py-2">
                <span>{t('sshProfileDialog.savedPasswordHint')}</span>
                <button
                  type="button"
                  onClick={() => setClearStoredPassword((value) => !value)}
                  className={`text-xs ${clearStoredPassword ? 'text-status-error' : 'text-status-running'}`}
                >
                  {t('sshProfileDialog.clearSavedPassword')}
                </button>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="ssh-profile-keepalive-interval" className="block text-sm font-medium text-text-primary mb-2">
              {t('sshProfileDialog.keepaliveIntervalLabel')}
            </label>
            <input
              id="ssh-profile-keepalive-interval"
              type="number"
              min="0"
              value={form.keepaliveInterval}
              onChange={(event) => setField('keepaliveInterval', event.target.value)}
              className="w-full px-3 py-2 bg-bg-app border border-border-subtle rounded text-text-primary placeholder-text-disabled focus:outline-none focus:ring-2 focus:ring-status-running"
            />
          </div>

          <div>
            <label htmlFor="ssh-profile-keepalive-count" className="block text-sm font-medium text-text-primary mb-2">
              {t('sshProfileDialog.keepaliveCountLabel')}
            </label>
            <input
              id="ssh-profile-keepalive-count"
              type="number"
              min="0"
              value={form.keepaliveCountMax}
              onChange={(event) => setField('keepaliveCountMax', event.target.value)}
              className="w-full px-3 py-2 bg-bg-app border border-border-subtle rounded text-text-primary placeholder-text-disabled focus:outline-none focus:ring-2 focus:ring-status-running"
            />
          </div>

          <div>
            <label htmlFor="ssh-profile-ready-timeout" className="block text-sm font-medium text-text-primary mb-2">
              {t('sshProfileDialog.readyTimeoutLabel')}
            </label>
            <input
              id="ssh-profile-ready-timeout"
              type="number"
              min="1"
              value={form.readyTimeout}
              onChange={(event) => setField('readyTimeout', event.target.value)}
              className="w-full px-3 py-2 bg-bg-app border border-border-subtle rounded text-text-primary placeholder-text-disabled focus:outline-none focus:ring-2 focus:ring-status-running"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex items-center gap-2 text-sm text-text-primary">
            <input
              type="checkbox"
              checked={form.verifyHostKeys}
              onChange={(event) => setField('verifyHostKeys', event.target.checked)}
            />
            <span>{t('sshProfileDialog.verifyHostKeys')}</span>
          </label>

          <label className="flex items-center gap-2 text-sm text-text-primary">
            <input
              type="checkbox"
              checked={form.reuseSession}
              onChange={(event) => setField('reuseSession', event.target.checked)}
            />
            <span>{t('sshProfileDialog.reuseSession')}</span>
          </label>

          <label className="flex items-center gap-2 text-sm text-text-primary">
            <input
              type="checkbox"
              checked={form.warnOnClose}
              onChange={(event) => setField('warnOnClose', event.target.checked)}
            />
            <span>{t('sshProfileDialog.warnOnClose')}</span>
          </label>

          <label className="flex items-center gap-2 text-sm text-text-primary">
            <input
              type="checkbox"
              checked={form.agentForward}
              onChange={(event) => setField('agentForward', event.target.checked)}
            />
            <span>{t('sshProfileDialog.agentForward')}</span>
          </label>

          <label className="flex items-center gap-2 text-sm text-text-primary">
            <input
              type="checkbox"
              checked={form.skipBanner}
              onChange={(event) => setField('skipBanner', event.target.checked)}
            />
            <span>{t('sshProfileDialog.skipBanner')}</span>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="ssh-profile-tags" className="block text-sm font-medium text-text-primary mb-2">
              {t('sshProfileDialog.tagsLabel')}
            </label>
            <input
              id="ssh-profile-tags"
              type="text"
              value={form.tagsText}
              onChange={(event) => setField('tagsText', event.target.value)}
              placeholder="prod, db, cn-shanghai"
              className="w-full px-3 py-2 bg-bg-app border border-border-subtle rounded text-text-primary placeholder-text-disabled focus:outline-none focus:ring-2 focus:ring-status-running"
            />
          </div>

          <div>
            <label htmlFor="ssh-profile-notes" className="block text-sm font-medium text-text-primary mb-2">
              {t('sshProfileDialog.notesLabel')}
            </label>
            <textarea
              id="ssh-profile-notes"
              value={form.notes}
              onChange={(event) => setField('notes', event.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-bg-app border border-border-subtle rounded text-text-primary placeholder-text-disabled focus:outline-none focus:ring-2 focus:ring-status-running"
            />
          </div>
        </div>

        {profileHasUnsupportedRouting && (
          <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-3 py-2">
            {t('sshProfileDialog.unsupportedRoutingHint')}
          </div>
        )}

        {saveError && (
          <p className="text-sm text-status-error" role="alert">
            {saveError}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? t('common.saving') : (profile ? t('common.save') : t('common.create'))}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
