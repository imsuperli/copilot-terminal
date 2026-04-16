import path from 'path';
import type { SpawnOptionsWithoutStdio } from 'child_process';

export interface PreparedSpawnCommand {
  command: string;
  args: string[];
  options: SpawnOptionsWithoutStdio;
  displayCommand: string;
}

export function prepareSpawnCommand(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): PreparedSpawnCommand {
  const normalizedCommand = normalizeSpawnCommand(command);
  if (!normalizedCommand) {
    throw new Error('Spawn command is empty');
  }

  const normalizedArgs = normalizeSpawnArgs(args);
  if (process.platform !== 'win32' || !requiresWindowsCommandShell(normalizedCommand)) {
    return {
      command: normalizedCommand,
      args: normalizedArgs,
      options: {
        cwd,
        env,
      },
      displayCommand: formatDisplayCommand(normalizedCommand, normalizedArgs),
    };
  }

  return {
    command: normalizedCommand,
    args: normalizedArgs,
    options: {
      cwd,
      env,
      shell: true,
      windowsHide: true,
    },
    displayCommand: formatDisplayCommand(normalizedCommand, normalizedArgs),
  };
}

export function normalizeSpawnCommand(command: string): string {
  return command.trim().replace(/^"(.*)"$/s, '$1');
}

export function normalizeSpawnArgs(args: string[]): string[] {
  return args
    .filter((arg): arg is string => typeof arg === 'string')
    .map((arg) => arg.trim())
    .filter((arg) => arg.length > 0);
}

function requiresWindowsCommandShell(command: string): boolean {
  const normalized = command.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return normalized.endsWith('.cmd')
    || normalized.endsWith('.bat')
    || normalized === 'mvn'
    || normalized === 'mvn.cmd'
    || normalized === 'gradle'
    || normalized === 'gradle.bat'
    || normalized === 'mvnw'
    || normalized.endsWith(`${path.win32.sep}mvnw`)
    || normalized === 'mvnw.cmd'
    || normalized === 'gradlew'
    || normalized.endsWith(`${path.win32.sep}gradlew`)
    || normalized === 'gradlew.bat';
}

function formatDisplayCommand(command: string, args: string[]): string {
  return [command, ...args].join(' ').trim();
}
