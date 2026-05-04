import React, { useMemo, useState } from 'react';
import * as Select from '@radix-ui/react-select';
import { Bot, Globe, Monitor, Server, StickyNote, Workflow } from 'lucide-react';
import type { CanvasWindowDraftKind } from '../../shared/types/canvas';
import type { SSHProfile } from '../../shared/types/ssh';
import { Dialog } from './ui/Dialog';
import { useI18n } from '../i18n';
import {
  idePopupAccentCardClassName,
  idePopupActionButtonClassName,
  idePopupBadgeClassName,
  idePopupInputClassName,
  idePopupSelectContentClassName,
  idePopupSelectItemClassName,
  idePopupSelectTriggerClassName,
  idePopupSecondaryButtonClassName,
  idePopupTonalButtonClassName,
} from './ui/ide-popup';
import { Check, ChevronDown } from 'lucide-react';

type CanvasCreateMode = 'existing' | CanvasWindowDraftKind | 'note';

interface CanvasCreateBlockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sshProfiles: SSHProfile[];
  hasAvailableWindows?: boolean;
  initialWorkingDirectory?: string;
  onCreateWindow: (payload: {
    kind: CanvasWindowDraftKind;
    name?: string;
    workingDirectory?: string;
    command?: string;
    url?: string;
    linkedPaneId?: string;
    sshProfileId?: string;
  }) => void;
  onOpenWindowPicker: () => void;
  onCreateNote: () => void;
}

const MODES: Array<{
  id: CanvasCreateMode;
  icon: React.ReactNode;
  tone: 'sky' | 'amber' | 'emerald' | 'violet' | 'zinc';
}> = [
  { id: 'existing', icon: <Monitor size={16} />, tone: 'sky' },
  { id: 'local', icon: <Monitor size={16} />, tone: 'sky' },
  { id: 'ssh', icon: <Server size={16} />, tone: 'amber' },
  { id: 'code', icon: <Workflow size={16} />, tone: 'emerald' },
  { id: 'browser', icon: <Globe size={16} />, tone: 'violet' },
  { id: 'chat', icon: <Bot size={16} />, tone: 'sky' },
  { id: 'note', icon: <StickyNote size={16} />, tone: 'zinc' },
];

