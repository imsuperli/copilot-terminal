/**
 * TmuxRpcServer 单元测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as net from 'net';
import { TmuxRpcServer, TmuxRpcServerConfig } from './TmuxRpcServer';
import { ITmuxCompatService, TmuxCommandRequest, TmuxCommandResponse } from '../../shared/types/tmux';

/**
 * 辅助函数：发送 RPC 请求并接收响应
 */
function sendRpcRequest(
  socketPath: string,
  request: { type: string; requestId: string; request: TmuxCommandRequest },
): Promise<any> {
  return new Promise((resolve, reject) => {
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
        resolve(parsed);
      } catch (err) {
        reject(new Error(`Failed to parse response: ${responseData}`));
      }
    });

    client.on('error', reject);

    setTimeout(() => {
      client.destroy();
      reject(new Error('Request timeout'));
    }, 5000);
  });
}

/**
 * 创建 mock TmuxCompatService
 */
function createMockService(overrides?: Partial<ITmuxCompatService>): ITmuxCompatService {
  return {
    executeCommand: vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: 'tmux 3.3a\n',
      stderr: '',
    }),
    allocatePaneId: vi.fn().mockReturnValue('%1'),
    resolvePaneId: vi.fn().mockReturnValue(null),
    resolveWindowTarget: vi.fn().mockReturnValue(null),
    registerPane: vi.fn(),
    unregisterPane: vi.fn(),
    getOrCreateSession: vi.fn().mockReturnValue({
      name: 'test',
      windows: [],
      createdAt: Date.now(),
    }),
    ensureRpcServer: vi.fn().mockResolvedValue('/tmp/mock-rpc.sock'),
    getRpcSocketPath: vi.fn().mockReturnValue('/tmp/mock-rpc.sock'),
    observePaneOutput: vi.fn(),
    shouldForwardRendererInput: vi.fn().mockReturnValue(true),
    destroy: vi.fn(),
    ...overrides,
  };
}

