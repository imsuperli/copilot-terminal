/**
 * tmux-shim.test.ts - Tests for the fake tmux shim
 *
 * Spins up a mock RPC server (named pipe / Unix socket), then spawns the
 * tmux-shim.js script as a child process and verifies:
 *   - Correct RPC request format
 *   - stdout/stderr relay
 *   - Exit code forwarding
 *   - Error handling
 *   - Version flag shortcut
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as net from 'net';
import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';
import { platform, tmpdir } from 'os';

const SHIM_PATH = path.resolve(__dirname, '../../../resources/bin/tmux-shim.js');

// Generate a unique pipe/socket path per test to avoid collisions
let counter = 0;
function getTestSocketPath(): string {
  counter++;
  const id = `test-shim-${process.pid}-${counter}`;
  if (platform() === 'win32') {
    return `\\\\.\\pipe\\${id}`;
  }
  return path.join(tmpdir(), `${id}.sock`);
}

/**
 * Helper: start a mock RPC server that responds with the given handler.
 */
function startMockServer(
  socketPath: string,
  handler: (request: any) => any
): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    // Clean up stale socket on Unix
    if (platform() !== 'win32') {
      try { fs.unlinkSync(socketPath); } catch { /* ignore */ }
    }

    const server = net.createServer((socket) => {
      let buffer = '';
      socket.on('data', (chunk) => {
        buffer += chunk.toString();
        // Process on newline, matching real TmuxRpcServer behavior
        const newlineIdx = buffer.indexOf('\n');
        if (newlineIdx !== -1) {
          const messageStr = buffer.substring(0, newlineIdx);
          buffer = buffer.substring(newlineIdx + 1);
          try {
            const request = JSON.parse(messageStr);
            const response = handler(request);
            socket.end(JSON.stringify(response) + '\n');
          } catch (err) {
            socket.end(JSON.stringify({ type: 'response', requestId: 'unknown', error: String(err) }) + '\n');
          }
        }
      });
    });

    server.listen(socketPath, () => resolve(server));
    server.on('error', reject);
  });
}

/**
 * Helper: run the shim with given args and env, return { stdout, stderr, exitCode }.
 */
function runShim(
  args: string[],
  env: Record<string, string>
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath, // node
      [SHIM_PATH, ...args],
      {
        env: { ...process.env, ...env },
        timeout: 10000,
      },
      (error, stdout, stderr) => {
        resolve({
          stdout: stdout || '',
          stderr: stderr || '',
          exitCode: error ? (error as any).code ?? 1 : 0,
        });
      }
    );
  });
}

// Track servers for cleanup
const servers: net.Server[] = [];

afterEach(async () => {
  for (const s of servers) {
    await new Promise<void>((resolve) => s.close(() => resolve()));
  }
  servers.length = 0;
});

