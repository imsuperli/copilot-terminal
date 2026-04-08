import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { homedir } from 'os';
import { app } from 'electron';
import { WorkspaceManagerImpl } from '../WorkspaceManager';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/user/data'),
    getLocale: vi.fn(() => 'en-US'),
  },
}));

vi.mock('../../utils/ideScanner', () => ({
  getSupportedIDEIds: vi.fn(() => new Set<string>()),
}));

describe('WorkspaceManager tilde cwd normalization', () => {
  let testDir: string;
  let workspacePath: string;
  let workspaceManager: WorkspaceManagerImpl;

  beforeEach(async () => {
    testDir = path.join(__dirname, '.test-workspace-tilde');
    await fs.ensureDir(testDir);
    vi.mocked(app.getPath).mockReturnValue(testDir);
    vi.mocked(app.getLocale).mockReturnValue('en-US');
    workspaceManager = new WorkspaceManagerImpl();
    workspacePath = path.join(testDir, 'workspace.json');
  });

  afterEach(async () => {
    await fs.remove(testDir);
  });

  it('expands persisted local pane cwd values that start with a tilde', async () => {
    const workspace = {
      version: '3.0',
      windows: [
        {
          id: 'window-1',
          name: 'Local Window',
          layout: {
            type: 'pane',
            id: 'pane-1',
            pane: {
              id: 'pane-1',
              cwd: '~/develop/copilot-terminal',
              command: 'bash',
              backend: 'local',
            },
          },
          activePaneId: 'pane-1',
          createdAt: '2026-04-08T00:00:00.000Z',
          lastActiveAt: '2026-04-08T00:00:00.000Z',
        },
      ],
      groups: [],
      settings: {
        notificationsEnabled: true,
        theme: 'dark',
        autoSave: true,
        autoSaveInterval: 5,
      },
      lastSavedAt: '2026-04-08T00:00:00.000Z',
    };

    await fs.writeJson(workspacePath, workspace, { spaces: 2 });

    const loaded = await workspaceManager.loadWorkspace();
    const paneLayout = loaded.windows[0]?.layout;
    expect(paneLayout?.type).toBe('pane');
    if (!paneLayout || paneLayout.type !== 'pane') {
      throw new Error('expected pane layout');
    }

    expect(paneLayout.pane.cwd).toBe(path.join(homedir(), 'develop', 'copilot-terminal'));

    const persisted = await fs.readJson(workspacePath);
    expect(persisted.windows[0].layout.pane.cwd).toBe(path.join(homedir(), 'develop', 'copilot-terminal'));
  });
});
