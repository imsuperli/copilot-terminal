import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateWindowDialog } from '../CreateWindowDialog'
import { useWindowStore } from '../../stores/windowStore'

const mockElectronAPI = {
  getSettings: vi.fn(),
  validatePath: vi.fn(),
  selectDirectory: vi.fn(),
  createWindow: vi.fn(),
  triggerAutoSave: vi.fn(),
}

Object.defineProperty(window, 'electronAPI', {
  value: mockElectronAPI,
  writable: true,
})

function createWindowResponse() {
  const paneId = 'pane-1'

  return {
    success: true,
    data: {
      id: 'window-1',
      name: 'Test Window',
      layout: {
        type: 'pane',
        id: paneId,
        pane: {
          id: paneId,
          cwd: '/test/path',
          command: 'pwsh.exe',
          status: 'running',
          pid: 1234,
        },
      },
      activePaneId: paneId,
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    },
  }
}

describe('CreateWindowDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useWindowStore.setState({ windows: [], activeWindowId: null })
    mockElectronAPI.getSettings.mockResolvedValue({
      success: true,
      data: {
        terminal: {
          defaultShellProgram: 'pwsh.exe',
        },
      },
    })
    mockElectronAPI.validatePath.mockResolvedValue({ success: true, data: true })
    mockElectronAPI.selectDirectory.mockResolvedValue({ success: true, data: '/selected/path' })
    mockElectronAPI.createWindow.mockResolvedValue(createWindowResponse())
  })

  it('renders the shell program field and shows the global default shell placeholder', async () => {
    render(<CreateWindowDialog open={true} onOpenChange={() => {}} />)

    expect(screen.getByText('新建窗口')).toBeInTheDocument()
    expect(screen.getByLabelText(/窗口名称/)).toBeInTheDocument()
    expect(screen.getByLabelText(/工作目录/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Shell 程序/)).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByPlaceholderText('留空则使用全局默认 shell：pwsh.exe')).toBeInTheDocument()
    })
  })

  it('shows an error when the working directory is invalid', async () => {
    mockElectronAPI.validatePath.mockResolvedValue({ success: true, data: false })

    render(<CreateWindowDialog open={true} onOpenChange={() => {}} />)

    fireEvent.change(screen.getByLabelText(/工作目录/), { target: { value: '/invalid/path' } })

    await waitFor(() => {
      expect(screen.getByText('路径不存在')).toBeInTheDocument()
    })
  })

  it('fills the working directory from the folder picker', async () => {
    render(<CreateWindowDialog open={true} onOpenChange={() => {}} />)

    fireEvent.click(screen.getByText('浏览'))

    await waitFor(() => {
      expect(mockElectronAPI.selectDirectory).toHaveBeenCalledOnce()
    })

    expect(screen.getByLabelText(/工作目录/)).toHaveValue('/selected/path')
  })

  it('submits the selected shell program when creating a window', async () => {
    const onOpenChange = vi.fn()
    render(<CreateWindowDialog open={true} onOpenChange={onOpenChange} />)

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/窗口名称/), { target: { value: 'Test Window' } })
      fireEvent.change(screen.getByLabelText(/工作目录/), { target: { value: '/test/path' } })
      fireEvent.change(screen.getByLabelText(/Shell 程序/), { target: { value: 'powershell.exe' } })
    })

    await waitFor(() => {
      expect(mockElectronAPI.validatePath).toHaveBeenCalledWith('/test/path')
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /创建/ }))
    })

    await waitFor(() => {
      expect(mockElectronAPI.createWindow).toHaveBeenCalledWith({
        name: 'Test Window',
        workingDirectory: '/test/path',
        command: 'powershell.exe',
      })
    })

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('falls back to the global default shell when the field is left empty', async () => {
    const onOpenChange = vi.fn()
    render(<CreateWindowDialog open={true} onOpenChange={onOpenChange} />)

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/工作目录/), { target: { value: '/test/path' } })
    })

    await waitFor(() => {
      expect(mockElectronAPI.validatePath).toHaveBeenCalledWith('/test/path')
    })

    await act(async () => {
      fireEvent.keyDown(screen.getByRole('form'), { key: 'Enter' })
    })

    await waitFor(() => {
      expect(mockElectronAPI.createWindow).toHaveBeenCalledWith({
        name: undefined,
        workingDirectory: '/test/path',
        command: undefined,
      })
    })

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
