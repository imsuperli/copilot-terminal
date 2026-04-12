import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsPanel } from '../SettingsPanel';
import { I18nProvider } from '../../i18n';

describe('SettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.electronAPI.platform = 'win32';
  });

  it('shows and saves the global default shell setting in the general tab', async () => {
    const user = userEvent.setup();
    const settingsResponse = {
      success: true,
      data: {
        language: 'zh-CN',
        ides: [],
        quickNav: { items: [] },
        terminal: {
          useBundledConptyDll: false,
          defaultShellProgram: 'pwsh.exe',
        },
      } as any,
    };
    vi.mocked(window.electronAPI.getSettings)
      .mockResolvedValueOnce(settingsResponse)
      .mockResolvedValueOnce(settingsResponse);
    vi.mocked(window.electronAPI.getAvailableShells).mockResolvedValueOnce({
      success: true,
      data: [
        { command: 'pwsh.exe', path: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe', isDefault: true },
        { command: 'powershell.exe', path: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', isDefault: false },
        { command: 'cmd.exe', path: 'C:\\Windows\\System32\\cmd.exe', isDefault: false },
      ],
    });
    vi.mocked(window.electronAPI.selectExecutableFile).mockResolvedValueOnce({
      success: true,
      data: 'C:\\Shells\\custom-shell.exe',
    });

    render(
      <I18nProvider>
        <SettingsPanel open={true} onClose={() => {}} />
      </I18nProvider>,
    );

    expect(await screen.findByText('(默认)C:\\Program Files\\PowerShell\\7\\pwsh.exe')).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: '全局默认 Shell 程序' }));
    expect(screen.queryByText('C:\\Program Files\\PowerShell\\7\\pwsh.exe')).not.toBeInTheDocument();
    await user.click(await screen.findByText('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'));

    expect(window.electronAPI.updateSettings).toHaveBeenCalledWith({
      terminal: {
        useBundledConptyDll: false,
        defaultShellProgram: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
        fontFamily: '',
        fontSize: 14,
      },
    });

    await user.click(screen.getByRole('button', { name: '自定义' }));

    expect(window.electronAPI.selectExecutableFile).toHaveBeenCalledOnce();
    expect(window.electronAPI.updateSettings).toHaveBeenLastCalledWith({
      terminal: {
        useBundledConptyDll: false,
        defaultShellProgram: 'C:\\Shells\\custom-shell.exe',
        fontFamily: '',
        fontSize: 14,
      },
    });
  });

  it('shows the bundled ConPTY setting on Windows', async () => {
    const user = userEvent.setup();

    render(
      <I18nProvider>
        <SettingsPanel open={true} onClose={() => {}} />
      </I18nProvider>,
    );

    await user.click(screen.getByRole('tab', { name: /高级设置/ }));
    expect(screen.getByText('使用随应用附带的 ConPTY 组件')).toBeInTheDocument();
  });

  it('hides the bundled ConPTY setting on macOS', async () => {
    const user = userEvent.setup();
    window.electronAPI.platform = 'darwin';

    render(
      <I18nProvider>
        <SettingsPanel open={true} onClose={() => {}} />
      </I18nProvider>,
    );

    await user.click(screen.getByRole('tab', { name: /高级设置/ }));
    expect(screen.queryByText('使用随应用附带的 ConPTY 组件')).not.toBeInTheDocument();
  });

  it('shows the Claude Agent Teams environment requirement in tmux settings', async () => {
    const user = userEvent.setup();

    render(
      <I18nProvider>
        <SettingsPanel open={true} onClose={() => {}} />
      </I18nProvider>,
    );

    await user.click(screen.getByRole('tab', { name: /高级设置/ }));
    expect(screen.getByText('Claude Agent Teams 环境变量')).toBeInTheDocument();
    expect(screen.getByText('CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1')).toBeInTheDocument();
  });

  it('manages SSH feature settings and trusted hosts in the advanced tab', async () => {
    const user = userEvent.setup();
    vi.mocked(window.electronAPI.getSettings).mockResolvedValue({
      success: true,
      data: {
        language: 'zh-CN',
        ides: [],
        quickNav: { items: [] },
        terminal: {
          useBundledConptyDll: false,
          defaultShellProgram: '',
        },
        features: {
          sshEnabled: true,
        },
      } as any,
    });
    vi.mocked(window.electronAPI.listKnownHosts).mockResolvedValue({
      success: true,
      data: [
        {
          id: 'known-host-1',
          host: 'ssh.example.com',
          port: 22,
          algorithm: 'ssh-ed25519',
          digest: 'SHA256:abc123',
          createdAt: '2026-03-20T12:00:00.000Z',
          updatedAt: '2026-03-21T13:00:00.000Z',
        },
      ],
    });

    render(
      <I18nProvider>
        <SettingsPanel open={true} onClose={() => {}} />
      </I18nProvider>,
    );

    await user.click(screen.getByRole('tab', { name: /高级设置/ }));

    expect(await screen.findByText('SSH 终端')).toBeInTheDocument();
    expect(screen.getByText('ssh.example.com:22')).toBeInTheDocument();
    expect(screen.getByText(/SHA256:abc123/)).toBeInTheDocument();

    await user.click(screen.getByRole('switch', { name: '启用 SSH 终端功能' }));

    expect(window.electronAPI.updateSettings).toHaveBeenCalledWith({
      features: {
        sshEnabled: false,
      },
    });

    await user.click(screen.getByRole('button', { name: '删除 ssh.example.com:22 的主机指纹' }));

    expect(window.electronAPI.removeKnownHost).toHaveBeenCalledWith('known-host-1');
    await waitFor(() => {
      expect(screen.queryByText('ssh.example.com:22')).not.toBeInTheDocument();
    });
  });

  it('renders the chat settings tab inside the settings panel', async () => {
    const user = userEvent.setup();

    render(
      <I18nProvider>
        <SettingsPanel open={true} onClose={() => {}} />
      </I18nProvider>,
    );

    await user.click(screen.getByRole('tab', { name: 'Chat' }));

    expect(await screen.findByText('LLM Providers')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '添加 Provider' })).toBeInTheDocument();
  });
});
