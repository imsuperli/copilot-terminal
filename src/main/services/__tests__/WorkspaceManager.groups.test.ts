import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
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

describe('WorkspaceManager group and canvas normalization', () => {
  let testDir: string;
  let workspacePath: string;
  let workspaceManager: WorkspaceManagerImpl;

  beforeEach(async () => {
    testDir = path.join(__dirname, '.test-workspace-groups');
    await fs.ensureDir(testDir);
    vi.mocked(app.getPath).mockReturnValue(testDir);
    vi.mocked(app.getLocale).mockReturnValue('en-US');
    workspaceManager = new WorkspaceManagerImpl();
    workspacePath = path.join(testDir, 'workspace.json');
  });

  afterEach(async () => {
    await fs.remove(testDir);
  });

  it('migrates a 2.0 workspace by adding groups and canvasWorkspaces arrays', async () => {
    await fs.writeJson(workspacePath, {
      version: '2.0',
      windows: [],
      settings: {
        notificationsEnabled: true,
        theme: 'dark',
        autoSave: true,
        autoSaveInterval: 5,
      },
      lastSavedAt: '2026-05-03T00:00:00.000Z',
    }, { spaces: 2 });

    const loaded = await workspaceManager.loadWorkspace();
    expect(loaded.version).toBe('3.0');
    expect(loaded.groups).toEqual([]);
    expect(loaded.canvasWorkspaces).toEqual([]);

    const persisted = await fs.readJson(workspacePath);
    expect(persisted.version).toBe('3.0');
    expect(persisted.groups).toEqual([]);
    expect(persisted.canvasWorkspaces).toEqual([]);
  });

  it('keeps workspaces without a groups field backward compatible', async () => {
    await fs.writeJson(workspacePath, {
      version: '3.0',
      windows: [],
      canvasWorkspaces: [],
      settings: {
        notificationsEnabled: true,
        theme: 'dark',
        autoSave: true,
        autoSaveInterval: 5,
      },
      lastSavedAt: '2026-05-03T00:00:00.000Z',
    }, { spaces: 2 });

    const loaded = await workspaceManager.loadWorkspace();
    expect(loaded.groups).toEqual([]);
    expect(loaded.canvasWorkspaces).toEqual([]);
  });

  it('removes invalid group nodes and dissolves groups that end up with fewer than two valid windows', async () => {
    await fs.writeJson(workspacePath, {
      version: '3.0',
      windows: [
        {
          id: 'window-1',
          name: 'Window 1',
          activePaneId: 'pane-1',
          createdAt: '2026-05-03T00:00:00.000Z',
          lastActiveAt: '2026-05-03T00:00:00.000Z',
          layout: {
            type: 'pane',
            id: 'pane-node-1',
            pane: {
              id: 'pane-1',
              cwd: '/workspace/project-a',
              command: 'bash',
              backend: 'local',
            },
          },
        },
        {
          id: 'window-2',
          name: 'Window 2',
          activePaneId: 'pane-2',
          createdAt: '2026-05-03T00:00:00.000Z',
          lastActiveAt: '2026-05-03T00:00:00.000Z',
          layout: {
            type: 'pane',
            id: 'pane-node-2',
            pane: {
              id: 'pane-2',
              cwd: '/workspace/project-b',
              command: 'bash',
              backend: 'local',
            },
          },
        },
      ],
      groups: [
        {
          id: 'group-1',
          name: 'Valid after cleanup',
          layout: {
            type: 'split',
            direction: 'horizontal',
            sizes: [0.2, 0.4, 0.4],
            children: [
              { type: 'window', id: 'missing-window' },
              { type: 'window', id: 'window-1' },
              { type: 'window', id: 'window-2' },
            ],
          },
          activeWindowId: 'missing-window',
          createdAt: '2026-05-03T00:00:00.000Z',
          lastActiveAt: '2026-05-03T00:00:00.000Z',
        },
        {
          id: 'group-2',
          name: 'Should dissolve',
          layout: {
            type: 'split',
            direction: 'horizontal',
            sizes: [0.5, 0.5],
            children: [
              { type: 'window', id: 'window-1' },
              { type: 'window', id: 'missing-window-2' },
            ],
          },
          activeWindowId: 'window-1',
          createdAt: '2026-05-03T00:00:00.000Z',
          lastActiveAt: '2026-05-03T00:00:00.000Z',
        },
      ],
      canvasWorkspaces: [],
      settings: {
        notificationsEnabled: true,
        theme: 'dark',
        autoSave: true,
        autoSaveInterval: 5,
      },
      lastSavedAt: '2026-05-03T00:00:00.000Z',
    }, { spaces: 2 });

    const loaded = await workspaceManager.loadWorkspace();
    expect(loaded.groups).toHaveLength(1);
    expect(loaded.groups[0]?.id).toBe('group-1');
    expect(loaded.groups[0]?.activeWindowId).toBe('window-1');
    expect(loaded.groups[0]?.layout).toMatchObject({
      type: 'split',
      sizes: [0.5, 0.5],
    });
  });
});