export function CanvasCreateBlockDialog({
  open,
  onOpenChange,
  sshProfiles,
  hasAvailableWindows = false,
  initialWorkingDirectory,
  onCreateWindow,
  onOpenWindowPicker,
  onCreateNote,
}: CanvasCreateBlockDialogProps) {
  const { t } = useI18n();
  const [mode, setMode] = useState<CanvasCreateMode>(hasAvailableWindows ? 'existing' : 'local');
  const [name, setName] = useState('');
  const [workingDirectory, setWorkingDirectory] = useState(initialWorkingDirectory ?? '');
  const [command, setCommand] = useState('');
  const [url, setUrl] = useState('https://duckduckgo.com/');
  const [selectedSSHProfileId, setSelectedSSHProfileId] = useState(sshProfiles[0]?.id ?? '');

  const selectedSSHProfile = useMemo(
    () => sshProfiles.find((profile) => profile.id === selectedSSHProfileId) ?? null,
    [selectedSSHProfileId, sshProfiles],
  );

  const reset = () => {
    setMode(hasAvailableWindows ? 'existing' : 'local');
    setName('');
    setWorkingDirectory(initialWorkingDirectory ?? '');
    setCommand('');
    setUrl('https://duckduckgo.com/');
    setSelectedSSHProfileId(sshProfiles[0]?.id ?? '');
  };

  const close = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      reset();
    }
  };

  const submit = () => {
    if (mode === 'note') {
      onCreateNote();
      close(false);
      return;
    }

    if (mode === 'existing') {
      onOpenWindowPicker();
      close(false);
      return;
    }

    onCreateWindow({
      kind: mode,
      name: name.trim() || undefined,
      workingDirectory: workingDirectory.trim() || undefined,
      command: command.trim() || undefined,
      url: mode === 'browser' ? url.trim() || undefined : undefined,
      sshProfileId: mode === 'ssh' ? selectedSSHProfile?.id : undefined,
    });
    close(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title={t('canvas.createBlockTitle')}
      description={t('canvas.createBlockDescription')}
      contentClassName="!max-w-3xl"
      showCloseButton
      closeLabel={t('common.close')}
    >
      <div className="space-y-5">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setMode(item.id)}
              disabled={item.id === 'existing' && !hasAvailableWindows}
              className={`${idePopupTonalButtonClassName} flex items-center justify-between rounded-2xl px-3 py-3 text-left ${mode === item.id ? 'border-[rgb(var(--primary))]/65 bg-[rgb(var(--primary))]/10' : ''}`}
            >
              <span className="flex items-center gap-2 text-sm font-medium text-[rgb(var(--foreground))]">
                {item.icon}
                {t(`canvas.createMode.${item.id}` as any)}
              </span>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] ${idePopupBadgeClassName(item.tone)}`}>
                {t(`canvas.createModeBadge.${item.id}` as any)}
              </span>
            </button>
          ))}
        </div>

        {mode === 'existing' ? (
          <div className={`${idePopupAccentCardClassName} rounded-2xl p-4`}>
            <div className="text-sm font-medium text-[rgb(var(--foreground))]">
              {hasAvailableWindows ? t('canvas.createExistingDescription') : t('canvas.noAvailableWindows')}
            </div>
            <p className="mt-2 text-sm leading-6 text-[rgb(var(--muted-foreground))]">
              {hasAvailableWindows ? t('canvas.windowPickerDescription') : t('canvas.emptyCreateTerminalHint')}
            </p>
          </div>
        ) : mode === 'note' ? (
          <div className={`${idePopupAccentCardClassName} rounded-2xl p-4 text-sm leading-6 text-[rgb(var(--muted-foreground))]`}>
            {t('canvas.createNoteDescription')}
          </div>
        ) : (
          <div className="space-y-4">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('canvas.createBlockNamePlaceholder')}
              className={idePopupInputClassName}
            />

            {(mode === 'local' || mode === 'ssh' || mode === 'code') && (
              <input
                value={workingDirectory}
                onChange={(event) => setWorkingDirectory(event.target.value)}
                placeholder={t('canvas.createBlockDirectoryPlaceholder')}
                className={idePopupInputClassName}
              />
            )}

            {(mode === 'local' || mode === 'ssh') && (
              <input
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                placeholder={t('canvas.createBlockCommandPlaceholder')}
                className={idePopupInputClassName}
              />
            )}

            {mode === 'browser' && (
              <input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder={t('common.url')}
                className={idePopupInputClassName}
              />
            )}

            {mode === 'ssh' && (
              <div className="space-y-2">
                <div className="text-xs text-[rgb(var(--muted-foreground))]">
                  {t('canvas.sshProfileLabel')}
                </div>
                <Select.Root value={selectedSSHProfileId} onValueChange={setSelectedSSHProfileId}>
                  <Select.Trigger className={idePopupSelectTriggerClassName} aria-label={t('canvas.sshProfileLabel')}>
                    <span className="min-w-0 flex-1 truncate">
                      <Select.Value />
                    </span>
                    <Select.Icon className="shrink-0">
                      <ChevronDown size={16} className="text-[rgb(var(--muted-foreground))]" />
                    </Select.Icon>
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Content
                      position="popper"
                      side="bottom"
                      align="start"
                      sideOffset={6}
                      className={idePopupSelectContentClassName}
                    >
                      <Select.Viewport className="p-1">
                        {sshProfiles.map((profile) => (
                          <Select.Item key={profile.id} value={profile.id} className={idePopupSelectItemClassName}>
                            <Select.ItemText>
                              {profile.name} ({profile.user}@{profile.host}:{profile.port})
                            </Select.ItemText>
                            <Select.ItemIndicator className="shrink-0">
                              <Check size={14} />
                            </Select.ItemIndicator>
                          </Select.Item>
                        ))}
                      </Select.Viewport>
                    </Select.Content>
                  </Select.Portal>
                </Select.Root>
                <p className="text-xs leading-5 text-[rgb(var(--muted-foreground))]">
                  {selectedSSHProfile
                    ? `${selectedSSHProfile.user}@${selectedSSHProfile.host}:${selectedSSHProfile.port}`
                    : t('canvas.noAvailableWindows')}
                </p>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => close(false)}
            className={idePopupSecondaryButtonClassName}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={mode === 'ssh' && !selectedSSHProfile}
            className={idePopupActionButtonClassName()}
          >
            {mode === 'existing' ? t('canvas.pickExistingWindow') : t('common.create')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
