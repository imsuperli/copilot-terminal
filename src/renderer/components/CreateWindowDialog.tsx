import React, { useState, useEffect, useRef } from 'react'
import { Dialog } from './ui/Dialog'
import { Button } from './ui/Button'
import { useWindowStore } from '../stores/windowStore'

interface CreateWindowDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateWindowDialog({ open, onOpenChange }: CreateWindowDialogProps) {
  const [name, setName] = useState('')
  const [workingDirectory, setWorkingDirectory] = useState('')
  const [command, setCommand] = useState('')
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
          setPathError(response.data ? '' : '路径不存在')
        } else {
          setPathError('验证失败')
        }
      } catch (error) {
        setPathError('验证失败')
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
        throw new Error(response?.error || '创建窗口失败')
      }
    } catch (error) {
      // 显示用户友好的错误信息
      const errorMessage = (error as Error).message || '创建窗口失败，请重试'
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
  const placeholderName = `窗口 #${windows.length + 1}`

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        onOpenChange(isOpen)
        if (!isOpen) resetForm()
      }}
      title="新建窗口"
      description="创建一个新的终端窗口"
    >
      <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} role="form">
        {/* 窗口名称 */}
        <div className="mb-4">
          <label htmlFor="window-name" className="block text-sm font-medium text-text-primary mb-2">
            窗口名称（可选）
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
            工作目录 <span className="text-status-error">*</span>
          </label>
          <div className="flex gap-2">
            <input
              id="working-directory"
              ref={workingDirInputRef}
              type="text"
              value={workingDirectory}
              onChange={(e) => setWorkingDirectory(e.target.value)}
              placeholder="选择或输入工作目录路径"
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
              浏览
            </Button>
          </div>
          {pathError && (
            <p id="path-error" className="mt-1 text-sm text-status-error" role="alert">
              {pathError}
            </p>
          )}
          {isValidating && (
            <p className="mt-1 text-sm text-text-secondary" aria-live="polite">验证中...</p>
          )}
        </div>

        {/* 启动命令 */}
        <div className="mb-6">
          <label htmlFor="command" className="block text-sm font-medium text-text-primary mb-2">
            启动命令（可选）
          </label>
          <input
            id="command"
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="默认打开 shell"
            className="w-full px-3 py-2 bg-bg-app border border-border-subtle rounded text-text-primary placeholder-text-disabled focus:outline-none focus:ring-2 focus:ring-status-running"
          />
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
            取消
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={!workingDirectory || !!pathError || isValidating || isCreating}
            aria-busy={isCreating}
          >
            {isCreating ? '创建中...' : '创建'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

