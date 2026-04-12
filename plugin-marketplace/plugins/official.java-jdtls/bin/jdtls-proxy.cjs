'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const settings = readPluginSettings();
const workspaceStoragePath = process.env.COPILOT_TERMINAL_WORKSPACE_STORAGE || path.join(process.cwd(), '.jdtls-workspace');
const configuredCommand = settingString('jdtls.command') || process.env.JDTLS_COMMAND;
const executablePath = resolveCommand([
  configuredCommand,
  ...(process.platform === 'win32' ? ['jdtls.cmd', 'jdtls'] : ['jdtls']),
]);

if (!executablePath) {
  process.stderr.write([
    '[official.java-jdtls] Unable to locate JDTLS.',
    'Install a jdtls wrapper, or set jdtls.command / JDTLS_COMMAND.',
    '',
  ].join('\n'));
  process.exit(1);
}

const extraArgs = splitCommandArgs(settingString('jdtls.args'));
const env = {
  ...process.env,
};
const configuredJavaHome = settingString('java.home');
if (configuredJavaHome) {
  env.JAVA_HOME = configuredJavaHome;
}

let command = executablePath;
let args = extraArgs;

if (executablePath.toLowerCase().endsWith('.jar')) {
  const javaExecutable = resolveJavaExecutable(configuredJavaHome);
  if (!javaExecutable) {
    process.stderr.write('[official.java-jdtls] Unable to locate java. Set java.home or install Java 17+.\n');
    process.exit(1);
  }

  command = javaExecutable;
  args = ['-jar', executablePath, ...extraArgs];
}

if (!args.includes('-data')) {
  args.push('-data', workspaceStoragePath);
}

const child = spawn(command, args, {
  cwd: process.env.COPILOT_TERMINAL_PROJECT_ROOT || process.cwd(),
  env,
  stdio: ['pipe', 'pipe', 'pipe'],
});

process.stdin.pipe(child.stdin);
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);

child.on('error', (error) => {
  process.stderr.write(`[official.java-jdtls] Failed to start ${command}: ${error.message}\n`);
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

function resolveJavaExecutable(javaHome) {
  if (javaHome) {
    const candidatePath = path.join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
    if (isExecutable(candidatePath)) {
      return candidatePath;
    }
  }

  return resolveCommand(process.platform === 'win32' ? ['java.exe', 'java'] : ['java']);
}

function resolveExecutable(command) {
  if (path.isAbsolute(command) || command.includes(path.sep)) {
    return fs.existsSync(command) ? command : null;
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
