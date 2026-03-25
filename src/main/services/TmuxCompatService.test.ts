/**
 * TmuxCompatService 单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TmuxCompatService, TmuxCompatServiceConfig, ITmuxProcessManager } from './TmuxCompatService';
import { TmuxCommandRequest, TmuxCommand } from '../../shared/types/tmux';
import { Window, Pane, LayoutNode, WindowStatus } from '../../shared/types/window';

// Mock ProcessManager
function createMockProcessManager(): ITmuxProcessManager {
  return {
    spawnTerminal: vi.fn().mockResolvedValue({ pid: 1001, pty: {} }),
    killProcess: vi.fn().mockResolvedValue(undefined),
    getProcessStatus: vi.fn().mockReturnValue(null),
    listProcesses: vi.fn().mockReturnValue([]),
    getPaneStatus: vi.fn().mockResolvedValue('waiting'),
    subscribeStatusChange: vi.fn(),
    destroy: vi.fn().mockResolvedValue(undefined),
    getPidByPane: vi.fn().mockReturnValue(1001),
    writeToPty: vi.fn(),
    subscribePtyData: vi.fn().mockReturnValue(vi.fn()),
  };
}

// Mock Window Store
function createMockWindowStore() {
  const defaultPane: Pane = {
    id: 'pane-1',
    cwd: '/home/user/project',
    command: 'pwsh.exe',
    status: WindowStatus.WaitingForInput,
    pid: 1001,
  };

  const state = {
    windows: [
      {
        id: 'win-1',
        name: 'Test Window',
        layout: {
          type: 'pane' as const,
          id: 'pane-1',
          pane: defaultPane,
        },
        activePaneId: 'pane-1',
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      },
    ] as Window[],
  };

  return {
    getState: () => state,
    update: (updater: (s: any) => void) => updater(state),
  };
}

function createService(): {
  service: TmuxCompatService;
  processManager: ITmuxProcessManager;
  store: ReturnType<typeof createMockWindowStore>;
} {
  const processManager = createMockProcessManager();
  const store = createMockWindowStore();

  const config: TmuxCompatServiceConfig = {
    processManager,
    getWindowStore: () => store.getState(),
    updateWindowStore: (updater) => store.update(updater),
    debug: false,
  };

  const service = new TmuxCompatService(config);

  // 注册初始 pane
  service.registerPane('%1', 'win-1', 'pane-1');

  return { service, processManager, store };
}

describe('TmuxCompatService', () => {
  describe('tmux -V', () => {
    it('应返回版本字符串', async () => {
      const { service } = createService();

      const response = await service.executeCommand({
        argv: ['-V'],
      });

      expect(response.exitCode).toBe(0);
      expect(response.stdout).toMatch(/^tmux \d+\.\d+\n$/);
    });
  });

  describe('display-message', () => {
    it('应返回当前 pane ID', async () => {
      const { service } = createService();

      const response = await service.executeCommand({
        argv: ['display-message', '-p', '#{pane_id}'],
        windowId: 'win-1',
        paneId: '%1',
      });

      expect(response.exitCode).toBe(0);
      expect(response.stdout).toBe('%1\n');
    });

    it('应返回 session_name:window_index', async () => {
      const { service } = createService();

      const response = await service.executeCommand({
        argv: ['display-message', '-t', '%1', '-p', '#{session_name}:#{window_index}'],
        windowId: 'win-1',
        paneId: '%1',
      });

      expect(response.exitCode).toBe(0);
      expect(response.stdout).toBe('default:0\n');
    });

    it('当前 pane 映射丢失时应从请求上下文恢复 window target', async () => {
      const { service } = createService();
      service.unregisterPane('%1');

      const response = await service.executeCommand({
        argv: ['display-message', '-t', '%1', '-p', '#{session_name}:#{window_index}'],
        windowId: 'win-1',
        paneId: '%1',
        debugContext: {
          windowId: 'win-1',
          paneId: 'pane-1',
        },
      });

      expect(response.exitCode).toBe(0);
      expect(response.stdout).toBe('default:0\n');
      expect(service.resolvePaneId('%1')).toEqual({
        windowId: 'win-1',
        paneId: 'pane-1',
      });
    });

    it('找不到 pane 时应返回错误', async () => {
      const { service } = createService();

      const response = await service.executeCommand({
        argv: ['display-message', '-t', '%99', '-p', '#{pane_id}'],
      });

      expect(response.exitCode).toBe(1);
      expect(response.stderr).toContain('can\'t find pane');
    });
  });

  describe('list-panes', () => {
    it('应列出 window 内的所有 panes', async () => {
      const { service } = createService();

      const response = await service.executeCommand({
        argv: ['list-panes', '-t', 'default:0', '-F', '#{pane_id}'],
        windowId: 'win-1',
      });

      expect(response.exitCode).toBe(0);
      expect(response.stdout).toContain('%1');
    });

    it('使用当前 window 时应列出 panes', async () => {
      const { service } = createService();

      const response = await service.executeCommand({
        argv: ['list-panes', '-F', '#{pane_id}'],
        windowId: 'win-1',
      });

      expect(response.exitCode).toBe(0);
      expect(response.stdout).toContain('%1');
    });
  });

  describe('split-window', () => {
    it('应创建新 pane 并返回 pane ID', async () => {
      const { service, processManager } = createService();

      const response = await service.executeCommand({
        argv: ['split-window', '-t', '%1', '-h', '-P', '-F', '#{pane_id}'],
        windowId: 'win-1',
        paneId: '%1',
      });

      expect(response.exitCode).toBe(0);
      expect(response.stdout).toMatch(/^%\d+\n$/);
      expect(processManager.spawnTerminal).toHaveBeenCalled();
    });

    it('当前 pane 映射丢失时应从请求上下文恢复并继续 split-window', async () => {
      const { service, processManager } = createService();
      service.unregisterPane('%1');

      const response = await service.executeCommand({
        argv: ['split-window', '-t', '%1', '-h', '-P', '-F', '#{pane_id}'],
        windowId: 'win-1',
        paneId: '%1',
        debugContext: {
          windowId: 'win-1',
          paneId: 'pane-1',
        },
      });

      expect(response.exitCode).toBe(0);
      expect(response.stdout).toBe('%2\n');
      expect(processManager.spawnTerminal).toHaveBeenCalled();
    });

    it('水平分割应创建 horizontal split', async () => {
      const { service, store } = createService();

      await service.executeCommand({
        argv: ['split-window', '-t', '%1', '-h', '-P', '-F', '#{pane_id}'],
        windowId: 'win-1',
        paneId: '%1',
      });

      const window = store.getState().windows[0];
      expect(window.layout.type).toBe('split');
      if (window.layout.type === 'split') {
        expect(window.layout.direction).toBe('horizontal');
        expect(window.layout.children).toHaveLength(2);
      }
    });

    it('带百分比大小应正确设置 sizes', async () => {
      const { service, store } = createService();

      await service.executeCommand({
        argv: ['split-window', '-t', '%1', '-h', '-l', '70%', '-P', '-F', '#{pane_id}'],
        windowId: 'win-1',
        paneId: '%1',
      });

      const window = store.getState().windows[0];
      if (window.layout.type === 'split') {
        expect(window.layout.sizes[0]).toBeCloseTo(0.3);
        expect(window.layout.sizes[1]).toBeCloseTo(0.7);
      }
    });
  });

  describe('select-layout', () => {
    it('main-vertical 应创建左右布局', async () => {
      const { service, store } = createService();

      // 先创建第二个 pane
      await service.executeCommand({
        argv: ['split-window', '-t', '%1', '-h', '-P', '-F', '#{pane_id}'],
        windowId: 'win-1',
        paneId: '%1',
      });

      // 应用 main-vertical 布局
      const response = await service.executeCommand({
        argv: ['select-layout', 'main-vertical'],
        windowId: 'win-1',
      });

      expect(response.exitCode).toBe(0);

      const window = store.getState().windows[0];
      if (window.layout.type === 'split') {
        expect(window.layout.direction).toBe('horizontal');
        expect(window.layout.sizes[0]).toBeCloseTo(0.3);
        expect(window.layout.sizes[1]).toBeCloseTo(0.7);
      }
    });
  });

  describe('send-keys', () => {
    it('应向目标 pane 发送按键', async () => {
      const { service, processManager } = createService();

      const response = await service.executeCommand({
        argv: ['send-keys', '-t', '%1', 'echo hello', 'Enter'],
        windowId: 'win-1',
      });

      expect(response.exitCode).toBe(0);
      expect(processManager.writeToPty).toHaveBeenCalledWith(1001, expect.stringContaining('echo hello'));
    });

    it.runIf(process.platform === 'win32')('新建 pane 的 send-keys 应等待 shell 吐出可见输出后再注入命令', async () => {
      const { service, processManager } = createService();
      const ptySubscribers = new Map<number, (data: string) => void>();
      vi.mocked(processManager.subscribePtyData).mockImplementation((pid: number, callback: (data: string) => void) => {
        ptySubscribers.set(pid, callback);
        return vi.fn();
      });

      const splitResponse = await service.executeCommand({
        argv: ['split-window', '-t', '%1', '-h', '-P', '-F', '#{pane_id}'],
        windowId: 'win-1',
        paneId: '%1',
      });
      const newPaneId = splitResponse.stdout.trim();
      vi.mocked(processManager.writeToPty).mockClear();

      const sendKeysPromise = service.executeCommand({
        argv: ['send-keys', '-t', newPaneId, 'echo hello', 'Enter'],
        windowId: 'win-1',
      });

      await Promise.resolve();
      expect(processManager.writeToPty).not.toHaveBeenCalled();

      ptySubscribers.get(1001)?.('\u001b[c');
      await Promise.resolve();
      expect(processManager.writeToPty).not.toHaveBeenCalled();

      ptySubscribers.get(1001)?.('PowerShell 7.5.4\r\n');
      await Promise.resolve();
      expect(processManager.writeToPty).not.toHaveBeenCalled();

      service.notifyPaneInputWritten('win-1', newPaneId, '\u001b[?1;2c');
      const response = await sendKeysPromise;

      expect(response.exitCode).toBe(0);
      expect(processManager.writeToPty).toHaveBeenCalledWith(1001, expect.stringContaining('echo hello'));
    });

    it('找不到 pane 时应返回错误', async () => {
      const { service } = createService();

      const response = await service.executeCommand({
        argv: ['send-keys', '-t', '%99', 'echo hello'],
      });

      expect(response.exitCode).toBe(1);
    });
  });

  describe('kill-pane', () => {
    it('应终止 pane 进程并从 layout 中移除', async () => {
      const { service, processManager, store } = createService();

      // 先创建第二个 pane
      const splitResponse = await service.executeCommand({
        argv: ['split-window', '-t', '%1', '-h', '-P', '-F', '#{pane_id}'],
        windowId: 'win-1',
        paneId: '%1',
      });

      const newPaneId = splitResponse.stdout.trim();

      // 终止新 pane
      const response = await service.executeCommand({
        argv: ['kill-pane', '-t', newPaneId],
      });

      expect(response.exitCode).toBe(0);
      expect(processManager.killProcess).toHaveBeenCalled();

      // 验证 pane 已从映射中移除
      expect(service.resolvePaneId(newPaneId)).toBeNull();
    });

    it('关闭嵌套 pane 时应保留根布局比例', async () => {
      const { service, store } = createService();
      const teammatePane = (id: string): Pane => ({
        id,
        cwd: '/home/user/project',
        command: 'pwsh.exe',
        status: WindowStatus.WaitingForInput,
        pid: 1000,
      });

      store.getState().windows[0].layout = {
        type: 'split',
        direction: 'horizontal',
        sizes: [0.3, 0.7],
        children: [
          {
            type: 'pane',
            id: 'pane-1',
            pane: teammatePane('pane-1'),
          },
          {
            type: 'split',
            direction: 'vertical',
            sizes: [0.2, 0.3, 0.5],
            children: [
              {
                type: 'pane',
                id: 'pane-2',
                pane: teammatePane('pane-2'),
              },
              {
                type: 'pane',
                id: 'pane-3',
                pane: teammatePane('pane-3'),
              },
              {
                type: 'pane',
                id: 'pane-4',
                pane: teammatePane('pane-4'),
              },
            ],
          },
        ],
      };

      service.registerPane('%2', 'win-1', 'pane-2');
      service.registerPane('%3', 'win-1', 'pane-3');
      service.registerPane('%4', 'win-1', 'pane-4');

      const response = await service.executeCommand({
        argv: ['kill-pane', '-t', '%3'],
      });

      expect(response.exitCode).toBe(0);

      const window = store.getState().windows[0];
      expect(window.layout.type).toBe('split');
      if (window.layout.type !== 'split') {
        throw new Error('expected split layout');
      }

      expect(window.layout.sizes[0]).toBeCloseTo(0.3);
      expect(window.layout.sizes[1]).toBeCloseTo(0.7);

      const rightSide = window.layout.children[1];
      expect(rightSide.type).toBe('split');
      if (rightSide.type !== 'split') {
        throw new Error('expected nested split');
      }

      expect(rightSide.sizes[0]).toBeCloseTo(0.2 / 0.7);
      expect(rightSide.sizes[1]).toBeCloseTo(0.5 / 0.7);
      expect(rightSide.children).toHaveLength(2);
      expect(rightSide.children[0]).toMatchObject({ type: 'pane', id: 'pane-2' });
      expect(rightSide.children[1]).toMatchObject({ type: 'pane', id: 'pane-4' });
    });

    it('关闭兄弟 pane 后应保留单子节点 split，避免幸存 pane 重挂载', async () => {
      const { service, store } = createService();
      const teammatePane = (id: string): Pane => ({
        id,
        cwd: '/home/user/project',
        command: 'pwsh.exe',
        status: WindowStatus.WaitingForInput,
        pid: 1000,
      });

      store.getState().windows[0].layout = {
        type: 'split',
        direction: 'horizontal',
        sizes: [0.3, 0.7],
        children: [
          {
            type: 'pane',
            id: 'pane-1',
            pane: teammatePane('pane-1'),
          },
          {
            type: 'split',
            direction: 'vertical',
            sizes: [0.5, 0.5],
            children: [
              {
                type: 'pane',
                id: 'pane-2',
                pane: teammatePane('pane-2'),
              },
              {
                type: 'pane',
                id: 'pane-3',
                pane: teammatePane('pane-3'),
              },
            ],
          },
        ],
      };

      service.registerPane('%2', 'win-1', 'pane-2');
      service.registerPane('%3', 'win-1', 'pane-3');

      const response = await service.executeCommand({
        argv: ['kill-pane', '-t', '%2'],
      });

      expect(response.exitCode).toBe(0);

      const window = store.getState().windows[0];
      expect(window.layout.type).toBe('split');
      if (window.layout.type !== 'split') {
        throw new Error('expected split layout');
      }

      const rightSide = window.layout.children[1];
      expect(rightSide.type).toBe('split');
      if (rightSide.type !== 'split') {
        throw new Error('expected nested split');
      }

      expect(rightSide.children).toHaveLength(1);
      expect(rightSide.sizes).toEqual([1]);
      expect(rightSide.children[0]).toMatchObject({ type: 'pane', id: 'pane-3' });
    });
  });

  describe('select-pane', () => {
    it('应设置 pane 标题', async () => {
      const { service } = createService();

      const response = await service.executeCommand({
        argv: ['select-pane', '-t', '%1', '-T', 'My Pane Title'],
      });

      expect(response.exitCode).toBe(0);

      const metadata = service.getPaneMetadata('%1');
      expect(metadata?.title).toBe('My Pane Title');
    });

    it('应设置 pane 样式', async () => {
      const { service } = createService();

      const response = await service.executeCommand({
        argv: ['select-pane', '-t', '%1', '-P', 'fg=colour196'],
      });

      expect(response.exitCode).toBe(0);

      const metadata = service.getPaneMetadata('%1');
      expect(metadata?.borderColor).toBe('#ff0000');
    });

    it('无标题和样式时应设置为活跃 pane', async () => {
      const { service, store } = createService();

      // 创建第二个 pane
      await service.executeCommand({
        argv: ['split-window', '-t', '%1', '-h', '-P', '-F', '#{pane_id}'],
        windowId: 'win-1',
        paneId: '%1',
      });

      const response = await service.executeCommand({
        argv: ['select-pane', '-t', '%1'],
      });

      expect(response.exitCode).toBe(0);
    });
  });

  describe('set-option', () => {
    it('应设置 pane 边框样式', async () => {
      const { service } = createService();

      const response = await service.executeCommand({
        argv: ['set-option', '-p', '-t', '%1', 'pane-border-style', 'fg=colour33'],
      });

      expect(response.exitCode).toBe(0);

      const metadata = service.getPaneMetadata('%1');
      expect(metadata?.borderColor).toBe('#0087ff');
    });
  });

  describe('pane ID 管理', () => {
    it('allocatePaneId 应递增分配', () => {
      const { service } = createService();

      // %1 已经被初始注册使用，计数器从 1 开始
      const id1 = service.allocatePaneId();
      const id2 = service.allocatePaneId();

      expect(id1).toMatch(/^%\d+$/);
      expect(id2).toMatch(/^%\d+$/);
      expect(id1).not.toBe(id2);
    });

    it('registerPane/unregisterPane 应正确管理映射', () => {
      const { service } = createService();

      service.registerPane('%10', 'win-2', 'pane-10');

      expect(service.resolvePaneId('%10')).toEqual({
        windowId: 'win-2',
        paneId: 'pane-10',
      });

      service.unregisterPane('%10');
      expect(service.resolvePaneId('%10')).toBeNull();
    });

    it('getTmuxPaneId 应返回反向映射', () => {
      const { service } = createService();

      expect(service.getTmuxPaneId('win-1', 'pane-1')).toBe('%1');
      expect(service.getTmuxPaneId('win-1', 'nonexistent')).toBeUndefined();
    });
  });

  describe('session 管理', () => {
    it('getOrCreateSession 应创建新 session', () => {
      const { service } = createService();

      const session = service.getOrCreateSession('test-session', 'default');

      expect(session.name).toBe('test-session');
      expect(session.namespace).toBe('default');
      expect(session.windows).toHaveLength(0);
    });

    it('getOrCreateSession 应返回已有 session', () => {
      const { service } = createService();

      const session1 = service.getOrCreateSession('test-session', 'default');
      const session2 = service.getOrCreateSession('test-session', 'default');

      expect(session1).toBe(session2);
    });
  });

  describe('Windows teammate launch translation', () => {
    it('PowerShell launcher should invoke node for js entrypoints', () => {
      const { service } = createService();

      const command = (service as any).buildPowerShellLauncher(
        'D:\\tmp',
        [['CLAUDECODE', '1']],
        'D:\\ProgramData\\nodejs\\node_global\\node_modules\\@anthropic-ai\\claude-code\\cli.js',
        ['--agent-id', 'senior-architect'],
      );

      expect(command).toContain("& 'node' 'D:\\ProgramData\\nodejs\\node_global\\node_modules\\@anthropic-ai\\claude-code\\cli.js' '--agent-id' 'senior-architect'");
      expect(command).not.toContain("& 'D:\\ProgramData\\nodejs\\node_global\\node_modules\\@anthropic-ai\\claude-code\\cli.js'");
    });

    it('cmd launcher should invoke node for js entrypoints', () => {
      const { service } = createService();

      const command = (service as any).buildCmdLauncher(
        'D:\\tmp',
        [['CLAUDECODE', '1']],
        'D:\\ProgramData\\nodejs\\node_global\\node_modules\\@anthropic-ai\\claude-code\\cli.js',
        ['--agent-id', 'startup-cto'],
      );

      expect(command).toContain('node D:\\ProgramData\\nodejs\\node_global\\node_modules\\@anthropic-ai\\claude-code\\cli.js --agent-id startup-cto');
    });
  });

  describe('destroy', () => {
    it('应清理所有状态', () => {
      const { service } = createService();

      service.destroy();

      expect(service.resolvePaneId('%1')).toBeNull();
    });
  });

  describe('未知命令', () => {
    it('应返回错误', async () => {
      const { service } = createService();

      const response = await service.executeCommand({
        argv: ['unknown-command'],
      });

      expect(response.exitCode).toBe(1);
    });
  });
});