describe('tmux-shim', () => {
  it('should keep the Windows wrapper bound to AUSOME_NODE_PATH', () => {
    const windowsWrapperPath = path.resolve(__dirname, '../../../resources/bin/tmux.cmd');
    const wrapper = fs.readFileSync(windowsWrapperPath, 'utf8');

    expect(wrapper).toContain('AUSOME_NODE_PATH');
  });

  it('should return version without RPC for -V flag', async () => {
    const result = await runShim(['-V'], {});
    expect(result.stdout).toContain('tmux 3.4');
    expect(result.exitCode).toBe(0);
  });

  it('should fail when AUSOME_TMUX_RPC is not set', async () => {
    const result = await runShim(['list-panes'], {
      AUSOME_TMUX_RPC: '',
      PATH: '',
    });

    expect(result.stderr).toContain('tmux: command not found');
    expect(result.exitCode).toBe(127);
  });

  it('should send correct RPC request and relay stdout', async () => {
    const socketPath = getTestSocketPath();
    let receivedRequest: any = null;

    const server = await startMockServer(socketPath, (req) => {
      receivedRequest = req;
      return {
        type: 'response',
        requestId: req.requestId,
        response: {
          exitCode: 0,
          stdout: '%1\n',
          stderr: '',
        },
      };
    });
    servers.push(server);

    const result = await runShim(
      ['split-window', '-h', '-P', '-F', '#{pane_id}'],
      {
        AUSOME_TMUX_RPC: socketPath,
        AUSOME_TERMINAL_WINDOW_ID: 'win-test-123',
        AUSOME_TERMINAL_PANE_ID: 'pane-test-456',
        TMUX_PANE: '%9',
      }
    );

    // Verify request format
    expect(receivedRequest).toBeTruthy();
    expect(receivedRequest.type).toBe('request');
    expect(receivedRequest.requestId).toBeTruthy();
    expect(receivedRequest.request.argv).toEqual([
      'split-window', '-h', '-P', '-F', '#{pane_id}',
    ]);
    expect(receivedRequest.request.windowId).toBe('win-test-123');
    expect(receivedRequest.request.paneId).toBe('%9');
    expect(receivedRequest.request.debugContext.paneId).toBe('pane-test-456');

    // Verify output
    expect(result.stdout).toBe('%1\n');
    expect(result.exitCode).toBe(0);
  });

  it('should relay stderr and non-zero exit code', async () => {
    const socketPath = getTestSocketPath();

    const server = await startMockServer(socketPath, (req) => ({
      type: 'response',
      requestId: req.requestId,
      response: {
        exitCode: 1,
        stdout: '',
        stderr: 'no server running on /tmp/tmux-1000/default\n',
      },
    }));
    servers.push(server);

    const result = await runShim(['has-session', '-t', 'nonexistent'], {
      AUSOME_TMUX_RPC: socketPath,
      AUSOME_TERMINAL_WINDOW_ID: 'win-1',
      AUSOME_TERMINAL_PANE_ID: 'pane-1',
      TMUX_PANE: '%1',
    });

    expect(result.stderr).toContain('no server running');
    expect(result.exitCode).toBe(1);
  });

  it('should handle RPC error response for supported commands', async () => {
    const socketPath = getTestSocketPath();

    const server = await startMockServer(socketPath, (req) => ({
      type: 'response',
      requestId: req.requestId,
      error: 'unknown command: foobar',
    }));
    servers.push(server);

    const result = await runShim(['list-panes'], {
      AUSOME_TMUX_RPC: socketPath,
      AUSOME_TERMINAL_WINDOW_ID: 'win-1',
      AUSOME_TERMINAL_PANE_ID: 'pane-1',
      TMUX_PANE: '%1',
    });

    expect(result.stderr).toContain('unknown command: foobar');
    expect(result.exitCode).not.toBe(0);
  });

  it('should fail gracefully when RPC server is unreachable', async () => {
    const socketPath = platform() === 'win32'
      ? '\\\\.\\pipe\\ausome-tmux-nonexistent-test'
      : path.join(tmpdir(), 'ausome-tmux-nonexistent-test.sock');

    const result = await runShim(['list-panes'], {
      AUSOME_TMUX_RPC: socketPath,
      AUSOME_TERMINAL_WINDOW_ID: 'win-1',
      AUSOME_TERMINAL_PANE_ID: 'pane-1',
      TMUX_PANE: '%1',
    });

    expect(result.stderr).toContain('cannot connect to RPC server');
    expect(result.exitCode).not.toBe(0);
  });

  it('should include cwd in RPC request', async () => {
    const socketPath = getTestSocketPath();
    let receivedCwd: string | undefined;

    const server = await startMockServer(socketPath, (req) => {
      receivedCwd = req.request.cwd;
      return {
        type: 'response',
        requestId: req.requestId,
        response: { exitCode: 0, stdout: '', stderr: '' },
      };
    });
    servers.push(server);

    await runShim(['display-message', '-p', '#{session_name}'], {
      AUSOME_TMUX_RPC: socketPath,
      AUSOME_TERMINAL_WINDOW_ID: 'win-1',
      AUSOME_TERMINAL_PANE_ID: 'pane-1',
      TMUX_PANE: '%1',
    });

    expect(receivedCwd).toBeTruthy();
  });
});
