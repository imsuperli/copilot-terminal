#!/usr/bin/env node
/**
 * tmux-shim.js - Fake tmux shim for Copilot Terminal
 *
 * This script masquerades as the real tmux binary. When Claude Code invokes
 * "tmux <args>", this shim intercepts the call, sends an RPC request to the
 * Copilot Terminal main process via named pipe (Windows) or Unix socket,
 * and relays the response back to stdout/stderr with the correct exit code.
 *
 * Required environment variables (injected by ProcessManager):
 *   AUSOME_TMUX_RPC           - Named pipe / Unix socket path for RPC
 *   AUSOME_TERMINAL_WINDOW_ID - Internal window ID
 *   AUSOME_TERMINAL_PANE_ID   - Internal pane ID
 *   TMUX_PANE                 - Fake tmux pane ID, e.g. %1
 *
 * Optional:
 *   AUSOME_TMUX_DEBUG=1       - Enable debug logging to stderr
 */

'use strict';

const net = require('net');
const crypto = require('crypto');
const fs = require('fs');

const DEBUG = process.env.AUSOME_TMUX_DEBUG === '1';
const LOG_FILE = process.env.AUSOME_TMUX_LOG_FILE;

function trace(message, extra) {
  const rendered = extra === undefined
    ? `${message}`
    : (() => {
        try {
          return `${message}: ${JSON.stringify(extra)}`;
        } catch (error) {
          return `${message}: ${String(error)}`;
        }
      })();

  if (DEBUG) {
    process.stderr.write(`[tmux-shim] ${rendered}\n`);
  }

  if (LOG_FILE) {
    try {
      fs.appendFileSync(LOG_FILE, `[tmux-shim ${new Date().toISOString()}] ${rendered}\n`, 'utf8');
    } catch {}
  }
}

function debug(message, extra) {
  trace(message, extra);
}

const argv = process.argv.slice(2);
debug('argv', argv);

if (argv.length === 1 && argv[0] === '-V') {
  process.stdout.write('tmux 3.4\n');
  process.exit(0);
}

const rpcPath = process.env.AUSOME_TMUX_RPC;
const windowId = process.env.AUSOME_TERMINAL_WINDOW_ID;
const workspacePaneId = process.env.AUSOME_TERMINAL_PANE_ID;
const tmuxPaneId = process.env.TMUX_PANE;
const tmuxValue = process.env.TMUX;
const logFile = process.env.AUSOME_TMUX_LOG_FILE;

if (!rpcPath) {
  process.stderr.write('tmux-shim: AUSOME_TMUX_RPC not set\n');
  process.exit(1);
}

debug('startup', {
  rpcPath,
  windowId,
  workspacePaneId,
  tmuxPaneId,
  tmux: tmuxValue,
  cwd: process.cwd(),
  pid: process.pid,
  ppid: process.ppid,
  platform: process.platform,
  logFile,
});

function generateRequestId() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

const request = {
  type: 'request',
  requestId: generateRequestId(),
  request: {
    argv,
    windowId: windowId || undefined,
    paneId: tmuxPaneId || undefined,
    cwd: process.cwd(),
    debug: DEBUG || undefined,
    debugContext: {
      tmux: tmuxValue || undefined,
      tmuxPane: tmuxPaneId || undefined,
      rpcPath,
      windowId: windowId || undefined,
      paneId: workspacePaneId || undefined,
      pid: process.pid,
      ppid: process.ppid,
      platform: process.platform,
      cwd: process.cwd(),
      logFile: logFile || undefined,
    },
  },
};

const payload = JSON.stringify(request) + '\n';
debug('request', request.request);

const TIMEOUT_MS = 30000;
const socket = net.createConnection(rpcPath, () => {
  debug('connected to RPC server');
  socket.write(payload);
});

let responseData = '';

socket.on('data', (chunk) => {
  responseData += chunk.toString();
});

socket.on('end', () => {
  debug('raw response', responseData.trim());

  const lines = responseData.split('\n').filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    process.stderr.write('tmux-shim: empty response from RPC server\n');
    process.exit(1);
  }

  let response;
  try {
    response = JSON.parse(lines[lines.length - 1]);
  } catch (error) {
    process.stderr.write(`tmux-shim: invalid JSON response: ${error.message}\n`);
    debug('response parse failure', lines[lines.length - 1]);
    process.exit(1);
  }

  if (response.error) {
    debug('response error', response.error);
    process.stderr.write(`${response.error}\n`);
    process.exit(1);
  }

  if (response.response) {
    const { exitCode, stdout, stderr } = response.response;
    debug('response summary', {
      exitCode,
      stdoutLength: stdout ? stdout.length : 0,
      stderrLength: stderr ? stderr.length : 0,
      stdoutPreview: stdout ? stdout.slice(0, 200) : '',
      stderrPreview: stderr ? stderr.slice(0, 200) : '',
    });

    if (stdout) {
      process.stdout.write(stdout);
    }
    if (stderr) {
      process.stderr.write(stderr);
    }

    process.exit(exitCode != null ? exitCode : 0);
  }

  process.stderr.write('tmux-shim: unexpected response format\n');
  debug('unexpected response', response);
  process.exit(1);
});

socket.on('error', (error) => {
  debug('socket error', error.message);
  process.stderr.write(`tmux-shim: cannot connect to RPC server: ${error.message}\n`);
  process.exit(1);
});

const timer = setTimeout(() => {
  debug('timeout reached');
  process.stderr.write('tmux-shim: RPC request timed out\n');
  socket.destroy();
  process.exit(1);
}, TIMEOUT_MS);

timer.unref();
