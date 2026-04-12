'use strict';

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const settings = readPluginSettings();
const workspaceStoragePath = process.env.COPILOT_TERMINAL_WORKSPACE_STORAGE || path.join(process.cwd(), '.jdtls-workspace');
const pluginRoot = path.resolve(__dirname, '..');
const configuredCommand = settingString('jdtls.command') || process.env.JDTLS_COMMAND;
const extraArgs = splitCommandArgs(settingString('jdtls.args'));
const jvmArgs = splitCommandArgs(settingString('jdtls.jvmArgs'));
const env = {
  ...process.env,
};
const configuredJavaHome = settingString('java.home');
if (configuredJavaHome) {
  env.JAVA_HOME = configuredJavaHome;
}

const bundledLauncherJar = findBundledLauncherJar(path.join(pluginRoot, 'vendor', 'jdtls'));
const bundledConfigDirectory = resolveBundledConfigDirectory(path.join(pluginRoot, 'vendor', 'jdtls'));
const configuredExecutablePath = resolveCommand([configuredCommand]);
let command;
let args;

if (configuredExecutablePath) {
  if (configuredExecutablePath.toLowerCase().endsWith('.jar')) {
    const javaExecutable = resolveJavaExecutable(configuredJavaHome);
    if (!javaExecutable) {
      process.stderr.write('[official.java-jdtls] Unable to locate Java 21+. Set java.home to your local Java runtime directory.\n');
      process.exit(1);
    }
    validateJavaRuntime(javaExecutable);

    command = javaExecutable;
    args = buildBundledJdtlsArgs({
      launcherJarPath: configuredExecutablePath,
      configDirectory: bundledConfigDirectory,
      workspaceStoragePath,
      jvmArgs,
      extraArgs,
    });
  } else {
    command = configuredExecutablePath;
    args = ensureWorkspaceDataArg(extraArgs, workspaceStoragePath);
  }
} else if (bundledLauncherJar && bundledConfigDirectory) {
  const javaExecutable = resolveJavaExecutable(configuredJavaHome);
  if (!javaExecutable) {
    process.stderr.write('[official.java-jdtls] Unable to locate Java 21+. Set java.home to your local Java runtime directory.\n');
    process.exit(1);
  }
  validateJavaRuntime(javaExecutable);

  command = javaExecutable;
  args = buildBundledJdtlsArgs({
    launcherJarPath: bundledLauncherJar,
    configDirectory: bundledConfigDirectory,
    workspaceStoragePath,
    jvmArgs,
    extraArgs,
  });
} else {
  const fallbackExecutablePath = resolveCommand(process.platform === 'win32' ? ['jdtls.cmd', 'jdtls'] : ['jdtls']);
  if (!fallbackExecutablePath) {
    process.stderr.write([
      '[official.java-jdtls] Unable to locate JDTLS.',
      'Reinstall the plugin to restore bundled JDTLS, or set jdtls.command / JDTLS_COMMAND.',
      '',
    ].join('\n'));
    process.exit(1);
  }

  command = fallbackExecutablePath;
  args = ensureWorkspaceDataArg(extraArgs, workspaceStoragePath);
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
  const explicitJavaHome = normalizeJavaHome(javaHome)
    || normalizeJavaHome(process.env.JAVA_HOME)
    || normalizeJavaHome(process.env.JDK_HOME);

  if (explicitJavaHome) {
    const candidatePath = path.join(explicitJavaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
    if (isExecutable(candidatePath)) {
      return candidatePath;
    }
  }

  return resolveCommand(process.platform === 'win32' ? ['java.exe', 'java'] : ['java']);
}

function normalizeJavaHome(value) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function validateJavaRuntime(javaExecutable) {
  const result = spawnSync(javaExecutable, ['-version'], {
    encoding: 'utf8',
  });

  if (result.error) {
    process.stderr.write(`[official.java-jdtls] Failed to inspect Java runtime at ${javaExecutable}: ${result.error.message}\n`);
    process.exit(1);
  }

  const versionOutput = `${result.stderr || ''}\n${result.stdout || ''}`;
  const majorVersion = parseJavaMajorVersion(versionOutput);
  if (majorVersion === null) {
    process.stderr.write(`[official.java-jdtls] Unable to determine Java runtime version for ${javaExecutable}. Configure java.home to a Java 21+ runtime.\n`);
    process.exit(1);
  }

  if (majorVersion < 21) {
    process.stderr.write(`[official.java-jdtls] Java ${majorVersion} is too old. Configure java.home to a Java 21+ runtime. JDTLS supports Java 8+ projects, but it must run on Java 21+.\n`);
    process.exit(1);
  }
}

function parseJavaMajorVersion(versionOutput) {
  const match = String(versionOutput).match(/version\s+"(\d+)(?:\.(\d+))?/i);
  if (!match) {
    return null;
  }

  const first = Number.parseInt(match[1], 10);
  if (!Number.isFinite(first)) {
    return null;
  }

  if (first === 1 && match[2]) {
    const second = Number.parseInt(match[2], 10);
    return Number.isFinite(second) ? second : null;
  }

  return first;
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

function ensureWorkspaceDataArg(args, workspacePath) {
  return hasCommandArg(args, '-data')
    ? [...args]
    : [...args, '-data', workspacePath];
}

function buildBundledJdtlsArgs({
  launcherJarPath,
  configDirectory,
  workspaceStoragePath,
  jvmArgs,
  extraArgs,
}) {
  const args = [
    '-Declipse.application=org.eclipse.jdt.ls.core.id1',
    '-Dosgi.bundles.defaultStartLevel=4',
    '-Declipse.product=org.eclipse.jdt.ls.core.product',
    '-Dlog.level=ERROR',
    ...ensureJvmDefaults(jvmArgs),
    '-jar',
    launcherJarPath,
  ];

  if (configDirectory && !hasCommandArg(extraArgs, '-configuration')) {
    args.push('-configuration', configDirectory);
  }

  args.push(...extraArgs);

  if (!hasCommandArg(args, '-data')) {
    args.push('-data', workspaceStoragePath);
  }

  return args;
}

function ensureJvmDefaults(jvmArgs) {
  const args = [...jvmArgs];

  if (!hasCommandArg(args, '--add-modules')) {
    args.push('--add-modules=ALL-SYSTEM');
  }

  if (!hasCommandArg(args, '--add-opens')) {
    args.push('--add-opens', 'java.base/java.util=ALL-UNNAMED');
    args.push('--add-opens', 'java.base/java.lang=ALL-UNNAMED');
  }

  if (!args.some((arg) => typeof arg === 'string' && arg.startsWith('-Xmx'))) {
    args.push('-Xmx1G');
  }

  return args;
}

function hasCommandArg(args, flag) {
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === flag || value.startsWith(`${flag}=`)) {
      return true;
    }
  }

  return false;
}

function findBundledLauncherJar(jdtlsRoot) {
  const pluginsDirectory = path.join(jdtlsRoot, 'plugins');
  if (!fs.existsSync(pluginsDirectory)) {
    return null;
  }

  const entries = fs.readdirSync(pluginsDirectory, { withFileTypes: true });
  const launcher = entries.find((entry) => (
    entry.isFile() && /^org\.eclipse\.equinox\.launcher_.*\.jar$/.test(entry.name)
  ));

  return launcher ? path.join(pluginsDirectory, launcher.name) : null;
}

function resolveBundledConfigDirectory(jdtlsRoot) {
  const candidates = process.platform === 'win32'
    ? ['config_win']
    : process.platform === 'darwin'
      ? (process.arch === 'arm64' ? ['config_mac_arm', 'config_mac'] : ['config_mac'])
      : (process.arch === 'arm64' ? ['config_linux_arm', 'config_linux'] : ['config_linux']);

  for (const candidate of candidates) {
    const directoryPath = path.join(jdtlsRoot, candidate);
    if (fs.existsSync(directoryPath)) {
      return directoryPath;
    }
  }

  return null;
}
