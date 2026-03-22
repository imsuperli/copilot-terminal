import React, { useCallback, useMemo } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Edit2, KeyRound, Link2, LockKeyhole, Play, Server, ShieldCheck, Trash2 } from 'lucide-react';
import { SSHCredentialState, SSHProfile } from '../../shared/types/ssh';
import { useI18n, type TranslationKey } from '../i18n';

interface SSHProfileCardProps {
  profile: SSHProfile;
  credentialState?: SSHCredentialState | null;
  inUseCount?: number;
  isConnecting?: boolean;
  onConnect?: (profile: SSHProfile) => void;
  onEdit?: (profile: SSHProfile) => void;
  onDelete?: (profile: SSHProfile) => void;
}

function getAuthLabel(auth: SSHProfile['auth']): TranslationKey {
  switch (auth) {
    case 'password':
      return 'ssh.auth.password';
    case 'publicKey':
      return 'ssh.auth.publicKey';
    case 'agent':
      return 'ssh.auth.agent';
    case 'keyboardInteractive':
      return 'ssh.auth.keyboardInteractive';
  }
}

export const SSHProfileCard = React.memo<SSHProfileCardProps>(({
  profile,
  credentialState,
  inUseCount = 0,
  isConnecting = false,
  onConnect,
  onEdit,
  onDelete,
}) => {
  const { t } = useI18n();

  const targetLabel = useMemo(
    () => `${profile.user}@${profile.host}:${profile.port}`,
    [profile.host, profile.port, profile.user],
  );
  const authLabel = useMemo(
    () => t(getAuthLabel(profile.auth)),
    [profile.auth, t],
  );
  const visibleTags = useMemo(
    () => profile.tags.slice(0, 3),
    [profile.tags],
  );

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onConnect?.(profile);
    }
  }, [onConnect, profile]);

  const handleButtonClick = useCallback((event: React.MouseEvent, action: () => void) => {
    event.stopPropagation();
    action();
    (event.currentTarget as HTMLElement).blur();
  }, []);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onConnect?.(profile)}
      onKeyDown={handleKeyDown}
      aria-label={`${profile.name} ${targetLabel}`}
      className="min-w-[280px] h-56 bg-[rgb(var(--card))] rounded-xl overflow-hidden cursor-pointer transition-all duration-200 ease-out hover:bg-[rgb(var(--card))]/80 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] active:bg-[rgb(var(--accent))]/30 active:shadow-inner outline-none focus:outline-none focus:ring-0 focus:border-[rgb(var(--border))] flex flex-col border border-[rgb(var(--border))] relative"
      style={{ borderTop: '2px solid rgb(59 130 246)' }}
    >
      {isConnecting && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-10 flex items-center justify-center text-sm font-medium text-white">
          {t('sshProfileCard.connecting')}
        </div>
      )}

      <div className="flex-1 p-4 space-y-3 flex flex-col min-h-0">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <Server size={16} className="text-blue-400 flex-shrink-0" />
              <h3 className="text-base font-semibold text-[rgb(var(--foreground))] truncate">
                {profile.name}
              </h3>
            </div>
            <p className="text-xs text-[rgb(var(--muted-foreground))] mt-1 truncate">
              {t('sshProfileCard.target')}: {targetLabel}
            </p>
          </div>
          <span className="text-xs text-blue-300 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full flex-shrink-0">
            {authLabel}
          </span>
        </div>

        <div className="border-t border-[rgb(var(--border))]" />

        <div className="space-y-2 flex-1 min-h-0">
          <div className="flex items-center gap-2 text-xs text-[rgb(var(--muted-foreground))]">
            <Link2 size={13} className="text-zinc-400" />
            <span className="truncate">
              {t('sshProfileCard.remoteCwd')}: {profile.defaultRemoteCwd || '~'}
            </span>
          </div>

          {profile.notes && (
            <Tooltip.Provider>
              <Tooltip.Root delayDuration={300}>
                <Tooltip.Trigger asChild>
                  <p className="text-xs text-[rgb(var(--muted-foreground))] line-clamp-2">
                    {profile.notes}
                  </p>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    className="bg-[rgb(var(--card))] text-[rgb(var(--foreground))] px-3 py-2 rounded-lg text-sm max-w-md break-all z-[1100] shadow-xl border border-[rgb(var(--border))]"
                    side="top"
                    sideOffset={5}
                  >
                    {profile.notes}
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            </Tooltip.Provider>
          )}

          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 text-xs text-zinc-300 bg-zinc-800 px-2 py-1 rounded-full">
              <ShieldCheck size={12} className={profile.verifyHostKeys ? 'text-emerald-400' : 'text-amber-400'} />
              {profile.verifyHostKeys ? t('sshProfileCard.hostKeyVerifyOn') : t('sshProfileCard.hostKeyVerifyOff')}
            </span>

            {credentialState?.hasPassword && (
              <span className="inline-flex items-center gap-1 text-xs text-zinc-300 bg-zinc-800 px-2 py-1 rounded-full">
                <LockKeyhole size={12} className="text-sky-400" />
                {t('sshProfileCard.passwordSaved')}
              </span>
            )}

            {credentialState?.hasPassphrase && (
              <span className="inline-flex items-center gap-1 text-xs text-zinc-300 bg-zinc-800 px-2 py-1 rounded-full">
                <KeyRound size={12} className="text-violet-400" />
                {t('sshProfileCard.passphraseSaved')}
              </span>
            )}

            {inUseCount > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-zinc-300 bg-zinc-800 px-2 py-1 rounded-full">
                <Play size={12} className="text-emerald-400" />
                {t('sshProfileCard.inUse', { count: inUseCount })}
              </span>
            )}

            {visibleTags.map((tag) => (
              <span
                key={tag}
                className="text-xs text-zinc-300 bg-zinc-800 px-2 py-1 rounded-full"
              >
                #{tag}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 px-4 py-2 bg-[rgb(var(--secondary))] border-t border-[rgb(var(--border))] flex-shrink-0">
        <button
          onClick={(event) => handleButtonClick(event, () => onConnect?.(profile))}
          disabled={isConnecting}
          className="flex items-center gap-1.5 pl-2 pr-3 py-1.5 text-xs text-[rgb(var(--primary))] bg-[rgb(var(--card))] rounded hover:bg-[rgb(var(--accent))] transition-colors focus:outline-none focus:ring-2 focus:ring-[rgb(var(--ring))] font-semibold whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
          aria-label={t('common.connect')}
        >
          <Play size={14} fill="currentColor" />
          <span>{isConnecting ? t('sshProfileCard.connecting') : t('common.connect')}</span>
        </button>

        <div className="flex items-center gap-1.5">
          <Tooltip.Provider>
            <Tooltip.Root delayDuration={300}>
              <Tooltip.Trigger asChild>
                <button
                  onClick={(event) => handleButtonClick(event, () => onEdit?.(profile))}
                  className="flex items-center justify-center w-8 h-8 text-[rgb(var(--foreground))] bg-[rgb(var(--card))] rounded hover:bg-[rgb(var(--accent))] transition-colors focus:outline-none focus:ring-2 focus:ring-[rgb(var(--ring))]"
                  aria-label={t('sshProfileCard.edit')}
                >
                  <Edit2 size={16} />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  className="bg-[rgb(var(--card))] text-[rgb(var(--foreground))] px-2 py-1 rounded text-xs z-[1100] shadow-xl border border-[rgb(var(--border))]"
                  side="top"
                  sideOffset={5}
                >
                  {t('sshProfileCard.edit')}
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          </Tooltip.Provider>

          <Tooltip.Provider>
            <Tooltip.Root delayDuration={300}>
              <Tooltip.Trigger asChild>
                <button
                  onClick={(event) => handleButtonClick(event, () => onDelete?.(profile))}
                  disabled={inUseCount > 0}
                  className="flex items-center justify-center w-8 h-8 text-[rgb(var(--error))] bg-[rgb(var(--card))] rounded hover:bg-[rgb(var(--accent))] transition-colors focus:outline-none focus:ring-2 focus:ring-[rgb(var(--error))] disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label={t('sshProfileCard.delete')}
                >
                  <Trash2 size={16} />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  className="bg-[rgb(var(--card))] text-[rgb(var(--foreground))] px-2 py-1 rounded text-xs z-[1100] shadow-xl border border-[rgb(var(--border))]"
                  side="top"
                  sideOffset={5}
                >
                  {inUseCount > 0 ? t('sshProfileCard.deleteDisabled') : t('sshProfileCard.delete')}
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          </Tooltip.Provider>
        </div>
      </div>
    </div>
  );
});

SSHProfileCard.displayName = 'SSHProfileCard';
