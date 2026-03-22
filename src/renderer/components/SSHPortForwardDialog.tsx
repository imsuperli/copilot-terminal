import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { XCircle } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { ActiveSSHPortForward, ForwardedPortConfig, SSHPortForwardType } from '../../shared/types/ssh';
import { useI18n } from '../i18n';
import { Dialog } from './ui/Dialog';
import { Button } from './ui/Button';

interface SSHPortForwardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  windowId: string | null;
  paneId: string | null;
}

interface PortForwardDraft {
  type: SSHPortForwardType;
  host: string;
  port: string;
  targetAddress: string;
  targetPort: string;
  description: string;
}

function createEmptyDraft(): PortForwardDraft {
  return {
    type: 'local',
    host: '127.0.0.1',
    port: '8000',
    targetAddress: '127.0.0.1',
    targetPort: '80',
    description: '',
  };
}

function compareActiveForwards(left: ActiveSSHPortForward, right: ActiveSSHPortForward): number {
  if (left.source !== right.source) {
    return left.source === 'profile' ? -1 : 1;
  }

  if (left.type !== right.type) {
    return left.type.localeCompare(right.type);
  }

  return `${left.host}:${left.port}`.localeCompare(`${right.host}:${right.port}`);
}

function formatForwardSummary(forward: ActiveSSHPortForward): string {
  if (forward.type === 'dynamic') {
    return `${forward.host}:${forward.port} (SOCKS)`;
  }

  if (forward.type === 'remote') {
    return `${forward.host}:${forward.port} -> ${forward.targetAddress}:${forward.targetPort}`;
  }

  return `${forward.host}:${forward.port} -> ${forward.targetAddress}:${forward.targetPort}`;
}

