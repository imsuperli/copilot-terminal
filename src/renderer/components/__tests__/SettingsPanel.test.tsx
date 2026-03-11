import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
        { command: 'pwsh.exe', label: 'PowerShell 7 (pwsh.exe)', isDefault: true },
        { command: 'powershell.exe', label: 'Windows PowerShell 5.1 (powershell.exe)', isDefault: false },
        { command: 'cmd.exe', label: 'Command Prompt (cmd.exe)', isDefault: false },
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

    expect(await screen.findByText('PowerShell 7 (pwsh.exe)（当前内置默认）')).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: '全局默认 Shell 程序' }));
    await user.click(await screen.findByText('Windows PowerShell 5.1 (powershell.exe)'));

    expect(window.electronAPI.updateSettings).toHaveBeenCalledWith({
      terminal: {
        useBundledConptyDll: false,
        defaultShellProgram: 'powershell.exe',
      },
    });

    await user.click(screen.getByRole('button', { name: '自定义' }));

    expect(window.electronAPI.selectExecutableFile).toHaveBeenCalledOnce();
    expect(window.electronAPI.updateSettings).toHaveBeenLastCalledWith({
      terminal: {
        useBundledConptyDll: false,
        defaultShellProgram: 'C:\\Shells\\custom-shell.exe',
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
});
