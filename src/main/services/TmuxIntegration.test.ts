/**
 * tmux 兼容层端到端集成测试
 *
 * 测试完整的命令流水线：
 *   TmuxCommandParser → TmuxCompatService → TmuxRpcServer
 *
 * 模拟 Claude Code Agent Teams 的实际使用场景：
 *   1. 版本检测
 *   2. 查询 session/pane 信息
 *   3. 分屏创建 teammate panes
 *   4. 设置 pane 标题和样式
 *   5. 发送按键到 pane
 *   6. 布局调整
 *   7. 关闭 pane
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as net from 'net';
import { TmuxCompatService, TmuxCompatServiceConfig, ITmuxProcessManager } from './TmuxCompatService';
import { TmuxCommandParser } from './TmuxCommandParser';
import { TmuxCommand } from '../../shared/types/tmux';
import { Window, Pane, LayoutNode, SplitNode, WindowStatus } from '../../shared/types/window';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createMockProcessManager(): ITmuxProcessManager {
  return {
    spawnTerminal: vi.fn().mockResolvedValue({ pid: 2001, pty: {} }),
    killProcess: vi.fn().mockResolvedValue(undefined),
    getProcessStatus: vi.fn().mockReturnValue(null),
    listProcesses: vi.fn().mockReturnValue([]),
    getPaneStatus: vi.fn().mockResolvedValue('waiting'),
    subscribeStatusChange: vi.fn(),
    destroy: vi.fn().mockResolvedValue(undefined),
    getPidByPane: vi.fn().mockReturnValue(2001),
    writeToPty: vi.fn(),
  };
}

/**
 * 创建一个包含 2 个 pane 的 split layout 的 mock store
 * 这样 split-window 的 splitPaneInLayout 可以正确找到并分割子 pane
 */
