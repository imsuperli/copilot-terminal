import React, { useMemo } from 'react';
import { AlertTriangle, ShieldCheck, ShieldQuestion } from 'lucide-react';
import type { SSHHostKeyPromptPayload } from '../../shared/types/electron-api';
import { useI18n } from '../i18n';
import { Button } from './ui/Button';
import { Dialog } from './ui/Dialog';

interface SSHHostKeyPromptDialogProps {
  request: SSHHostKeyPromptPayload | null;
  onDecision: (decision: { trusted: boolean; persist: boolean }) => void;
}

export function SSHHostKeyPromptDialog({
  request,
  onDecision,
}: SSHHostKeyPromptDialogProps) {
  const { t } = useI18n();
  const isOpen = Boolean(request);
  const isMismatch = request?.reason === 'mismatch';

  const reasonCopy = useMemo(() => {
    if (!request) {
      return null;
    }

    return {
      title: isMismatch
        ? t('sshHostKeyPrompt.mismatchTitle', { host: request.host, port: String(request.port) })
        : t('sshHostKeyPrompt.unknownTitle', { host: request.host, port: String(request.port) }),
      detail: isMismatch
        ? t('sshHostKeyPrompt.mismatchDetail')
        : t('sshHostKeyPrompt.unknownDetail'),
    };
  }, [isMismatch, request, t]);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && request) {
          onDecision({ trusted: false, persist: false });
        }
      }}
      title={t('sshHostKeyPrompt.dialogTitle')}
      contentClassName="max-w-[760px]"
      showCloseButton={false}
    >
      {request && reasonCopy && (
        <div className="space-y-5">
          <div className={`rounded-xl border px-4 py-4 ${
            isMismatch
              ? 'border-amber-500/40 bg-amber-500/10'
              : 'border-status-running/40 bg-status-running/10'
          }`}>
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 rounded-full p-2 ${
                isMismatch
                  ? 'bg-amber-500/15 text-amber-200'
                  : 'bg-status-running/15 text-[rgb(var(--primary))]'
              }`}>
                {isMismatch ? <AlertTriangle size={18} /> : <ShieldQuestion size={18} />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-base font-semibold text-text-primary">
                  {reasonCopy.title}
                </div>
                <p className="mt-1 text-sm leading-6 text-text-secondary">
                  {reasonCopy.detail}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <FieldCard label={t('sshHostKeyPrompt.algorithm')}>
              {request.algorithm}
            </FieldCard>
            <FieldCard label={t('sshHostKeyPrompt.host')}>
              {`${request.host}:${request.port}`}
            </FieldCard>
          </div>

          <FieldCard label={t('sshHostKeyPrompt.presentedFingerprint')} mono>
            {request.fingerprint}
          </FieldCard>

          {request.storedFingerprint && (
            <FieldCard label={t('sshHostKeyPrompt.storedFingerprint')} mono>
              {request.storedFingerprint}
            </FieldCard>
          )}

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border-subtle pt-2">
            <Button
              variant="ghost"
              onClick={() => onDecision({ trusted: false, persist: false })}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => onDecision({ trusted: true, persist: false })}
            >
              {t('sshHostKeyPrompt.trustOnce')}
            </Button>
            <Button
              className="inline-flex items-center gap-2"
              onClick={() => onDecision({ trusted: true, persist: true })}
            >
              <ShieldCheck size={16} />
              {isMismatch ? t('sshHostKeyPrompt.updateAndSave') : t('sshHostKeyPrompt.trustAndSave')}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function FieldCard(props: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  const { label, children, mono = false } = props;

  return (
    <div className="rounded-xl border border-border-subtle bg-bg-elevated/40 px-4 py-3">
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-text-secondary">
        {label}
      </div>
      <div className={`break-all text-sm text-text-primary ${mono ? 'font-mono leading-6' : ''}`}>
        {children}
      </div>
    </div>
  );
}
