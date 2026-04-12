import { describe, expect, it } from 'vitest';
import { buildRuntimeEnvironment } from '../runtime/shared';

describe('language runtime shared helpers', () => {
  it('passes merged plugin settings to runtime processes as JSON', () => {
    const env = buildRuntimeEnvironment({
      type: 'node',
      entry: 'bin/server.cjs',
    }, {
      pluginId: 'official.python-pyright',
      pluginInstallPath: '/plugins/official.python-pyright',
      projectRoot: '/workspace/project',
      workspaceStoragePath: '/runtime/python',
      runtimeRootPath: '/runtime',
      settings: {
        'python.command': 'pyright-langserver',
        'python.analysis.typeCheckingMode': 'basic',
      },
    });

    expect(env.COPILOT_TERMINAL_PLUGIN_ID).toBe('official.python-pyright');
    expect(env.COPILOT_TERMINAL_PROJECT_ROOT).toBe('/workspace/project');
    expect(env.COPILOT_TERMINAL_WORKSPACE_STORAGE).toBe('/runtime/python');
    expect(env.COPILOT_TERMINAL_PLUGIN_SETTINGS).toBe(JSON.stringify({
      'python.command': 'pyright-langserver',
      'python.analysis.typeCheckingMode': 'basic',
    }));
  });
});
