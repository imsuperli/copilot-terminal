import React, { useMemo, useState } from 'react';
import { Bot, Globe, LayoutTemplate, Monitor, Server, StickyNote, Workflow } from 'lucide-react';
import type { CanvasWindowDraftKind, CanvasWorkspaceTemplate } from '../../shared/types/canvas';
import type { SSHProfile } from '../../shared/types/ssh';
import { Dialog } from './ui/Dialog';
import { useI18n } from '../i18n';
import {
  idePopupActionButtonClassName,
  idePopupBadgeClassName,
  idePopupCardClassName,
  idePopupInputClassName,
  idePopupSecondaryButtonClassName,
  idePopupTonalButtonClassName,
} from './ui/ide-popup';

type CanvasCreateMode = CanvasWindowDraftKind | 'note' | 'template';

interface CanvasCreateBlockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sshProfiles: SSHProfile[];
  templates: CanvasWorkspaceTemplate[];
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
  onCreateNote: () => void;
  onApplyTemplate: (templateId: string) => void;
}

const MODES: Array<{
  id: CanvasCreateMode;
  icon: React.ReactNode;
  tone: 'sky' | 'amber' | 'emerald' | 'violet' | 'zinc';
}> = [
  { id: 'local', icon: <Monitor size={16} />, tone: 'sky' },
  { id: 'ssh', icon: <Server size={16} />, tone: 'amber' },
  { id: 'code', icon: <Workflow size={16} />, tone: 'emerald' },
  { id: 'browser', icon: <Globe size={16} />, tone: 'violet' },
  { id: 'chat', icon: <Bot size={16} />, tone: 'sky' },
  { id: 'note', icon: <StickyNote size={16} />, tone: 'zinc' },
  { id: 'template', icon: <LayoutTemplate size={16} />, tone: 'emerald' },
];

export function CanvasCreateBlockDialog({
  open,
  onOpenChange,
  sshProfiles,
  templates,
  initialWorkingDirectory,
  onCreateWindow,
  onCreateNote,
  onApplyTemplate,
}: CanvasCreateBlockDialogProps) {
  const { t } = useI18n();
  const [mode, setMode] = useState<CanvasCreateMode>('local');
  const [name, setName] = useState('');
  const [workingDirectory, setWorkingDirectory] = useState(initialWorkingDirectory ?? '');
  const [command, setCommand] = useState('');
  const [url, setUrl] = useState('https://duckduckgo.com/');
  const [selectedSSHProfileId, setSelectedSSHProfileId] = useState(sshProfiles[0]?.id ?? '');
  const [selectedTemplateId, setSelectedTemplateId] = useState(templates[0]?.id ?? '');

  const selectedSSHProfile = useMemo(
    () => sshProfiles.find((profile) => profile.id === selectedSSHProfileId) ?? null,
    [selectedSSHProfileId, sshProfiles],
  );

  const reset = () => {
    setMode('local');
    setName('');
    setWorkingDirectory(initialWorkingDirectory ?? '');
    setCommand('');
    setUrl('https://duckduckgo.com/');
    setSelectedSSHProfileId(sshProfiles[0]?.id ?? '');
    setSelectedTemplateId(templates[0]?.id ?? '');
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

    if (mode === 'template') {
      if (selectedTemplateId) {
        onApplyTemplate(selectedTemplateId);
      }
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
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setMode(item.id)}
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

        {mode === 'template' ? (
          <div className="space-y-3">
            <select
              value={selectedTemplateId}
              onChange={(event) => setSelectedTemplateId(event.target.value)}
              className={idePopupInputClassName}
            >
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            <div className="grid gap-3 md:grid-cols-2">
              {templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => setSelectedTemplateId(template.id)}
                  className={`${idePopupCardClassName} rounded-2xl p-4 text-left ${selectedTemplateId === template.id ? 'border-[rgb(var(--primary))]/55' : ''}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-[rgb(var(--foreground))]">{template.name}</span>
                    {template.system && (
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] ${idePopupBadgeClassName('emerald')}`}>
                        {t('canvas.templateSystem')}
                      </span>
                    )}
                  </div>
                  {template.description && (
                    <p className="mt-2 text-sm leading-6 text-[rgb(var(--muted-foreground))]">{template.description}</p>
                  )}
                  <div className="mt-3 text-xs text-[rgb(var(--muted-foreground))]">
                    {t('canvas.templateBlockCount', { count: template.blocks.length })}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : mode === 'note' ? (
          <div className={`${idePopupCardClassName} rounded-2xl p-4 text-sm leading-6 text-[rgb(var(--muted-foreground))]`}>
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
              <select
                value={selectedSSHProfileId}
                onChange={(event) => setSelectedSSHProfileId(event.target.value)}
                className={idePopupInputClassName}
              >
                {sshProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name} ({profile.user}@{profile.host}:{profile.port})
                  </option>
                ))}
              </select>
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
            {mode === 'template' ? t('canvas.applyTemplate') : t('common.create')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