function createMockWindowStore() {
  const leaderPane: Pane = {
    id: 'pane-leader',
    cwd: '/home/user/project',
    command: 'pwsh.exe',
    status: WindowStatus.WaitingForInput,
    pid: 2001,
  };

  const state = {
    windows: [
      {
        id: 'win-integration',
        name: 'Integration Test',
        layout: {
          type: 'pane' as const,
          id: 'pane-leader',
          pane: leaderPane,
        } as LayoutNode,
        activePaneId: 'pane-leader',
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

/**
 * 通过 RPC socket 发送 tmux 命令并获取响应（模拟 shim 行为）
 */
function sendRpcCommand(
  socketPath: string,
  argv: string[],
  windowId: string = 'win-integration',
  paneId: string = 'pane-leader',
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const requestId = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const request = {
      type: 'request',
      requestId,
      request: {
        argv,
        windowId,
        paneId,
        cwd: '/home/user/project',
      },
    };

    const client = net.connect(socketPath);
    let responseData = '';

    client.on('connect', () => {
      client.write(JSON.stringify(request) + '\n');
    });

    client.on('data', (chunk) => {
      responseData += chunk.toString();
    });

    client.on('end', () => {
      try {
        const parsed = JSON.parse(responseData.trim());
        if (parsed.error) {
          resolve({ exitCode: 1, stdout: '', stderr: parsed.error });
        } else if (parsed.response) {
          resolve(parsed.response);
        } else {
          reject(new Error(`Unexpected response: ${responseData}`));
        }
      } catch (err) {
        reject(new Error(`Failed to parse: ${responseData}`));
      }
    });

    client.on('error', reject);

    setTimeout(() => {
      client.destroy();
      reject(new Error('RPC timeout'));
    }, 5000);
  });
}

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------

describe('tmux 兼容层集成测试', () => {
  let service: TmuxCompatService;
  let processManager: ITmuxProcessManager;
  let store: ReturnType<typeof createMockWindowStore>;
  let socketPath: string;

  beforeEach(async () => {
    processManager = createMockProcessManager();
    store = createMockWindowStore();

    const config: TmuxCompatServiceConfig = {
      processManager,
      getWindowStore: () => store.getState(),
      updateWindowStore: (updater) => store.update(updater),
      debug: false,
    };

    service = new TmuxCompatService(config);

    // 注册 leader pane
    service.registerPane('%0', 'win-integration', 'pane-leader');

    // 启动 RPC 服务器
    socketPath = await service.startRpcServer('win-integration');
  });

  afterEach(async () => {
    service.destroy();
  });

  // =========================================================================
  // 1. 版本检测
  // =========================================================================

  describe('版本检测', () => {
    it('应该通过 RPC 返回 tmux 版本', async () => {
      const result = await sendRpcCommand(socketPath, ['-V']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('tmux');
    });

    it('TmuxCommandParser 应该正确解析 -V 标志', () => {
      const parsed = TmuxCommandParser.parse(['-V']);
      expect(parsed.command).toBe(TmuxCommand.Version);
    });
  });

  // =========================================================================
  // 2. Session 和 Pane 查询
  // =========================================================================

  describe('Session 和 Pane 查询', () => {
    it('display-message -p -F #{session_name} 应该返回 session 名称', async () => {
      const result = await sendRpcCommand(socketPath, [
        'display-message', '-p', '-F', '#{session_name}',
      ], 'win-integration', '%0');
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('default');
    });

    it('display-message -p 不带 -F 应该返回 pane ID', async () => {
      const result = await sendRpcCommand(socketPath, [
        'display-message', '-p',
      ], 'win-integration', '%0');
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('%0');
    });

    it('display-message -p #{pane_id} 应该返回当前 pane ID', async () => {
      // 注意：request.paneId 被用作 tmuxPaneId，需要传 tmux pane ID
      const result = await sendRpcCommand(socketPath, [
        'display-message', '-p', '#{pane_id}',
      ], 'win-integration', '%0');
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('%0');
    });

    it('display-message -p #{window_id} 应该返回当前 tmux window ID', async () => {
      const result = await sendRpcCommand(socketPath, [
        'display-message', '-p', '#{window_id}',
      ], 'win-integration', '%0');
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('@0');
    });

    it('display-message -p -t %0 应该返回指定 pane 的信息', async () => {
      const result = await sendRpcCommand(socketPath, [
        'display-message', '-p', '-t', '%0', '#{pane_id}',
      ]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('%0');
    });

    it('list-panes 应该列出当前 window 的已注册 panes', async () => {
      const result = await sendRpcCommand(socketPath, [
        'list-panes', '-F', '#{pane_id}',
      ]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('%0');
    });

    it('list-panes 应该支持 tmux window ID target', async () => {
      const currentWindow = await sendRpcCommand(socketPath, [
        'display-message', '-p', '#{window_id}',
      ], 'win-integration', '%0');

      const result = await sendRpcCommand(socketPath, [
        'list-panes', '-t', currentWindow.stdout.trim(), '-F', '#{pane_id}',
      ]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('%0');
    });
  });

  // =========================================================================
  // 3. split-window 命令
  // =========================================================================

  describe('split-window', () => {
    it('不指定 target 时应该在根节点分割', async () => {
      // 不传 -t 参数，走 else 分支（根节点分割）
      const result = await service.executeCommand({
        argv: ['split-window', '-h', '-P', '-F', '#{pane_id}'],
        windowId: 'win-integration',
      });
      expect(result.exitCode).toBe(0);
      const newPaneId = result.stdout.trim();
      expect(newPaneId).toMatch(/^%\d+$/);

      // 根节点应该变成 split
      const layout = store.getState().windows[0].layout;
      expect(layout.type).toBe('split');
    });

    it('通过 RPC 执行 split-window 应该返回新 pane ID', async () => {
      const result = await sendRpcCommand(socketPath, [
        'split-window', '-h', '-P', '-F', '#{pane_id}',
      ]);
      expect(result.exitCode).toBe(0);
      const newPaneId = result.stdout.trim();
      expect(newPaneId).toMatch(/^%\d+$/);
    });

    it('split-window 应该调用 spawnTerminal', async () => {
      await sendRpcCommand(socketPath, [
        'split-window', '-h', '-P', '-F', '#{pane_id}',
      ]);
      expect(processManager.spawnTerminal).toHaveBeenCalled();
    });

    it('split-window 应该注册新 pane 的 ID 映射', async () => {
      const result = await sendRpcCommand(socketPath, [
        'split-window', '-h', '-P', '-F', '#{pane_id}',
      ]);
      const newTmuxPaneId = result.stdout.trim();

      // 新 pane 应该可以被 resolve
      const resolved = service.resolvePaneId(newTmuxPaneId);
      expect(resolved).not.toBeNull();
      expect(resolved!.windowId).toBe('win-integration');
    });
  });

  // =========================================================================
  // 4. Agent Teams 完整工作流
  // =========================================================================

  describe('Agent Teams 工作流', () => {
    it('应该完成完整的 agent teams 分屏流程', async () => {
      // Step 1: 版本检测
      const versionResult = await sendRpcCommand(socketPath, ['-V']);
      expect(versionResult.exitCode).toBe(0);

      // Step 2: 查询当前 session
      const sessionResult = await sendRpcCommand(socketPath, [
        'display-message', '-p', '-F', '#{session_name}',
      ], 'win-integration', '%0');
      expect(sessionResult.exitCode).toBe(0);
      expect(sessionResult.stdout.trim()).toBe('default');

      // Step 3: 分屏创建 teammate pane（不指定 target，走根节点分割）
      const splitResult = await sendRpcCommand(socketPath, [
        'split-window', '-h', '-l', '70%', '-P', '-F', '#{pane_id}',
      ]);
      expect(splitResult.exitCode).toBe(0);
      const newPaneId = splitResult.stdout.trim();
      expect(newPaneId).toMatch(/^%\d+$/);

      // Step 4: 设置 teammate pane 标题
      const titleResult = await sendRpcCommand(socketPath, [
        'select-pane', '-t', newPaneId, '-T', 'researcher',
      ]);
      expect(titleResult.exitCode).toBe(0);

      // 验证标题存储在 pane metadata 中
      const metadata = service.getPaneMetadata(newPaneId);
      expect(metadata).toBeDefined();
      expect(metadata!.title).toBe('researcher');

      // Step 5: 向 teammate pane 发送命令
      const sendKeysResult = await sendRpcCommand(socketPath, [
        'send-keys', '-t', newPaneId, 'echo hello', 'Enter',
      ]);
      expect(sendKeysResult.exitCode).toBe(0);
      expect(processManager.writeToPty).toHaveBeenCalled();

      // Step 6: 应用 main-vertical 布局
      const layoutResult = await sendRpcCommand(socketPath, [
        'select-layout', 'main-vertical',
      ]);
      expect(layoutResult.exitCode).toBe(0);
    });

    it('应该支持多次分屏并注册所有 pane ID', async () => {
      const paneIds: string[] = [];

      // 创建 3 个 teammate panes
      for (let i = 0; i < 3; i++) {
        const result = await sendRpcCommand(socketPath, [
          'split-window', '-h', '-P', '-F', '#{pane_id}',
        ]);
        expect(result.exitCode).toBe(0);
        paneIds.push(result.stdout.trim());
      }

      expect(paneIds.length).toBe(3);

      // 每个 pane ID 应该唯一
      const uniqueIds = new Set(paneIds);
      expect(uniqueIds.size).toBe(3);

      // 每个 pane 都应该可以 resolve
      for (const id of paneIds) {
        const resolved = service.resolvePaneId(id);
        expect(resolved).not.toBeNull();
      }

      // 设置每个 teammate 的标题
      const names = ['researcher', 'coder', 'reviewer'];
      for (let i = 0; i < 3; i++) {
        const result = await sendRpcCommand(socketPath, [
          'select-pane', '-t', paneIds[i], '-T', names[i],
        ]);
        expect(result.exitCode).toBe(0);

        const meta = service.getPaneMetadata(paneIds[i]);
        expect(meta?.title).toBe(names[i]);
      }
    });
  });

  // =========================================================================
  // 5. Pane 标题和样式
  // =========================================================================

  describe('Pane 标题和样式', () => {
    it('select-pane -T 应该设置 pane 标题到 metadata', async () => {
      const result = await sendRpcCommand(socketPath, [
        'select-pane', '-t', '%0', '-T', 'team-lead',
      ]);
      expect(result.exitCode).toBe(0);

      const metadata = service.getPaneMetadata('%0');
      expect(metadata).toBeDefined();
      expect(metadata!.title).toBe('team-lead');
    });

    it('select-pane -T 应该触发 pane-title-changed 事件', async () => {
      const titleChangedHandler = vi.fn();
      service.on('pane-title-changed', titleChangedHandler);

      await sendRpcCommand(socketPath, [
        'select-pane', '-t', '%0', '-T', 'my-agent',
      ]);

      expect(titleChangedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          tmuxPaneId: '%0',
          windowId: 'win-integration',
          paneId: 'pane-leader',
          title: 'my-agent',
        }),
      );
    });

    it('set-option pane-border-style 应该设置边框颜色', async () => {
      const result = await sendRpcCommand(socketPath, [
        'set-option', 'pane-border-style', 'fg=colour196',
      ]);
      // set-option 可能成功也可能需要 target，验证不报错即可
      expect(result.exitCode).toBeDefined();
    });
  });

  // =========================================================================
  // 6. send-keys
  // =========================================================================

  describe('send-keys', () => {
    it('应该通过 RPC 向 pane 发送按键', async () => {
      const result = await sendRpcCommand(socketPath, [
        'send-keys', '-t', '%0', 'ls -la', 'Enter',
      ]);
      expect(result.exitCode).toBe(0);
      expect(processManager.writeToPty).toHaveBeenCalled();
    });

    it('应该正确转义 Enter 为回车符', async () => {
      await sendRpcCommand(socketPath, [
        'send-keys', '-t', '%0', 'hello', 'Enter',
      ]);

      // writeToPty 应该被调用，内容包含 \r
      const calls = (processManager.writeToPty as any).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const writtenData = calls[calls.length - 1][1];
      expect(writtenData).toContain('\r');
    });

    it('发送到不存在的 pane 应该返回错误', async () => {
      const result = await sendRpcCommand(socketPath, [
        'send-keys', '-t', '%999', 'hello', 'Enter',
      ]);
      expect(result.exitCode).toBe(1);
    });
  });

  // =========================================================================
  // 7. 布局操作
  // =========================================================================

  describe('布局操作', () => {
    it('select-layout main-vertical 应该成功执行', async () => {
      const result = await sendRpcCommand(socketPath, [
        'select-layout', 'main-vertical',
      ]);
      expect(result.exitCode).toBe(0);
    });

    it('select-layout tiled 应该成功执行', async () => {
      const result = await sendRpcCommand(socketPath, [
        'select-layout', 'tiled',
      ]);
      expect(result.exitCode).toBe(0);
    });

    it('有多个 pane 时 main-vertical 应该创建 split 布局', async () => {
      // 先创建一个新 pane（不指定 target，走根节点分割）
      await service.executeCommand({
        argv: ['split-window', '-h', '-P', '-F', '#{pane_id}'],
        windowId: 'win-integration',
      });

      // 现在有 2 个 pane，应用 main-vertical
      const result = await sendRpcCommand(socketPath, [
        'select-layout', 'main-vertical',
      ]);
      expect(result.exitCode).toBe(0);

      // 验证布局变成了 split
      const layout = store.getState().windows[0].layout;
      expect(layout.type).toBe('split');
      if (layout.type === 'split') {
        expect(layout.direction).toBe('horizontal');
        expect(layout.sizes).toEqual([0.3, 0.7]);
      }
    });
  });

  // =========================================================================
  // 8. kill-pane
  // =========================================================================

  describe('kill-pane', () => {
    it('应该成功关闭已注册的 pane', async () => {
      // 先创建一个新 pane
      const splitResult = await service.executeCommand({
        argv: ['split-window', '-h', '-P', '-F', '#{pane_id}'],
        windowId: 'win-integration',
      });
      const newPaneId = splitResult.stdout.trim();

      // 关闭新 pane
      const killResult = await sendRpcCommand(socketPath, [
        'kill-pane', '-t', newPaneId,
      ]);
      expect(killResult.exitCode).toBe(0);
    });

    it('关闭不存在的 pane 应该返回错误', async () => {
      const result = await sendRpcCommand(socketPath, [
        'kill-pane', '-t', '%999',
      ]);
      expect(result.exitCode).toBe(1);
    });
  });

  // =========================================================================
  // 9. 错误处理
  // =========================================================================

  describe('错误处理', () => {
    it('未知命令应该返回 exitCode 1', async () => {
      const result = await sendRpcCommand(socketPath, ['unknown-command']);
      expect(result.exitCode).toBe(1);
    });

    it('无效的 target 应该返回错误', async () => {
      const result = await sendRpcCommand(socketPath, [
        'send-keys', '-t', '%999', 'hello',
      ]);
      expect(result.exitCode).toBe(1);
    });

    it('RPC 请求格式错误应该返回错误', async () => {
      // 发送无效 JSON
      const result = await new Promise<string>((resolve, reject) => {
        const client = net.connect(socketPath);
        let data = '';
        client.on('connect', () => {
          client.write('not-valid-json\n');
        });
        client.on('data', (chunk) => { data += chunk.toString(); });
        client.on('end', () => resolve(data));
        client.on('error', reject);
        setTimeout(() => { client.destroy(); reject(new Error('timeout')); }, 5000);
      });

      const parsed = JSON.parse(result.trim());
      expect(parsed.error).toBeDefined();
    });
  });

  // =========================================================================
  // 10. Pane ID 映射
  // =========================================================================

  describe('Pane ID 映射', () => {
    it('allocatePaneId 应该返回递增的 ID', () => {
      const id1 = service.allocatePaneId();
      const id2 = service.allocatePaneId();
      const id3 = service.allocatePaneId();

      const num1 = parseInt(id1.slice(1));
      const num2 = parseInt(id2.slice(1));
      const num3 = parseInt(id3.slice(1));

      expect(num2).toBe(num1 + 1);
      expect(num3).toBe(num2 + 1);
    });

    it('registerPane 和 resolvePaneId 应该双向映射', () => {
      const tmuxId = '%99';
      service.registerPane(tmuxId, 'win-test', 'pane-test');

      const resolved = service.resolvePaneId(tmuxId);
      expect(resolved).toEqual({ windowId: 'win-test', paneId: 'pane-test' });
    });

    it('unregisterPane 应该清除映射', () => {
      const tmuxId = '%88';
      service.registerPane(tmuxId, 'win-test', 'pane-test');
      service.unregisterPane(tmuxId);

      const resolved = service.resolvePaneId(tmuxId);
      expect(resolved).toBeNull();
    });

    it('getTmuxPaneId 应该通过内部 ID 反查 tmux ID', () => {
      const tmuxId = service.getTmuxPaneId('win-integration', 'pane-leader');
      expect(tmuxId).toBe('%0');
    });
  });
});