describe('TmuxRpcServer', () => {
  let server: TmuxRpcServer;
  let mockService: ITmuxCompatService;
  const testWindowId = `test-rpc-${process.pid}-${Date.now()}`;

  beforeEach(() => {
    mockService = createMockService();
    server = new TmuxRpcServer({
      tmuxCompatService: mockService,
      debug: false,
    });
  });

  afterEach(async () => {
    await server.destroy();
  });

  it('should start and stop a server for a window', async () => {
    const socketPath = await server.startServer(testWindowId);
    expect(socketPath).toBeTruthy();
    expect(server.hasServer(testWindowId)).toBe(true);

    await server.stopServer(testWindowId);
    expect(server.hasServer(testWindowId)).toBe(false);
  });

  it('should return correct socket path format', () => {
    const socketPath = server.getSocketPath('win-123');
    if (process.platform === 'win32') {
      expect(socketPath).toBe('\\\\.\\pipe\\ausome-tmux-win-123');
    } else {
      expect(socketPath).toBe('/tmp/ausome-tmux-win-123.sock');
    }
  });

  it('should handle a valid -V request', async () => {
    const socketPath = await server.startServer(testWindowId);

    const response = await sendRpcRequest(socketPath, {
      type: 'request',
      requestId: 'req-001',
      request: {
        argv: ['-V'],
        windowId: testWindowId,
      },
    });

    expect(response.type).toBe('response');
    expect(response.requestId).toBe('req-001');
    expect(response.response).toBeDefined();
    expect(response.response.exitCode).toBe(0);
    expect(mockService.executeCommand).toHaveBeenCalledWith(
      expect.objectContaining({ argv: ['-V'], windowId: testWindowId }),
    );
  });

  it('should handle invalid JSON gracefully', async () => {
    const socketPath = await server.startServer(testWindowId);

    const response = await new Promise<any>((resolve, reject) => {
      const client = net.connect(socketPath);
      let data = '';

      client.on('connect', () => {
        client.write('not valid json\n');
      });

      client.on('data', (chunk) => {
        data += chunk.toString();
      });

      client.on('end', () => {
        try {
          resolve(JSON.parse(data.trim()));
        } catch {
          reject(new Error(`Failed to parse: ${data}`));
        }
      });

      client.on('error', reject);
      setTimeout(() => { client.destroy(); reject(new Error('timeout')); }, 5000);
    });

    expect(response.type).toBe('response');
    expect(response.error).toBeDefined();
  });

  it('should handle invalid request format', async () => {
    const socketPath = await server.startServer(testWindowId);

    const response = await sendRpcRequest(socketPath, {
      type: 'request',
      requestId: 'req-bad',
      request: { notArgv: true } as any,
    });

    expect(response.type).toBe('response');
    expect(response.requestId).toBe('req-bad');
    expect(response.error).toContain('Invalid request format');
  });

  it('should handle executeCommand errors', async () => {
    const failService = createMockService({
      executeCommand: vi.fn().mockRejectedValue(new Error('command failed')),
    });
    const failServer = new TmuxRpcServer({
      tmuxCompatService: failService,
      debug: false,
    });

    const failWindowId = `test-fail-${process.pid}-${Date.now()}`;
    const socketPath = await failServer.startServer(failWindowId);

    const response = await sendRpcRequest(socketPath, {
      type: 'request',
      requestId: 'req-fail',
      request: { argv: ['split-window'], windowId: failWindowId },
    });

    expect(response.type).toBe('response');
    expect(response.requestId).toBe('req-fail');
    expect(response.error).toContain('command failed');

    await failServer.destroy();
  });

  it('should handle concurrent requests', async () => {
    let callCount = 0;
    const concurrentService = createMockService({
      executeCommand: vi.fn().mockImplementation(async (req: TmuxCommandRequest) => {
        callCount++;
        // Simulate some async work
        await new Promise((r) => setTimeout(r, 10));
        return {
          exitCode: 0,
          stdout: `response-${callCount}\n`,
          stderr: '',
        };
      }),
    });

    const concurrentServer = new TmuxRpcServer({
      tmuxCompatService: concurrentService,
      debug: false,
    });

    const concurrentWindowId = `test-concurrent-${process.pid}-${Date.now()}`;
    const socketPath = await concurrentServer.startServer(concurrentWindowId);

    // Send 5 concurrent requests
    const promises = Array.from({ length: 5 }, (_, i) =>
      sendRpcRequest(socketPath, {
        type: 'request',
        requestId: `req-${i}`,
        request: { argv: ['-V'], windowId: concurrentWindowId },
      }),
    );

    const responses = await Promise.all(promises);

    expect(responses).toHaveLength(5);
    for (const resp of responses) {
      expect(resp.type).toBe('response');
      expect(resp.response).toBeDefined();
      expect(resp.response.exitCode).toBe(0);
    }

    expect(concurrentService.executeCommand).toHaveBeenCalledTimes(5);

    await concurrentServer.destroy();
  });

  it('should replace server when startServer is called twice for same window', async () => {
    const socketPath1 = await server.startServer(testWindowId);
    const socketPath2 = await server.startServer(testWindowId);

    // Same path, but server was recreated
    expect(socketPath1).toBe(socketPath2);
    expect(server.hasServer(testWindowId)).toBe(true);
  });

  it('should destroy all servers', async () => {
    const id1 = `test-d1-${process.pid}-${Date.now()}`;
    const id2 = `test-d2-${process.pid}-${Date.now()}`;

    await server.startServer(id1);
    await server.startServer(id2);

    expect(server.hasServer(id1)).toBe(true);
    expect(server.hasServer(id2)).toBe(true);

    await server.destroy();

    expect(server.hasServer(id1)).toBe(false);
    expect(server.hasServer(id2)).toBe(false);
  });

  it('should throw when starting server after destroy', async () => {
    await server.destroy();

    await expect(server.startServer('any-window')).rejects.toThrow('destroyed');
  });

  // NOTE: "no newline" fallback is not reliably testable on Windows named pipes
  // because half-open connections are not supported. The protocol requires
  // clients to always send a trailing newline. The server-side fallback in the
  // 'end' handler exists as a best-effort safety net for Unix sockets only.
});
