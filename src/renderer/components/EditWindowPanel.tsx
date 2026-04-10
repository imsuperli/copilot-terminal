import React, { useState, useEffect, useRef } from 'react';
import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { Dialog } from './ui/Dialog';
import { Button } from './ui/Button';
import { Window } from '../types/window';
import { useI18n } from '../i18n';
import { getCurrentWindowTerminalPane } from '../utils/windowWorkingDirectory';

interface EditWindowPanelProps {
  window: Window;
  onClose: () => void;
  onSave: (windowId: string, updates: { name?: string; command?: string; cwd?: string }) => void;
}

interface ShellProgramOption {
  command: string;
  path: string;
  isDefault: boolean;
}

const AUTO_SHELL_OPTION_VALUE = '__auto__';

/**
 * 编辑窗口面板组件
 * 允许用户编辑窗口名称、shell命令和工作目录
 */
export const EditWindowPanel: React.FC<EditWindowPanelProps> = ({ window, onClose, onSave }) => {
  const { t } = useI18n();
  const firstPane = getCurrentWindowTerminalPane(window);

  const [name, setName] = useState(window.name);
  const [workingDirectory, setWorkingDirectory] = useState(firstPane?.cwd || '');
  const [command, setCommand] = useState(firstPane?.command || '');
  const [globalDefaultShell, setGlobalDefaultShell] = useState('');
  const [availableShells, setAvailableShells] = useState<ShellProgramOption[]>([]);
  const [pathError, setPathError] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const workingDirInputRef = useRef<HTMLInputElement>(null);

  // 加载 shell 设置
  useEffect(() => {
    let disposed = false;

    const loadShellSettings = async () => {
      try {
        const [settingsResponse, shellsResponse] = await Promise.all([
          globalThis.window.electronAPI.getSettings(),
          globalThis.window.electronAPI.getAvailableShells(),
        ]);

        if (settingsResponse?.success && settingsResponse.data && !disposed) {
          setGlobalDefaultShell(settingsResponse.data.terminal?.defaultShellProgram ?? '');
        }

        if (shellsResponse?.success && shellsResponse.data && !disposed) {
          setAvailableShells(shellsResponse.data);
        }
      } catch (error) {
        if (!disposed) {
          setGlobalDefaultShell('');
          setAvailableShells([]);
        }
      }
    };

    void loadShellSettings();

    return () => {
      disposed = true;
    };
  }, []);

  // 路径验证 (debounced)
  useEffect(() => {
    if (!workingDirectory) {
      setPathError('');
      return;
    }

    setIsValidating(true);
    const timer = setTimeout(async () => {
      try {
        const response = await globalThis.window.electronAPI.validatePath(workingDirectory);
        if (response && response.success) {
          setPathError(response.data ? '' : t('createWindow.errorPathNotFound'));
        } else {
          setPathError(t('createWindow.errorValidationFailed'));
        }
      } catch (error) {
        setPathError(t('createWindow.errorValidationFailed'));
      } finally {
        setIsValidating(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [workingDirectory, t]);

  const handleSelectDirectory = async () => {
    try {
      const response = await globalThis.window.electronAPI.selectDirectory();
      if (response && response.success && response.data) {
        setWorkingDirectory(response.data);
      }
    } catch (error) {
      console.error('Failed to select directory:', error);
    }
  };

  const handleSelectCustomShell = async () => {
    try {
      const response = await globalThis.window.electronAPI.selectExecutableFile();
      if (response?.success && response.data) {
        setCommand(response.data);
      }
    } catch (error) {
      console.error('Failed to select custom shell:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!workingDirectory || pathError || isValidating) {
      return;
    }

    setIsSaving(true);
    try {
      const updates: { name?: string; command?: string; cwd?: string } = {};

      if (name !== window.name) {
        updates.name = name;
      }

      if (command !== firstPane?.command) {
        updates.command = command;
      }

      if (workingDirectory !== firstPane?.cwd) {
        updates.cwd = workingDirectory;
      }

      if (Object.keys(updates).length > 0) {
        onSave(window.id, updates);
      }

      onClose();
    } catch (error) {
      console.error('Failed to save window:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter' && !pathError && !isValidating && workingDirectory && !isSaving) {
      handleSubmit(e as any);
    }
  };

  const recommendedShell = availableShells.find((shell) => shell.isDefault);
  const autoShellTarget = globalDefaultShell || recommendedShell?.path || '';
  const matchedShell = availableShells.find((shell) => (
    shell.path === command || shell.command === command
  ));
  const selectedShellOptions = command && !matchedShell
    ? [
        {
          command,
          path: command,
          isDefault: false,
        },
        ...availableShells,
      ]
    : availableShells;
  const filteredShellOptions = autoShellTarget
    ? selectedShellOptions.filter((shell) => shell.path !== autoShellTarget)
    : selectedShellOptions;
  const effectiveSelectedShell = matchedShell?.path ?? command;
  const selectedShellValue = !effectiveSelectedShell || effectiveSelectedShell === autoShellTarget
    ? AUTO_SHELL_OPTION_VALUE
    : effectiveSelectedShell;
  const autoShellLabel = autoShellTarget
    ? t('createWindow.shellAutoOption', { shell: autoShellTarget })
    : t('createWindow.shellAutoFallback');

  return (
    <Dialog
      open={true}
      onOpenChange={onClose}
      title={t('editWindow.title')}
      description={t('editWindow.description')}
      contentClassName="max-w-[640px]"
    >
      <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} role="form">
        {/* 窗口名称 */}
        <div className="mb-4">
          <label htmlFor="window-name" className="block text-sm font-medium text-text-primary mb-2">
            {t('editWindow.windowName')}
          </label>
          <input
            id="window-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('editWindow.windowNamePlaceholder')}
            className="w-full px-3 py-2 bg-bg-app border border-border-subtle rounded text-text-primary placeholder-text-disabled focus:outline-none focus:ring-2 focus:ring-status-running"
          />
        </div>

        {/* 工作目录 */}
        <div className="mb-4">
          <label htmlFor="working-directory" className="block text-sm font-medium text-text-primary mb-2">
            {t('editWindow.workingDirectory')} <span className="text-status-error">*</span>
          </label>
          <div className="flex gap-2">
            <input
              id="working-directory"
              ref={workingDirInputRef}
              type="text"
              value={workingDirectory}
              onChange={(e) => setWorkingDirectory(e.target.value)}
              placeholder={t('editWindow.workingDirectoryPlaceholder')}
              required
              aria-describedby={pathError ? 'path-error' : undefined}
              className={`flex-1 px-3 py-2 bg-bg-app border rounded text-text-primary placeholder-text-disabled focus:outline-none focus:ring-2 ${
                pathError
                  ? 'border-status-error focus:ring-status-error'
                  : 'border-border-subtle focus:ring-status-running'
              }`}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={handleSelectDirectory}
              className="shrink-0"
            >
              {t('common.browse')}
            </Button>
          </div>
          {/* 固定高度的提示区域，防止弹窗抖动 */}
          <div className="mt-1 h-5">
            {pathError && (
              <p id="path-error" className="text-sm text-status-error" role="alert">
                {pathError}
              </p>
            )}
            {!pathError && isValidating && (
              <p className="text-sm text-text-secondary" aria-live="polite">{t('common.validating')}</p>
            )}
          </div>
        </div>

        {/* Shell 程序 */}
        <div className="mb-6">
          <label htmlFor="command" className="block text-sm font-medium text-text-primary mb-2">
            {t('editWindow.shellCommand')}
          </label>
          <div className="flex gap-2">
            <div className="flex-1 min-w-0">
              <Select.Root
                value={selectedShellValue}
                onValueChange={(value) => setCommand(value === AUTO_SHELL_OPTION_VALUE ? '' : value)}
              >
                <Select.Trigger
                  id="command"
                  className="flex w-full items-center justify-between gap-2 rounded border border-border-subtle bg-bg-app px-3 py-2 text-sm text-left text-text-primary focus:outline-none focus:ring-2 focus:ring-status-running min-w-0"
                >
                  <span className="truncate flex-1 min-w-0">
                    <Select.Value placeholder={t('createWindow.shellPlaceholder')} />
                  </span>
                  <Select.Icon className="shrink-0">
                    <ChevronDown size={16} className="text-text-secondary" />
                  </Select.Icon>
                </Select.Trigger>

                <Select.Portal>
                  <Select.Content
                    position="popper"
                    side="bottom"
                    align="start"
                    sideOffset={6}
                    className="z-[80] w-[var(--radix-select-trigger-width)] overflow-hidden rounded border border-border-subtle bg-bg-card shadow-2xl"
                  >
                    <Select.Viewport className="p-1">
                      <Select.Item value={AUTO_SHELL_OPTION_VALUE} className="flex cursor-pointer items-center justify-between gap-2 rounded px-3 py-2 text-xs text-text-primary outline-none transition-colors hover:bg-bg-hover">
                        <Select.ItemText className="truncate">
                          {autoShellLabel}
                        </Select.ItemText>
                        <Select.ItemIndicator className="shrink-0">
                          <Check size={14} />
                        </Select.ItemIndicator>
                      </Select.Item>
                      {filteredShellOptions.map((shell) => (
                        <Select.Item
                          key={shell.path}
                          value={shell.path}
                          className="flex cursor-pointer items-center justify-between gap-2 rounded px-3 py-2 text-xs text-text-primary outline-none transition-colors hover:bg-bg-hover"
                        >
                          <Select.ItemText className="truncate">
                            {shell.path}
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
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={handleSelectCustomShell}
              className="shrink-0"
            >
              {t('settings.general.defaultShellCustomButton')}
            </Button>
          </div>
        </div>

        {/* 按钮 */}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={!workingDirectory || !!pathError || isValidating || isSaving}
            aria-busy={isSaving}
          >
            {isSaving ? t('common.loading') : t('common.save')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
