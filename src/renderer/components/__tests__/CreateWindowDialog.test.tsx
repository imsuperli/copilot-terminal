import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateWindowDialog } from '../CreateWindowDialog'
import { useWindowStore } from '../../stores/windowStore'

const mockElectronAPI = {
  getSettings: vi.fn(),
  getAvailableShells: vi.fn(),
  validatePath: vi.fn(),
  selectDirectory: vi.fn(),
  selectExecutableFile: vi.fn(),
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
          defaultShellProgram: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
        },
      },
    })
    mockElectronAPI.getAvailableShells.mockResolvedValue({
      success: true,
      data: [
        { command: 'pwsh.exe', path: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe', isDefault: true },
        { command: 'powershell.exe', path: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', isDefault: false },
        { command: 'cmd.exe', path: 'C:\\Windows\\System32\\cmd.exe', isDefault: false },
      ],
    })
    mockElectronAPI.validatePath.mockResolvedValue({ success: true, data: true })
    mockElectronAPI.selectDirectory.mockResolvedValue({ success: true, data: '/selected/path' })
    mockElectronAPI.selectExecutableFile.mockResolvedValue({ success: true, data: 'C:\\Shells\\custom-shell.exe' })
    mockElectronAPI.createWindow.mockResolvedValue(createWindowResponse())
  })

  it('renders the shell selector and shows the global default path', async () => {
    render(<CreateWindowDialog open={true} onOpenChange={() => {}} />)

    expect(screen.getByText('新建窗口')).toBeInTheDocument()
    expect(screen.getByLabelText(/窗口名称/)).toBeInTheDocument()
    expect(screen.getByLabelText(/工作目录/)).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /Shell 程序/ })).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('(默认)C:\\Program Files\\PowerShell\\7\\pwsh.exe')).toBeInTheDocument()
    })

    const user = userEvent.setup()
    await user.click(screen.getByRole('combobox', { name: /Shell 程序/ }))
    expect(screen.queryByText('C:\\Program Files\\PowerShell\\7\\pwsh.exe')).not.toBeInTheDocument()
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

  it('submits the selected scanned shell path when creating a window', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(<CreateWindowDialog open={true} onOpenChange={onOpenChange} />)

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/窗口名称/), { target: { value: 'Test Window' } })
      fireEvent.change(screen.getByLabelText(/工作目录/), { target: { value: '/test/path' } })
    })

    await user.click(screen.getByRole('combobox', { name: /Shell 程序/ }))
    await user.click(await screen.findByText('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'))

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
        command: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      })
    })

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('falls back to the global default shell when the field is left on auto', async () => {
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

  it('submits a custom shell path selected from the file picker', async () => {
    const user = userEvent.setup()
    render(<CreateWindowDialog open={true} onOpenChange={() => {}} />)

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/工作目录/), { target: { value: '/test/path' } })
    })

    await waitFor(() => {
      expect(mockElectronAPI.validatePath).toHaveBeenCalledWith('/test/path')
    })

    await user.click(screen.getByRole('button', { name: '自定义' }))

    await waitFor(() => {
      expect(mockElectronAPI.selectExecutableFile).toHaveBeenCalledOnce()
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /创建/ }))
    })

    await waitFor(() => {
      expect(mockElectronAPI.createWindow).toHaveBeenCalledWith({
        name: undefined,
        workingDirectory: '/test/path',
        command: 'C:\\Shells\\custom-shell.exe',
      })
    })
  })
})
