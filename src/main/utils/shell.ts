import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { Settings } from '../types/workspace';

let cachedDefaultShell: string | null = null;

interface ShellCandidate {
  command: string;
  label: string;
}

export interface AvailableShellProgram {
  command: string;
  label: string;
  isDefault: boolean;
}

const WINDOWS_SHELL_CANDIDATES: ShellCandidate[] = [
  { command: 'pwsh.exe', label: 'PowerShell 7 (pwsh.exe)' },
  { command: 'powershell.exe', label: 'Windows PowerShell 5.1 (powershell.exe)' },
  { command: 'cmd.exe', label: 'Command Prompt (cmd.exe)' },
];

const MACOS_SHELL_CANDIDATES: ShellCandidate[] = [
  { command: '/bin/zsh', label: 'zsh (/bin/zsh)' },
  { command: '/bin/bash', label: 'bash (/bin/bash)' },
];

const LINUX_SHELL_CANDIDATES: ShellCandidate[] = [
  { command: '/bin/bash', label: 'bash (/bin/bash)' },
  { command: '/usr/bin/zsh', label: 'zsh (/usr/bin/zsh)' },
  { command: '/bin/sh', label: 'sh (/bin/sh)' },
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
  const normalized = normalizeShellProgram(command);
  if (!normalized) {
    return false;
  }

  if (normalized.includes('\\') || normalized.includes('/')) {
    return existsSync(normalized);
  }

  try {
    if (process.platform === 'win32') {
      execSync(`where ${normalized}`, { stdio: 'ignore' });
    } else {
      execSync(`command -v ${normalized}`, { stdio: 'ignore' });
    }
    return true;
  } catch {
    return false;
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
    .filter((candidate) => commandExists(candidate.command))
    .map((candidate) => ({
      command: candidate.command,
      label: candidate.label,
      isDefault: candidate.command === defaultShell,
    }));
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
