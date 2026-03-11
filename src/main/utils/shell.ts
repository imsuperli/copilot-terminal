import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { Settings } from '../types/workspace';

let cachedDefaultShell: string | null = null;

interface ShellCandidate {
  command: string;
}

export interface AvailableShellProgram {
  command: string;
  path: string;
  isDefault: boolean;
}

const WINDOWS_SHELL_CANDIDATES: ShellCandidate[] = [
  { command: 'pwsh.exe' },
  { command: 'powershell.exe' },
  { command: 'cmd.exe' },
];

const MACOS_SHELL_CANDIDATES: ShellCandidate[] = [
  { command: '/bin/zsh' },
  { command: '/bin/bash' },
];

const LINUX_SHELL_CANDIDATES: ShellCandidate[] = [
  { command: '/bin/bash' },
  { command: '/usr/bin/zsh' },
  { command: '/bin/sh' },
];

export function normalizeShellProgram(shellProgram?: string | null): string | undefined {
  const normalized = shellProgram?.trim();
  return normalized ? normalized : undefined;
}

function getShellCandidates(): ShellCandidate[] {
  if (process.platform === 'win32') {
    return WINDOWS_SHELL_CANDIDATES;
  }

  if (process.platform === 'darwin') {
    return MACOS_SHELL_CANDIDATES;
  }

  return LINUX_SHELL_CANDIDATES;
}

function commandExists(command: string): boolean {
  return resolveShellPath(command) !== null;
}

function resolveShellPath(command: string): string | null {
  const normalized = normalizeShellProgram(command);
  if (!normalized) {
    return null;
  }

  if (normalized.includes('\\') || normalized.includes('/')) {
    return existsSync(normalized) ? normalized : null;
  }

  try {
    if (process.platform === 'win32') {
      const output = execSync(`where ${normalized}`, { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' });
      const resolved = output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean);

      return resolved ?? null;
    }

    const output = execSync(`command -v ${normalized}`, { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' });
    const resolved = output.trim();
    return resolved || null;
  } catch {
    return null;
  }
}

/**
 * 获取默认 shell，带回退逻辑
 *
 * Windows: pwsh.exe (PowerShell 7+) > powershell.exe (PowerShell 5.1) > cmd.exe
 * macOS: zsh
 * Linux: bash
 */
export function getDefaultShell(): string {
  if (cachedDefaultShell) {
    return cachedDefaultShell;
  }

  for (const candidate of getShellCandidates()) {
    if (commandExists(candidate.command)) {
      cachedDefaultShell = candidate.command;
      return cachedDefaultShell;
    }
  }

  const fallbackCandidate = getShellCandidates()[0];
  cachedDefaultShell = fallbackCandidate?.command ?? (process.platform === 'win32' ? 'cmd.exe' : '/bin/sh');
  return cachedDefaultShell;
}

export function scanAvailableShellPrograms(): AvailableShellProgram[] {
  const defaultShell = getDefaultShell();

  return getShellCandidates()
    .map((candidate) => {
      const path = resolveShellPath(candidate.command);
      if (!path) {
        return null;
      }

      return {
        command: candidate.command,
        path,
        isDefault: candidate.command === defaultShell,
      };
    })
    .filter((candidate): candidate is AvailableShellProgram => candidate !== null);
}

export function resolveShellProgram(options: {
  preferredShellProgram?: string | null;
  settings?: Pick<Settings, 'terminal'> | null;
} = {}): string {
  return (
    normalizeShellProgram(options.preferredShellProgram) ??
    normalizeShellProgram(options.settings?.terminal?.defaultShellProgram) ??
    getDefaultShell()
  );
}
