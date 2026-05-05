import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PluginCenter } from '../PluginCenter';
import { I18nProvider } from '../../../i18n';

describe('PluginCenter', () => {
  it('renders MCP visibility and capability summaries from loaded plugin state', async () => {
    vi.mocked(window.electronAPI.getSettings).mockResolvedValue({
      success: true,
      data: {
        ides: [],
        plugins: {},
      } as any,
    });
    vi.mocked(window.electronAPI.listPlugins).mockResolvedValue({
      success: true,
      data: [
        {
          id: 'acme.java-language',
          name: 'Java Language Support',
          publisher: 'Acme',
          source: 'marketplace',
          installStatus: 'installed',
          runtimeState: 'idle',
          health: 'unknown',
          enabledByDefault: true,
          manifest: {
            schemaVersion: 1,
            id: 'acme.java-language',
            name: 'Java Language Support',
            publisher: 'Acme',
            version: '1.0.0',
            engines: {
              app: '>=3.0.0',
            },
            capabilities: [
              {
                type: 'language-server',
                languages: ['java'],
                runtime: {
                  type: 'java',
                  entry: 'server/jdtls.jar',
                },
              },
              {
                type: 'command',
                command: 'java.test.run',
                title: 'Run Java Test',
              },
            ],
          },
        },
      ] as any,
    });
    vi.mocked(window.electronAPI.getPluginRegistry).mockResolvedValue({
      success: true,
      data: {
        schemaVersion: 1,
        plugins: {},
        globalPluginSettings: {},
      },
    });
    vi.mocked(window.electronAPI.getMcpServerSnapshots).mockResolvedValue({
      success: true,
      data: [
        {
          serverName: 'filesystem',
          toolCount: 2,
          tools: [
            { serverName: 'filesystem', toolName: 'read_file' },
            { serverName: 'filesystem', toolName: 'write_file' },
          ],
        },
      ],
    });

    render(
      <I18nProvider>
        <PluginCenter
          statusLineConfig={{
            enabled: false,
            displayLocation: 'both',
            cliFormat: 'full',
            cardFormat: 'compact',
            showModel: true,
            showContext: true,
            showCost: true,
            showTime: false,
            showTokens: false,
          }}
          onToggleStatusLine={vi.fn().mockResolvedValue(undefined)}
          onStatusLineConfigChange={vi.fn().mockResolvedValue(undefined)}
        />
      </I18nProvider>,
    );

    expect(await screen.findByRole('heading', { name: '能力概览' })).toBeInTheDocument();
    expect(screen.getByText('MCP 能力')).toBeInTheDocument();
    expect(screen.getByText('filesystem')).toBeInTheDocument();
    expect(screen.getByText('2 个工具')).toBeInTheDocument();
    expect(screen.getByText('read_file')).toBeInTheDocument();
    expect(screen.getByText('write_file')).toBeInTheDocument();
    expect(screen.getByText('插件能力摘要')).toBeInTheDocument();
    expect(screen.getByText('language-server')).toBeInTheDocument();
    expect(screen.getByText('command')).toBeInTheDocument();
  });
});