export function SSHPortForwardDialog({
  open,
  onOpenChange,
  windowId,
  paneId,
}: SSHPortForwardDialogProps) {
  const { t } = useI18n();
  const [forwards, setForwards] = useState<ActiveSSHPortForward[]>([]);
  const [draft, setDraft] = useState<PortForwardDraft>(() => createEmptyDraft());
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const sortedForwards = useMemo(
    () => [...forwards].sort(compareActiveForwards),
    [forwards],
  );

  const loadForwards = useCallback(async () => {
    if (!open || !windowId || !paneId) {
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await window.electronAPI.listSSHSessionPortForwards({ windowId, paneId });
      if (!response.success || !response.data) {
        throw new Error(response.error || t('sshPortForwardDialog.loadError'));
      }

      setForwards(response.data);
    } catch (loadError) {
      setError((loadError as Error).message || t('sshPortForwardDialog.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [open, paneId, t, windowId]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setDraft(createEmptyDraft());
    void loadForwards();
  }, [loadForwards, open]);

  const handleAddForward = useCallback(async () => {
    if (!windowId || !paneId) {
      return;
    }

    setError('');

    const host = draft.host.trim() || '127.0.0.1';
    const port = Number(draft.port);
    const targetAddress = draft.targetAddress.trim();
    const targetPort = Number(draft.targetPort);

    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      setError(t('sshProfileDialog.error.forwardBindPort'));
      return;
    }

    if (draft.type !== 'dynamic') {
      if (!targetAddress) {
        setError(t('sshProfileDialog.error.forwardTargetRequired'));
        return;
      }

      if (!Number.isInteger(targetPort) || targetPort <= 0 || targetPort > 65535) {
        setError(t('sshProfileDialog.error.forwardTargetPort'));
        return;
      }
    }

    const forward: ForwardedPortConfig = {
      id: uuidv4(),
      type: draft.type,
      host,
      port,
      targetAddress: draft.type === 'dynamic' ? 'socks' : targetAddress,
      targetPort: draft.type === 'dynamic' ? 0 : targetPort,
      ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
    };

    setIsSubmitting(true);
    try {
      const response = await window.electronAPI.addSSHSessionPortForward({
        windowId,
        paneId,
        forward,
      });
      if (!response.success || !response.data) {
        throw new Error(response.error || t('sshPortForwardDialog.addError'));
      }

      setForwards((previous) => [...previous.filter((item) => item.id !== response.data!.id), response.data!]);
      setDraft(createEmptyDraft());
    } catch (addError) {
      setError((addError as Error).message || t('sshPortForwardDialog.addError'));
    } finally {
      setIsSubmitting(false);
    }
  }, [draft, paneId, t, windowId]);

  const handleRemoveForward = useCallback(async (forwardId: string) => {
    if (!windowId || !paneId) {
      return;
    }

    setRemovingId(forwardId);
    setError('');

    try {
      const response = await window.electronAPI.removeSSHSessionPortForward({
        windowId,
        paneId,
        forwardId,
      });
      if (!response.success) {
        throw new Error(response.error || t('sshPortForwardDialog.removeError'));
      }

      setForwards((previous) => previous.filter((item) => item.id !== forwardId));
    } catch (removeError) {
      setError((removeError as Error).message || t('sshPortForwardDialog.removeError'));
    } finally {
      setRemovingId(null);
    }
  }, [paneId, t, windowId]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('sshPortForwardDialog.title')}
      description={t('sshPortForwardDialog.description')}
      contentClassName="max-w-[900px]"
    >
      <div className="space-y-5">
        <div className="rounded-lg border border-border-subtle bg-bg-elevated/40 px-4 py-3 text-xs text-text-secondary">
          {t('sshPortForwardDialog.scopeHint')}
        </div>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-text-primary">
              {t('sshPortForwardDialog.activeTitle')}
            </h3>
            <button
              type="button"
              onClick={() => void loadForwards()}
              disabled={isLoading}
              className="text-xs text-status-running hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? t('common.loading') : t('sshPortForwardDialog.refresh')}
            </button>
          </div>

          {sortedForwards.length === 0 && !isLoading ? (
            <div className="rounded-lg border border-dashed border-border-subtle px-4 py-6 text-sm text-text-secondary">
              {t('sshPortForwardDialog.empty')}
            </div>
          ) : (
            <div className="space-y-2">
              {sortedForwards.map((forward) => (
                <div
                  key={forward.id}
                  className="flex items-start justify-between gap-4 rounded-lg border border-border-subtle bg-bg-elevated/40 px-4 py-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-text-primary">
                        {formatForwardSummary(forward)}
                      </span>
                      <span className="rounded-full bg-bg-app px-2 py-0.5 text-[11px] text-text-secondary">
                        {t(`sshProfileDialog.forwardType.${forward.type}`)}
                      </span>
                      <span className="rounded-full bg-bg-app px-2 py-0.5 text-[11px] text-text-secondary">
                        {forward.source === 'profile'
                          ? t('sshPortForwardDialog.sourceProfile')
                          : t('sshPortForwardDialog.sourceSession')}
                      </span>
                    </div>

                    {forward.description && (
                      <div className="text-xs text-text-secondary">
                        {forward.description}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleRemoveForward(forward.id)}
                    disabled={removingId === forward.id}
                    className="inline-flex items-center gap-1 text-xs text-status-error hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <XCircle size={14} />
                    {t('sshProfileDialog.removePortForward')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4 rounded-lg border border-border-subtle bg-bg-elevated/40 px-4 py-4">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">
              {t('sshPortForwardDialog.addTitle')}
            </h3>
            <p className="mt-1 text-xs text-text-secondary">
              {t('sshPortForwardDialog.addDescription')}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="ssh-session-forward-type" className="mb-2 block text-sm font-medium text-text-primary">
                {t('sshProfileDialog.portForwardTypeLabel')}
              </label>
              <select
                id="ssh-session-forward-type"
                value={draft.type}
                onChange={(event) => setDraft((previous) => ({
                  ...previous,
                  type: event.target.value as SSHPortForwardType,
                }))}
                className="w-full rounded border border-border-subtle bg-bg-app px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-status-running"
              >
                <option value="local">{t('sshProfileDialog.forwardType.local')}</option>
                <option value="remote">{t('sshProfileDialog.forwardType.remote')}</option>
                <option value="dynamic">{t('sshProfileDialog.forwardType.dynamic')}</option>
              </select>
            </div>

            <div>
              <label htmlFor="ssh-session-forward-host" className="mb-2 block text-sm font-medium text-text-primary">
                {t('sshProfileDialog.portForwardHostLabel')}
              </label>
              <input
                id="ssh-session-forward-host"
                type="text"
                value={draft.host}
                onChange={(event) => setDraft((previous) => ({
                  ...previous,
                  host: event.target.value,
                }))}
                className="w-full rounded border border-border-subtle bg-bg-app px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-status-running"
              />
            </div>

            <div>
              <label htmlFor="ssh-session-forward-port" className="mb-2 block text-sm font-medium text-text-primary">
                {t('sshProfileDialog.portForwardPortLabel')}
              </label>
              <input
                id="ssh-session-forward-port"
                type="number"
                min="1"
                max="65535"
                value={draft.port}
                onChange={(event) => setDraft((previous) => ({
                  ...previous,
                  port: event.target.value,
                }))}
                className="w-full rounded border border-border-subtle bg-bg-app px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-status-running"
              />
            </div>

            {draft.type !== 'dynamic' && (
              <>
                <div>
                  <label htmlFor="ssh-session-forward-target-host" className="mb-2 block text-sm font-medium text-text-primary">
                    {t('sshProfileDialog.portForwardTargetHostLabel')}
                  </label>
                  <input
                    id="ssh-session-forward-target-host"
                    type="text"
                    value={draft.targetAddress}
                    onChange={(event) => setDraft((previous) => ({
                      ...previous,
                      targetAddress: event.target.value,
                    }))}
                    className="w-full rounded border border-border-subtle bg-bg-app px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-status-running"
                  />
                </div>

                <div>
                  <label htmlFor="ssh-session-forward-target-port" className="mb-2 block text-sm font-medium text-text-primary">
                    {t('sshProfileDialog.portForwardTargetPortLabel')}
                  </label>
                  <input
                    id="ssh-session-forward-target-port"
                    type="number"
                    min="1"
                    max="65535"
                    value={draft.targetPort}
                    onChange={(event) => setDraft((previous) => ({
                      ...previous,
                      targetPort: event.target.value,
                    }))}
                    className="w-full rounded border border-border-subtle bg-bg-app px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-status-running"
                  />
                </div>
              </>
            )}

            <div className="sm:col-span-2">
              <label htmlFor="ssh-session-forward-description" className="mb-2 block text-sm font-medium text-text-primary">
                {t('sshProfileDialog.portForwardDescriptionLabel')}
              </label>
              <input
                id="ssh-session-forward-description"
                type="text"
                value={draft.description}
                onChange={(event) => setDraft((previous) => ({
                  ...previous,
                  description: event.target.value,
                }))}
                className="w-full rounded border border-border-subtle bg-bg-app px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-status-running"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-status-error/40 bg-status-error/10 px-3 py-2 text-sm text-status-error">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void handleAddForward()}
              disabled={isSubmitting}
            >
              {isSubmitting ? t('common.loading') : t('sshProfileDialog.addPortForward')}
            </Button>
          </div>
        </section>
      </div>
    </Dialog>
  );
}
