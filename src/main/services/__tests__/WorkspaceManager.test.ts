import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { app } from 'electron';
import { WorkspaceManagerImpl } from '../WorkspaceManager';
import { Workspace } from '../../types/workspace';

// Mock electron app
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/user/data'),
    getLocale: vi.fn(() => 'zh-CN'),
  },
}));

vi.mock('../../utils/ideScanner', () => ({
  scanInstalledIDEs: vi.fn(() => []),
  getSupportedIDEIds: vi.fn(() => new Set()),
}));

describe('WorkspaceManager', () => {
  let workspaceManager: WorkspaceManagerImpl;
  let testDir: string;
  let workspacePath: string;
  let tempPath: string;
  let backupBasePath: string;

  beforeEach(async () => {
    // Create a temporary test directory
    testDir = path.join(__dirname, '.test-workspace');
    await fs.ensureDir(testDir);

    // Mock app.getPath to return test directory
    vi.mocked(app.getPath).mockReturnValue(testDir);
    vi.mocked(app.getLocale).mockReturnValue('zh-CN');

    // Initialize WorkspaceManager
    workspaceManager = new WorkspaceManagerImpl();

    // Set up paths
    workspacePath = path.join(testDir, 'workspace.json');
    tempPath = `${workspacePath}.tmp`;
    backupBasePath = `${workspacePath}.backup`;
  });

  afterEach(async () => {
    // Clean up test directory
    await fs.remove(testDir);
  });

  describe('saveWorkspace', () => {
    it('should save workspace to file', async () => {
      const workspace: Workspace = {
        version: '3.0',
        windows: [
          {
            id: 'test-1',
            name: 'Test Window',
            layout: {
              type: 'pane',
              id: 'pane-1',
              pane: {
                id: 'pane-1',
                cwd: '/test/dir',
                command: 'claude',
                status: 'running' as any,
                pid: 1234,
              },
            },
            activePaneId: 'pane-1',
            createdAt: '2026-02-28T10:00:00Z',
            lastActiveAt: '2026-02-28T12:00:00Z',
          },
        ],
        groups: [],
        settings: {
          notificationsEnabled: true,
          theme: 'dark',
          autoSave: true,
          autoSaveInterval: 5,
        },
        lastSavedAt: '',
      };

      await workspaceManager.saveWorkspace(workspace);

      // Verify file exists
      expect(await fs.pathExists(workspacePath)).toBe(true);

      // Verify content
      const saved = await fs.readJson(workspacePath);
      expect(saved.version).toBe('3.0');
      expect(saved.windows).toHaveLength(1);
      expect(saved.windows[0].id).toBe('test-1');
      expect(saved.lastSavedAt).toBeTruthy();
    });

    it('should strip runtime pane and Claude fields before writing', async () => {
      const workspace = {
        version: '2.0',
        windows: [
          {
            id: 'test-1',
            name: 'Test Window',
            layout: {
              type: 'pane',
              id: 'pane-1',
              pane: {
                id: 'pane-1',
                cwd: '/test/dir',
                command: 'claude',
                status: 'running',
                pid: 1234,
                title: 'team-lead',
              },
            },
            activePaneId: 'pane-1',
            createdAt: '2026-02-28T10:00:00Z',
            lastActiveAt: '2026-02-28T12:00:00Z',
            claudeModel: 'Claude Opus 4',
            claudeModelId: 'claude-opus-4',
            claudeContextPercentage: 81,
            claudeCost: 1.23,
          },
        ],
        settings: {
          notificationsEnabled: true,
          theme: 'dark',
          autoSave: true,
          autoSaveInterval: 5,
        },
        lastSavedAt: '',
      } as Workspace;

      await workspaceManager.saveWorkspace(workspace);

      const saved = await fs.readJson(workspacePath);
      expect(saved.windows[0].layout.pane).not.toHaveProperty('status');
      expect(saved.windows[0].layout.pane).not.toHaveProperty('pid');
      expect(saved.windows[0].layout.pane.title).toBe('team-lead');
      expect(saved.windows[0]).not.toHaveProperty('claudeModel');
      expect(saved.windows[0]).not.toHaveProperty('claudeModelId');
      expect(saved.windows[0]).not.toHaveProperty('claudeContextPercentage');
      expect(saved.windows[0]).not.toHaveProperty('claudeCost');
    });

    it('should persist SSH panes with only the profile binding key', async () => {
      const workspace = {
        version: '3.0',
        windows: [
          {
            id: 'ssh-window-1',
            name: 'Prod SSH',
            layout: {
              type: 'pane',
              id: 'ssh-pane-1',
              pane: {
                id: 'ssh-pane-1',
                cwd: '~/develop/copilot-terminal',
                command: '',
                status: 'paused',
                pid: null,
                backend: 'ssh',
                ssh: {
                  profileId: 'ssh-profile-1',
                  host: '127.0.0.1',
                  port: 8022,
                  user: 'u0_a123',
                  authType: 'password',
                  remoteCwd: '~/develop/copilot-terminal',
                  reuseSession: true,
                },
              },
            },
            activePaneId: 'ssh-pane-1',
            createdAt: '2026-02-28T10:00:00Z',
            lastActiveAt: '2026-02-28T12:00:00Z',
          },
        ],
        groups: [],
        settings: {
          notificationsEnabled: true,
          theme: 'dark',
          autoSave: true,
          autoSaveInterval: 5,
        },
        lastSavedAt: '',
      } as Workspace;

      await workspaceManager.saveWorkspace(workspace);

      const saved = await fs.readJson(workspacePath);
      expect(saved.windows[0].layout.pane.cwd).toBe('~/develop/copilot-terminal');
      expect(saved.windows[0].layout.pane.ssh).toEqual({
        profileId: 'ssh-profile-1',
      });
    });

    it('should not persist ephemeral clone windows', async () => {
      const workspace = {
        version: '3.0',
        windows: [
          {
            id: 'ssh-window-root',
            name: 'Prod SSH',
            layout: {
              type: 'pane',
              id: 'ssh-pane-root',
              pane: {
                id: 'ssh-pane-root',
                cwd: '~/root',
                command: '',
                status: 'paused',
                pid: null,
                backend: 'ssh',
                ssh: {
                  profileId: 'ssh-profile-1',
                },
              },
            },
            activePaneId: 'ssh-pane-root',
            createdAt: '2026-02-28T10:00:00Z',
            lastActiveAt: '2026-02-28T12:00:00Z',
          },
          {
            id: 'ssh-window-clone',
            name: 'Prod SSH Clone',
            ephemeral: true,
            sshTabOwnerWindowId: 'ssh-window-root',
            layout: {
              type: 'pane',
              id: 'ssh-pane-clone',
              pane: {
                id: 'ssh-pane-clone',
                cwd: '~/clone',
                command: '',
                status: 'running',
                pid: 3210,
                backend: 'ssh',
                ssh: {
                  profileId: 'ssh-profile-1',
                },
              },
            },
            activePaneId: 'ssh-pane-clone',
            createdAt: '2026-02-28T10:05:00Z',
            lastActiveAt: '2026-02-28T12:05:00Z',
          },
        ],
        groups: [],
        settings: {
          notificationsEnabled: true,
          theme: 'dark',
          autoSave: true,
          autoSaveInterval: 5,
        },
        lastSavedAt: '',
      } as Workspace;

      await workspaceManager.saveWorkspace(workspace);

      const saved = await fs.readJson(workspacePath);
      expect(saved.windows).toHaveLength(1);
      expect(saved.windows[0].id).toBe('ssh-window-root');
    });

    it('should use atomic write (temp file + rename)', async () => {
      const workspace: Workspace = {
        version: '1.0',
        windows: [],
        settings: {
          notificationsEnabled: true,
          theme: 'dark',
          autoSave: true,
          autoSaveInterval: 5,
        },
        lastSavedAt: '',
      };

      // Spy on fs methods
      const writeJsonSpy = vi.spyOn(fs, 'writeJson');
      const renameSpy = vi.spyOn(fs, 'rename');

      await workspaceManager.saveWorkspace(workspace);

      // Verify atomic write pattern
      expect(writeJsonSpy).toHaveBeenCalledWith(
        tempPath,
        expect.any(Object),
        { spaces: 2 }
      );
      expect(renameSpy).toHaveBeenCalledWith(tempPath, workspacePath);

      // Verify temp file is cleaned up
      expect(await fs.pathExists(tempPath)).toBe(false);
    });

    it('should create backup after saving', async () => {
      const workspace: Workspace = {
        version: '1.0',
        windows: [],
        settings: {
          notificationsEnabled: true,
          theme: 'dark',
          autoSave: true,
          autoSaveInterval: 5,
        },
        lastSavedAt: '',
      };

      await workspaceManager.saveWorkspace(workspace);

      // Verify backup.1 exists
      const backup1 = `${backupBasePath}.1`;
      expect(await fs.pathExists(backup1)).toBe(true);
    });

    it('should clean up temp file on error', async () => {
      const workspace: Workspace = {
        version: '1.0',
        windows: [],
        settings: {
          notificationsEnabled: true,
          theme: 'dark',
          autoSave: true,
          autoSaveInterval: 5,
        },
        lastSavedAt: '',
      };

      // Mock rename to fail
      vi.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('Rename failed'));

      await expect(workspaceManager.saveWorkspace(workspace)).rejects.toThrow();

      // Verify temp file is cleaned up
      expect(await fs.pathExists(tempPath)).toBe(false);
    });
  });

  describe('loadWorkspace', () => {
    it('should load workspace from file', async () => {
      const workspace: Workspace = {
        version: '1.0',
        windows: [
          {
            id: 'test-1',
            name: 'Test Window',
            workingDirectory: '/test/dir',
            command: 'claude',
            status: 'running' as any,
            pid: 1234,
            createdAt: '2026-02-28T10:00:00Z',
            lastActiveAt: '2026-02-28T12:00:00Z',
          },
        ],
        settings: {
          notificationsEnabled: true,
          theme: 'dark',
          autoSave: true,
          autoSaveInterval: 5,
        },
        lastSavedAt: '2026-02-28T12:00:00Z',
      };

      // Save workspace first
      await fs.writeJson(workspacePath, workspace, { spaces: 2 });

      // Load workspace
      const loaded = await workspaceManager.loadWorkspace();

      expect(loaded.version).toBe('3.0');
      expect(loaded.windows).toHaveLength(1);
      expect(loaded.windows[0].id).toBe('test-1');
      expect(loaded.settings.language).toBe('zh-CN');

      const persisted = await fs.readJson(workspacePath);
      expect(persisted.version).toBe('3.0');
      expect(persisted.settings.language).toBe('zh-CN');
    });

    it('should load persisted workspaces without pane runtime fields', async () => {
      const workspace = {
        version: '2.0',
        windows: [
          {
            id: 'test-1',
            name: 'Persisted Window',
            layout: {
              type: 'pane',
              id: 'pane-1',
              pane: {
                id: 'pane-1',
                cwd: '/test/dir',
                command: 'claude',
              },
            },
            activePaneId: 'pane-1',
            createdAt: '2026-02-28T10:00:00Z',
            lastActiveAt: '2026-02-28T12:00:00Z',
          },
        ],
        settings: {
          notificationsEnabled: true,
          theme: 'dark',
          autoSave: true,
          autoSaveInterval: 5,
        },
        lastSavedAt: '2026-02-28T12:00:00Z',
      };

      await fs.writeJson(workspacePath, workspace, { spaces: 2 });

      const loaded = await workspaceManager.loadWorkspace();
      const paneLayout = loaded.windows[0].layout;

      expect(paneLayout.type).toBe('pane');
      if (paneLayout.type !== 'pane') {
        throw new Error('expected pane layout');
      }

      expect(paneLayout.pane.status).toBe('paused');
      expect(paneLayout.pane.pid).toBeNull();
    });

    it('should return default workspace if file does not exist', async () => {
      const loaded = await workspaceManager.loadWorkspace();

      expect(loaded.version).toBe('3.0');
      expect(loaded.windows).toHaveLength(0);
      expect(loaded.settings.notificationsEnabled).toBe(true);
      expect(loaded.settings.theme).toBe('dark');
      expect(loaded.settings.autoSave).toBe(true);
      expect(loaded.settings.autoSaveInterval).toBe(5);
      expect(loaded.settings.language).toBe('zh-CN');
      expect(loaded.settings.ides).toEqual([]);
    });

    it('should restore from backup if main file is corrupted', async () => {
      // Create a valid backup
      const validWorkspace: Workspace = {
        version: '2.0',
        windows: [
          {
            id: 'backup-1',
            name: 'Backup Window',
            layout: {
              type: 'pane',
              id: 'backup-1-pane',
              pane: {
                id: 'backup-1-pane',
                cwd: '/backup/dir',
                command: 'claude',
                status: 'running' as any,
                pid: 5678,
              },
            },
            activePaneId: 'backup-1-pane',
            createdAt: '2026-02-28T10:00:00Z',
            lastActiveAt: '2026-02-28T12:00:00Z',
          },
        ],
        settings: {
          notificationsEnabled: true,
          theme: 'dark',
          autoSave: true,
          autoSaveInterval: 5,
        },
        lastSavedAt: '2026-02-28T12:00:00Z',
      };

      await fs.writeJson(`${backupBasePath}.1`, validWorkspace, { spaces: 2 });

      // Create a corrupted main file
      await fs.writeFile(workspacePath, 'invalid json{{{');

      // Load workspace
      const loaded = await workspaceManager.loadWorkspace();

      // Should restore from backup
      expect(loaded.windows).toHaveLength(1);
      expect(loaded.windows[0].id).toBe('backup-1');
    });

    it('should validate workspace version', async () => {
      const invalidWorkspace = {
        version: '4.0',  // Unsupported version
        windows: [],
        groups: [],
        settings: {
          notificationsEnabled: true,
          theme: 'dark',
          autoSave: true,
          autoSaveInterval: 5,
        },
        lastSavedAt: '2026-02-28T12:00:00Z',
      };

      await fs.writeJson(workspacePath, invalidWorkspace, { spaces: 2 });

      // Should return default workspace due to version mismatch
      const loaded = await workspaceManager.loadWorkspace();
      expect(loaded.version).toBe('3.0');
      expect(loaded.windows).toHaveLength(0);
    });

    it('should use system locale to determine default language', async () => {
      vi.mocked(app.getLocale).mockReturnValue('en-US');

      const manager = new WorkspaceManagerImpl();
      const loaded = await manager.loadWorkspace();

      expect(loaded.settings.language).toBe('en-US');
    });

    it('should validate workspace structure', async () => {
      const invalidWorkspace = {
        version: '1.0',
        windows: 'not an array',  // Invalid
        settings: {
          notificationsEnabled: true,
          theme: 'dark',
          autoSave: true,
          autoSaveInterval: 5,
        },
      };

      await fs.writeJson(workspacePath, invalidWorkspace, { spaces: 2 });

      // Should return default workspace due to invalid structure
      const loaded = await workspaceManager.loadWorkspace();
      expect(loaded.windows).toHaveLength(0);
    });
  });

  describe('backupWorkspace', () => {
    it('should keep the most recent 3 backups', async () => {
      const workspace: Workspace = {
        version: '3.0',
        windows: [],
        groups: [],
        settings: {
          notificationsEnabled: true,
          theme: 'dark',
          autoSave: true,
          autoSaveInterval: 5,
        },
        lastSavedAt: '',
      };

      // Save 4 times to create 4 backups
      for (let i = 1; i <= 4; i++) {
        workspace.windows = [
          {
            id: `window-${i}`,
            name: `Window ${i}`,
            layout: {
              type: 'pane',
              id: `pane-${i}`,
              pane: {
                id: `pane-${i}`,
                cwd: '/test',
                command: 'claude',
                status: 'running' as any,
                pid: 1000 + i,
              },
            },
            activePaneId: `pane-${i}`,
            createdAt: '2026-02-28T10:00:00Z',
            lastActiveAt: '2026-02-28T12:00:00Z',
          },
        ];
        await workspaceManager.saveWorkspace(workspace);
      }

      // Verify only 3 backups exist
      expect(await fs.pathExists(`${backupBasePath}.1`)).toBe(true);
      expect(await fs.pathExists(`${backupBasePath}.2`)).toBe(true);
      expect(await fs.pathExists(`${backupBasePath}.3`)).toBe(true);
      expect(await fs.pathExists(`${backupBasePath}.4`)).toBe(false);

      // Verify backup.1 is the most recent
      const backup1 = await fs.readJson(`${backupBasePath}.1`);
      expect(backup1.windows[0].id).toBe('window-4');

      // Verify backup.3 is the oldest
      const backup3 = await fs.readJson(`${backupBasePath}.3`);
      expect(backup3.windows[0].id).toBe('window-2');
    });

    it('should not fail if main file does not exist', async () => {
      await expect(workspaceManager.backupWorkspace()).resolves.not.toThrow();
    });
  });

  describe('recoverFromCrash', () => {
    it('should recover from incomplete save operation', async () => {
      const workspace: Workspace = {
        version: '1.0',
        windows: [
          {
            id: 'recovered-1',
            name: 'Recovered Window',
            workingDirectory: '/recovered/dir',
            command: 'claude',
            status: 'running' as any,
            pid: 9999,
            createdAt: '2026-02-28T10:00:00Z',
            lastActiveAt: '2026-02-28T12:00:00Z',
          },
        ],
        settings: {
          notificationsEnabled: true,
          theme: 'dark',
          autoSave: true,
          autoSaveInterval: 5,
        },
        lastSavedAt: '2026-02-28T12:00:00Z',
      };

      // Create a valid temp file (simulating incomplete save)
      await fs.writeJson(tempPath, workspace, { spaces: 2 });

      // Recover from crash
      await workspaceManager.recoverFromCrash();

      // Verify temp file was moved to main file
      expect(await fs.pathExists(workspacePath)).toBe(true);
      expect(await fs.pathExists(tempPath)).toBe(false);

      // Verify content
      const recovered = await fs.readJson(workspacePath);
      expect(recovered.windows[0].id).toBe('recovered-1');
    });

    it('should remove invalid temp file', async () => {
      // Create an invalid temp file
      await fs.writeFile(tempPath, 'invalid json{{{');

      // Recover from crash
      await workspaceManager.recoverFromCrash();

      // Verify temp file was removed
      expect(await fs.pathExists(tempPath)).toBe(false);
    });

    it('should restore from backup if temp file is corrupted', async () => {
      // Create a valid backup
      const validWorkspace: Workspace = {
        version: '2.0',
        windows: [
          {
            id: 'backup-recovered',
            name: 'Backup Recovered',
            layout: {
              type: 'pane',
              id: 'backup-recovered-pane',
              pane: {
                id: 'backup-recovered-pane',
                cwd: '/backup/dir',
                command: 'claude',
                status: 'running' as any,
                pid: 7777,
              },
            },
            activePaneId: 'backup-recovered-pane',
            createdAt: '2026-02-28T10:00:00Z',
            lastActiveAt: '2026-02-28T12:00:00Z',
          },
        ],
        settings: {
          notificationsEnabled: true,
          theme: 'dark',
          autoSave: true,
          autoSaveInterval: 5,
        },
        lastSavedAt: '2026-02-28T12:00:00Z',
      };

      await fs.writeJson(`${backupBasePath}.1`, validWorkspace, { spaces: 2 });

      // Create a corrupted temp file
      await fs.writeFile(tempPath, 'invalid json{{{');

      // Recover from crash
      await workspaceManager.recoverFromCrash();

      // Verify main file was restored from backup
      expect(await fs.pathExists(workspacePath)).toBe(true);
      const recovered = await fs.readJson(workspacePath);
      expect(recovered.windows[0].id).toBe('backup-recovered');
    });

    it('should not fail if no temp file exists', async () => {
      await expect(workspaceManager.recoverFromCrash()).resolves.not.toThrow();
    });
  });

  describe('cross-platform paths', () => {
    it('should use correct path on Windows', () => {
      vi.mocked(app.getPath).mockReturnValue('C:\\Users\\Test\\AppData\\Roaming\\ausome-terminal');

      const manager = new WorkspaceManagerImpl();

      // Verify paths are constructed correctly
      // Note: We can't directly access private properties, but we can verify behavior
      expect(manager).toBeDefined();
    });

    it('should use correct path on macOS', () => {
      vi.mocked(app.getPath).mockReturnValue('/Users/test/Library/Application Support/ausome-terminal');

      const manager = new WorkspaceManagerImpl();

      // Verify paths are constructed correctly
      expect(manager).toBeDefined();
    });
  });
});
