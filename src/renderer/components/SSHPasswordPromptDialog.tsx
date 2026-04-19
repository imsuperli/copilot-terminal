import React, { useEffect, useRef, useState } from 'react';
import { Button } from './ui/Button';
import { Dialog } from './ui/Dialog';
import { useI18n } from '../i18n';
import type { SSHPasswordPromptRequest } from '../utils/sshPasswordPrompt';

interface SSHPasswordPromptDialogProps {
  request: SSHPasswordPromptRequest | null;
  onSubmit: (password: string) => void;
  onCancel: () => void;
}

export function SSHPasswordPromptDialog({
  request,
  onSubmit,
  onCancel,
}: SSHPasswordPromptDialogProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState('');

  useEffect(() => {
    setPassword('');

    if (!request) {
      return;
    }

    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 0);

    return () => clearTimeout(timer);
  }, [request]);

  const isRetry = Boolean(request?.retryMessage);

  return (
    <Dialog
      open={Boolean(request)}
      onOpenChange={(open) => {
        if (!open) {
          onCancel();
        }
      }}
      title={isRetry ? t('sshPasswordPrompt.retryTitle') : t('sshPasswordPrompt.title')}
      description={request
        ? t(isRetry ? 'sshPasswordPrompt.retryDescription' : 'sshPasswordPrompt.description', { name: request.profileName })
        : undefined}
      contentClassName="max-w-md"
      showCloseButton
      closeLabel={t('common.close')}
    >
      {request && (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();

            const value = password.trim();
            if (!value) {
              return;
            }

            onSubmit(value);
          }}
        >
          {request.retryMessage && (
            <div
              className="rounded-lg border border-[rgb(var(--error)/0.24)] bg-[rgb(var(--error)/0.10)] px-3 py-3 text-sm text-[rgb(var(--foreground))]"
              role="alert"
            >
              <div className="font-medium text-[rgb(var(--error))]">
                {t('sshPasswordPrompt.retryHint')}
              </div>
              <div className="mt-1 text-[rgb(var(--muted-foreground))]">
                {request.retryMessage}
              </div>
            </div>
          )}

          <div className="rounded-lg border border-border-subtle bg-bg-app px-3 py-3 text-sm">
            <div className="text-text-secondary">
              {t('sshProfileCard.target')}
            </div>
            <div className="mt-1 font-medium text-text-primary">
              {request.user}@{request.host}
            </div>
            <div className="mt-3 text-text-secondary">
              {t('sshProfileDialog.authLabel')}
            </div>
            <div className="mt-1 font-medium text-text-primary">
              {t(`ssh.auth.${request.authType}` as const)}
            </div>
          </div>

          <div>
            <label htmlFor="ssh-password-prompt-input" className="mb-2 block text-sm font-medium text-text-primary">
              {t('sshProfileDialog.passwordLabel')}
            </label>
            <input
              id="ssh-password-prompt-input"
              ref={inputRef}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t('sshPasswordPrompt.passwordPlaceholder')}
              className="w-full rounded border border-border-subtle bg-bg-app px-3 py-2 text-text-primary placeholder-text-disabled focus:outline-none focus:ring-2 focus:ring-status-running"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onCancel}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!password.trim()}>
              {t('common.connect')}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
