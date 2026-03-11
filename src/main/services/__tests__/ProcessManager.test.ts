import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProcessManager } from '../ProcessManager';
import { ProcessStatus } from '../../types/process';
import { TmuxCompatService } from '../TmuxCompatService';
import { WindowStatus } from '../../../shared/types/window';
import { tmpdir } from 'os';

describe('ProcessManager', () => {
  let processManager: ProcessManager;
  const testWorkingDir = tmpdir(); // Use real temp directory

  beforeEach(() => {
    processManager = new ProcessManager();
  });

  describe('spawnTerminal', () => {
    it('creates a new terminal process with valid config', async () => {
      const config = {
        workingDirectory: testWorkingDir,
        command: 'pwsh.exe',
      };

      const handle = await processManager.spawnTerminal(config);

      expect(handle).toBeDefined();
      expect(handle.pid).toBeGreaterThan(0);
      expect(handle.pty).toBeDefined();
    });

    it('throws error if working directory does not exist', async () => {
      const config = {
        workingDirectory: '/invalid/dir/that/does/not/exist',
      };

      await expect(processManager.spawnTerminal(config)).rejects.toThrow(
        'Working directory does not exist'
      );
    });

    it('uses default shell when command is not provided', async () => {
      const config = {
        workingDirectory: testWorkingDir,
      };

      const handle = await processManager.spawnTerminal(config);
      const status = processManager.getProcessStatus(handle.pid);

      expect(status).toBeDefined();
      expect(status?.command).toBeDefined();
      // Should use platform default shell
      expect(status?.command).toMatch(/(pwsh|cmd|zsh|bash)/);
    });

    it('uses the global default shell when the window does not override it', async () => {
      const processManagerWithGlobalShell = new ProcessManager(
        () => ({
          terminal: {
            useBundledConptyDll: true,
            defaultShellProgram: 'powershell.exe',
          },
        } as any),
      );

      const handle = await processManagerWithGlobalShell.spawnTerminal({
        workingDirectory: testWorkingDir,
      });
      const status = processManagerWithGlobalShell.getProcessStatus(handle.pid);

      expect(status?.command).toBe('powershell.exe');
    });

    it('prefers the window shell over the global default shell', async () => {
      const processManagerWithGlobalShell = new ProcessManager(
        () => ({
          terminal: {
            useBundledConptyDll: true,
            defaultShellProgram: 'powershell.exe',
          },
        } as any),
      );

      const handle = await processManagerWithGlobalShell.spawnTerminal({
        workingDirectory: testWorkingDir,
        command: 'cmd.exe',
      });
      const status = processManagerWithGlobalShell.getProcessStatus(handle.pid);

      expect(status?.command).toBe('cmd.exe');
    });

    it('emits process-created event', async () => {
      const config = {
        workingDirectory: testWorkingDir,
      };

      const eventSpy = vi.fn();
      processManager.on('process-created', eventSpy);

      await processManager.spawnTerminal(config);

      expect(eventSpy).toHaveBeenCalledOnce();
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          pid: expect.any(Number),
          status: ProcessStatus.Alive,
        })
      );
    });
  });

  describe('killProcess', () => {
    it('terminates an existing process', async () => {
      const config = {
        workingDirectory: testWorkingDir,
      };

      const handle = await processManager.spawnTerminal(config);
      await processManager.killProcess(handle.pid);

      const status = processManager.getProcessStatus(handle.pid);
      expect(status?.status).toBe(ProcessStatus.Exited);
      expect(status?.exitCode).toBe(0);
    });

    it('throws error if process not found', async () => {
      await expect(processManager.killProcess(9999)).rejects.toThrow(
        'Process not found'
      );
    });

    it('throws error if process already exited', async () => {
      const config = {
        workingDirectory: testWorkingDir,
      };

      const handle = await processManager.spawnTerminal(config);
      await processManager.killProcess(handle.pid);

      await expect(processManager.killProcess(handle.pid)).rejects.toThrow(
        'Process already exited'
      );
    });

    it('emits process-exited event', async () => {
      const config = {
        workingDirectory: testWorkingDir,
      };

      const eventSpy = vi.fn();
      processManager.on('process-exited', eventSpy);

      const handle = await processManager.spawnTerminal(config);
      await processManager.killProcess(handle.pid);

      expect(eventSpy).toHaveBeenCalledOnce();
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          pid: handle.pid,
          status: ProcessStatus.Exited,
          exitCode: 0,
        })
      );
    });
  });

  describe('getProcessStatus', () => {
    it('returns process info for existing process', async () => {
      const config = {
        workingDirectory: testWorkingDir,
      };

      const handle = await processManager.spawnTerminal(config);
      const status = processManager.getProcessStatus(handle.pid);

      expect(status).toBeDefined();
      expect(status?.pid).toBe(handle.pid);
      expect(status?.status).toBe(ProcessStatus.Alive);
      expect(status?.workingDirectory).toBe(testWorkingDir);
    });

    it('returns null for non-existent process', () => {
      const status = processManager.getProcessStatus(9999);
      expect(status).toBeNull();
    });
  });

  describe('listProcesses', () => {
    it('returns empty array when no processes', () => {
      const processes = processManager.listProcesses();
      expect(processes).toEqual([]);
    });

    it('returns all active processes', async () => {
      const config1 = { workingDirectory: testWorkingDir };
      const config2 = { workingDirectory: testWorkingDir };

      const handle1 = await processManager.spawnTerminal(config1);
      const handle2 = await processManager.spawnTerminal(config2);

      const processes = processManager.listProcesses();

      expect(processes).toHaveLength(2);
      expect(processes.map(p => p.pid)).toContain(handle1.pid);
      expect(processes.map(p => p.pid)).toContain(handle2.pid);
    });

    it('excludes terminated processes after cleanup', async () => {
      const config = { workingDirectory: testWorkingDir };

      const handle = await processManager.spawnTerminal(config);
      await processManager.killProcess(handle.pid);

      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 1100));

      const processes = processManager.listProcesses();
      expect(processes).toHaveLength(0);
    });
  });

  describe('process isolation', () => {
    it('single process failure does not affect other processes', async () => {
      const config1 = { workingDirectory: testWorkingDir };
      const config2 = { workingDirectory: testWorkingDir };

      const handle1 = await processManager.spawnTerminal(config1);
      const handle2 = await processManager.spawnTerminal(config2);

      // Kill first process
      await processManager.killProcess(handle1.pid);

      // Second process should still be alive
      const status2 = processManager.getProcessStatus(handle2.pid);
      expect(status2?.status).toBe(ProcessStatus.Alive);
    });
  });

  describe('tmux compatibility', () => {
    it('ensures tmux RPC server before spawning when tmux compat is enabled', async () => {
      const tmuxCompatService = {
        executeCommand: vi.fn(),
        allocatePaneId: vi.fn().mockReturnValue('%1'),
        resolvePaneId: vi.fn().mockReturnValue(null),
        resolveWindowTarget: vi.fn().mockReturnValue(null),
        registerPane: vi.fn(),
        unregisterPane: vi.fn(),
        getOrCreateSession: vi.fn(),
        getTmuxPaneId: vi.fn().mockReturnValue(undefined),
        ensureRpcServer: vi.fn().mockResolvedValue('\\\\.\\pipe\\ausome-tmux-win-rpc'),
        getRpcSocketPath: vi.fn().mockReturnValue('\\\\.\\pipe\\ausome-tmux-win-rpc'),
        destroy: vi.fn(),
      } as any;

      const tmuxEnabledProcessManager = new ProcessManager(
        () => ({ tmux: { enabled: true, autoInjectPath: false } } as any),
        tmuxCompatService,
      );

      const handle = await tmuxEnabledProcessManager.spawnTerminal({
        workingDirectory: testWorkingDir,
        windowId: 'win-rpc',
        paneId: 'pane-rpc',
      });

      expect(tmuxCompatService.ensureRpcServer).toHaveBeenCalledOnce();
      expect(tmuxCompatService.ensureRpcServer).toHaveBeenCalledWith('win-rpc');

      await tmuxEnabledProcessManager.killProcess(handle.pid);
    });

    it('injects the same rpc path as TmuxCompatService exposes', () => {
      const tmuxEnabledProcessManager = new ProcessManager(
        () => ({ tmux: { enabled: true, autoInjectPath: false } } as any),
      );

      const store = {
        windows: [
          {
            id: 'win-sync',
            name: 'Sync Test',
            layout: {
              type: 'pane' as const,
              id: 'pane-sync',
              pane: {
                id: 'pane-sync',
                cwd: testWorkingDir,
                command: 'pwsh.exe',
                status: WindowStatus.WaitingForInput,
                pid: 1001,
              },
            },
            activePaneId: 'pane-sync',
            createdAt: new Date().toISOString(),
            lastActiveAt: new Date().toISOString(),
          },
        ],
      };

      const tmuxCompatService = new TmuxCompatService({
        processManager: {
          spawnTerminal: vi.fn().mockResolvedValue({ pid: 1001, pty: {} }),
          killProcess: vi.fn().mockResolvedValue(undefined),
          getProcessStatus: vi.fn().mockReturnValue(null),
          listProcesses: vi.fn().mockReturnValue([]),
          getPaneStatus: vi.fn().mockResolvedValue('waiting'),
          subscribeStatusChange: vi.fn(),
          destroy: vi.fn().mockResolvedValue(undefined),
          getPidByPane: vi.fn().mockReturnValue(1001),
          writeToPty: vi.fn(),
        },
        getWindowStore: () => store as any,
        updateWindowStore: (updater) => updater(store as any),
        debug: false,
      });

      tmuxEnabledProcessManager.setTmuxCompatService(tmuxCompatService);

      const tmuxEnv = (tmuxEnabledProcessManager as any).buildTmuxEnvironment(
        {
          workingDirectory: testWorkingDir,
          windowId: 'win-sync',
          paneId: 'pane-sync',
        },
        { PATH: '', Path: '' },
      );

      expect(tmuxEnv.AUSOME_TMUX_RPC).toBe(tmuxCompatService.getRpcSocketPath('win-sync'));

      tmuxCompatService.destroy();
    });
  });
});
