'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const settings = readPluginSettings();
const executablePath = resolveCommand([
  settingString('python.command'),
  process.env.PYRIGHT_LANGSERVER_PATH,
  ...(process.platform === 'win32'
    ? ['pyright-langserver.cmd', 'basedpyright-langserver.cmd']
    : ['pyright-langserver', 'basedpyright-langserver']),
]);

if (!executablePath) {
  process.stderr.write([
    '[official.python-pyright] Unable to locate a Python language server.',
    'Install pyright or basedpyright globally, or set python.command / PYRIGHT_LANGSERVER_PATH.',
    '',
  ].join('\n'));
  process.exit(1);
}

const args = splitCommandArgs(settingString('python.serverArgs'));
if (!args.includes('--stdio')) {
  args.push('--stdio');
}

const child = spawn(executablePath, args, {
  cwd: process.env.COPILOT_TERMINAL_PROJECT_ROOT || process.cwd(),
  env: process.env,
  stdio: ['pipe', 'pipe', 'pipe'],
});

process.stdin.pipe(child.stdin);
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);

child.on('error', (error) => {
  process.stderr.write(`[official.python-pyright] Failed to start ${executablePath}: ${error.message}\n`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

function readPluginSettings() {
  const raw = process.env.COPILOT_TERMINAL_PLUGIN_SETTINGS;
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function settingString(key) {
  const value = settings[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function resolveCommand(candidates) {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || candidate.trim().length === 0) {
      continue;
    }

    const resolved = resolveExecutable(candidate.trim());
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

function resolveExecutable(command) {
  if (path.isAbsolute(command) || command.includes(path.sep)) {
    return isExecutable(command) ? command : null;
  }

  const pathEntries = (process.env.PATH || process.env.Path || '')
    .split(path.delimiter)
    .filter(Boolean);
  const extensions = process.platform === 'win32'
    ? ['.cmd', '.exe', '.bat', '']
    : [''];

  for (const entry of pathEntries) {
    for (const extension of extensions) {
      const candidatePath = path.join(entry, command.endsWith(extension) ? command : `${command}${extension}`);
      if (isExecutable(candidatePath)) {
        return candidatePath;
      }
    }
  }

  return null;
}

function isExecutable(filePath) {
  try {
    fs.accessSync(filePath, process.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function splitCommandArgs(value) {
  if (!value) {
    return [];
  }

  const args = [];
  let current = '';
  let quote = null;
  let escapeNext = false;

  for (const character of value) {
    if (escapeNext) {
      current += character;
      escapeNext = false;
      continue;
    }

    if (character === '\\') {
      escapeNext = true;
      continue;
    }

    if (quote) {
      if (character === quote) {
        quote = null;
      } else {
        current += character;
      }
      continue;
    }

    if (character === '"' || character === '\'') {
      quote = character;
      continue;
    }

    if (/\s/.test(character)) {
      if (current.length > 0) {
        args.push(current);
        current = '';
      }
      continue;
    }

    current += character;
  }

  if (current.length > 0) {
    args.push(current);
  }

  return args;
}
