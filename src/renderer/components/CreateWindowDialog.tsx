import React, { useState, useEffect, useRef } from 'react'
import * as Select from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import { Dialog } from './ui/Dialog'
import { Button } from './ui/Button'
import { useWindowStore } from '../stores/windowStore'
import { useI18n } from '../i18n'

interface CreateWindowDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface ShellProgramOption {
  command: string
  path: string
  isDefault: boolean
}

const AUTO_SHELL_OPTION_VALUE = '__auto__'

export function CreateWindowDialog({ open, onOpenChange }: CreateWindowDialogProps) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [workingDirectory, setWorkingDirectory] = useState('')
  const [command, setCommand] = useState('')
  const [globalDefaultShell, setGlobalDefaultShell] = useState('')
  const [availableShells, setAvailableShells] = useState<ShellProgramOption[]>([])
  const [pathError, setPathError] = useState('')
  const [isValidating, setIsValidating] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const workingDirInputRef = useRef<HTMLInputElement>(null)
  const addWindow = useWindowStore((state) => state.addWindow)

  // 自动聚焦到工作目录字段
  useEffect(() => {
    if (open && workingDirInputRef.current) {
      setTimeout(() => {
        workingDirInputRef.current?.focus()
      }, 0)
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      setGlobalDefaultShell('')
      setAvailableShells([])
      return
    }

    let disposed = false

    const loadShellSettings = async () => {
      try {
        const [settingsResponse, shellsResponse] = await Promise.all([
          window.electronAPI.getSettings(),
          window.electronAPI.getAvailableShells(),
        ])

        if (settingsResponse?.success && settingsResponse.data && !disposed) {
          setGlobalDefaultShell(settingsResponse.data.terminal?.defaultShellProgram ?? '')
        }

        if (shellsResponse?.success && shellsResponse.data && !disposed) {
          setAvailableShells(shellsResponse.data)
        }
      } catch (error) {
        if (!disposed) {
          setGlobalDefaultShell('')
          setAvailableShells([])
        }
      }
    }

    void loadShellSettings()

    return () => {
      disposed = true
    }
  }, [open])

  // 路径验证 (debounced)
  useEffect(() => {
    if (!workingDirectory) {
      setPathError('')
      return
    }

    setIsValidating(true)
    const timer = setTimeout(async () => {
      try {
        const response = await window.electronAPI.validatePath(workingDirectory)
        if (response && response.success) {
          setPathError(response.data ? '' : t('createWindow.errorPathNotFound'))
        } else {
          setPathError(t('createWindow.errorValidationFailed'))
        }
      } catch (error) {
        setPathError(t('createWindow.errorValidationFailed'))
      } finally {
        setIsValidating(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [workingDirectory])

  const handleSelectDirectory = async () => {
    try {
      const response = await window.electronAPI.selectDirectory()
      if (response && response.success && response.data) {
        setWorkingDirectory(response.data)
      }
    } catch (error) {
      console.error('Failed to select directory:', error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // 防止竞态条件：等待验证完成
    if (!workingDirectory || pathError || isValidating) {
      return
    }

    setIsCreating(true)
    setCreateError('')
    try {
      const response = await window.electronAPI.createWindow({
        name: name || undefined,
        workingDirectory,
        command: command || undefined,
      })

      // 检查响应格式
      if (response && response.success && response.data) {
        addWindow(response.data)
        onOpenChange(false)
        resetForm()
      } else {
        throw new Error(response?.error || t('createWindow.errorCreateFailed'))
      }
    } catch (error) {
      // 显示用户友好的错误信息
      const errorMessage = (error as Error).message || t('createWindow.errorCreateFailedRetry')
      setCreateError(errorMessage)
    } finally {
      setIsCreating(false)
    }
  }

  const resetForm = () => {
    setName('')
    setWorkingDirectory('')
    setCommand('')
    setPathError('')
    setCreateError('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onOpenChange(false)
      resetForm()
    } else if (e.key === 'Enter' && !pathError && !isValidating && workingDirectory && !isCreating) {
      handleSubmit(e as any)
    }
  }

  const windows = useWindowStore((state) => state.windows)
  const placeholderName = t('createWindow.defaultName', { count: windows.length + 1 })
  const recommendedShell = availableShells.find((shell) => shell.isDefault)
  const autoShellTarget = globalDefaultShell || recommendedShell?.path || ''
  const matchedShell = availableShells.find((shell) => (
    shell.path === command || shell.command === command
  ))
  const selectedShellOptions = command && !matchedShell
    ? [
        {
          command,
          path: command,
          isDefault: false,
        },
        ...availableShells,
      ]
    : availableShells
  const filteredShellOptions = autoShellTarget
    ? selectedShellOptions.filter((shell) => shell.path !== autoShellTarget)
    : selectedShellOptions
  const effectiveSelectedShell = matchedShell?.path ?? command
  const selectedShellValue = !effectiveSelectedShell || effectiveSelectedShell === autoShellTarget
    ? AUTO_SHELL_OPTION_VALUE
    : effectiveSelectedShell
  const autoShellLabel = autoShellTarget
    ? t('createWindow.shellAutoOption', { shell: autoShellTarget })
    : t('createWindow.shellAutoFallback')

  const handleSelectCustomShell = async () => {
    try {
      const response = await window.electronAPI.selectExecutableFile()
      if (response?.success && response.data) {
        setCommand(response.data)
      }
    } catch (error) {
      console.error('Failed to select custom shell:', error)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        onOpenChange(isOpen)
        if (!isOpen) resetForm()
      }}
      title={t('createWindow.title')}
      description={t('createWindow.description')}
      contentClassName="max-w-[640px]"
    >
      <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} role="form">
        {/* 窗口名称 */}
        <div className="mb-4">
          <label htmlFor="window-name" className="block text-sm font-medium text-text-primary mb-2">
            {t('createWindow.nameLabel')}
          </label>
          <input
            id="window-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={placeholderName}
            className="w-full px-3 py-2 bg-bg-app border border-border-subtle rounded text-text-primary placeholder-text-disabled focus:outline-none focus:ring-2 focus:ring-status-running"
          />
        </div>

        {/* 工作目录 */}
        <div className="mb-4">
          <label htmlFor="working-directory" className="block text-sm font-medium text-text-primary mb-2">
            {t('createWindow.workingDirectoryLabel')} <span className="text-status-error">*</span>
          </label>
          <div className="flex gap-2">
            <input
              id="working-directory"
              ref={workingDirInputRef}
              type="text"
              value={workingDirectory}
              onChange={(e) => setWorkingDirectory(e.target.value)}
              placeholder={t('createWindow.workingDirectoryPlaceholder')}
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
            {t('createWindow.shellLabel')}
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
                      <Select.Item value={AUTO_SHELL_OPTION_VALUE} className="flex cursor-pointer items-center justify-between gap-2 rounded px-3 py-2 text-sm text-text-primary outline-none transition-colors hover:bg-bg-hover">
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
                          className="flex cursor-pointer items-center justify-between gap-2 rounded px-3 py-2 text-sm text-text-primary outline-none transition-colors hover:bg-bg-hover"
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

        {/* 创建错误提示 */}
        {createError && (
          <div className="mb-4 p-3 bg-status-error/10 border border-status-error rounded" role="alert">
            <p className="text-sm text-status-error">{createError}</p>
          </div>
        )}

        {/* 按钮 */}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              onOpenChange(false)
              resetForm()
            }}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={!workingDirectory || !!pathError || isValidating || isCreating}
            aria-busy={isCreating}
          >
            {isCreating ? t('common.creating') : t('common.create')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

