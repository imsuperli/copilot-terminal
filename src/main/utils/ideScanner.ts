import { existsSync, readdirSync, statSync } from 'fs';
import { spawnSync } from 'child_process';
import { homedir, platform } from 'os';
import { basename, dirname, extname, join, resolve } from 'path';
import { shell as electronShell } from 'electron';
import { IDEConfig } from '../types/workspace';

type SupportedPlatform = 'win32' | 'darwin' | 'linux';

interface IDECatalogEntry {
  id: string;
  name: string;
  command: string;
  aliases: string[];
  executableNames: Partial<Record<SupportedPlatform, string[]>>;
  displayNamePatterns: string[];
  appNamePatterns?: string[];
  bundleIdentifiers?: string[];
  windowsPathHints?: string[];
  linuxPathHints?: string[];
}

interface DetectedIDECandidate {
  catalogId: string;
  name: string;
  command: string;
  path: string;
  installPath?: string;
  icon: string;
  source: string;
  confidence: number;
  version?: string;
}

interface WindowsShortcutEntry {
  name: string;
  targetPath: string;
  iconLocation?: string;
}

interface WindowsUninstallEntry {
  displayName?: string;
  displayIcon?: string;
  installLocation?: string;
  displayVersion?: string;
}

const CURRENT_PLATFORM = platform() as SupportedPlatform;

const IDE_CATALOG: IDECatalogEntry[] = [
  {
    id: 'vscode',
    name: 'VS Code',
    command: 'code',
    aliases: ['vscode', 'visual studio code', 'code'],
    executableNames: {
      win32: ['Code.exe', 'code.cmd'],
      darwin: ['Visual Studio Code.app'],
      linux: ['code'],
    },
    displayNamePatterns: ['visual studio code', 'vs code', 'vscode'],
    appNamePatterns: ['Visual Studio Code.app'],
    bundleIdentifiers: ['com.microsoft.VSCode'],
    windowsPathHints: ['Microsoft VS Code', 'VS Code'],
    linuxPathHints: ['/usr/share/code', '/opt/visual-studio-code'],
  },
  {
    id: 'vscode-insiders',
    name: 'VS Code Insiders',
    command: 'code-insiders',
    aliases: ['vscode insiders', 'visual studio code insiders', 'code insiders'],
    executableNames: {
      win32: ['Code - Insiders.exe', 'code-insiders.cmd'],
      darwin: ['Visual Studio Code - Insiders.app'],
      linux: ['code-insiders'],
    },
    displayNamePatterns: ['visual studio code insiders', 'vs code insiders'],
    appNamePatterns: ['Visual Studio Code - Insiders.app'],
    bundleIdentifiers: ['com.microsoft.VSCodeInsiders'],
    windowsPathHints: ['Microsoft VS Code Insiders', 'VS Code Insiders'],
    linuxPathHints: ['/usr/share/code-insiders', '/opt/visual-studio-code-insiders'],
  },
  {
    id: 'cursor',
    name: 'Cursor',
    command: 'cursor',
    aliases: ['cursor'],
    executableNames: {
      win32: ['Cursor.exe', 'cursor.cmd'],
      darwin: ['Cursor.app'],
      linux: ['cursor'],
    },
    displayNamePatterns: ['cursor'],
    appNamePatterns: ['Cursor.app'],
    bundleIdentifiers: ['com.todesktop.230313mzl4w4u92'],
    windowsPathHints: ['Cursor'],
    linuxPathHints: ['/opt/Cursor', '/usr/share/cursor'],
  },
  {
    id: 'vscodium',
    name: 'VSCodium',
    command: 'codium',
    aliases: ['vscodium', 'codium'],
    executableNames: {
      win32: ['VSCodium.exe', 'codium.cmd'],
      darwin: ['VSCodium.app'],
      linux: ['codium'],
    },
    displayNamePatterns: ['vscodium'],
    appNamePatterns: ['VSCodium.app'],
    bundleIdentifiers: ['com.vscodium'],
    windowsPathHints: ['VSCodium'],
    linuxPathHints: ['/usr/share/codium', '/opt/vscodium-bin'],
  },
  {
    id: 'idea',
    name: 'IntelliJ IDEA',
    command: 'idea',
    aliases: ['intellij idea', 'idea', 'idea ultimate', 'idea community'],
    executableNames: {
      win32: ['idea64.exe', 'idea.exe'],
      darwin: ['IntelliJ IDEA.app', 'IntelliJ IDEA CE.app'],
      linux: ['idea.sh', 'idea'],
    },
    displayNamePatterns: ['intellij idea', 'intellij'],
    appNamePatterns: ['IntelliJ IDEA.app', 'IntelliJ IDEA CE.app'],
    bundleIdentifiers: ['com.jetbrains.intellij', 'com.jetbrains.intellij.ce'],
    windowsPathHints: ['JetBrains', 'IntelliJ IDEA'],
    linuxPathHints: ['/opt/idea', '/snap/intellij-idea-community/current'],
  },
  {
    id: 'pycharm',
    name: 'PyCharm',
    command: 'pycharm',
    aliases: ['pycharm', 'pycharm ce'],
    executableNames: {
      win32: ['pycharm64.exe', 'pycharm.exe'],
      darwin: ['PyCharm.app', 'PyCharm CE.app'],
      linux: ['pycharm.sh', 'pycharm'],
    },
    displayNamePatterns: ['pycharm'],
    appNamePatterns: ['PyCharm.app', 'PyCharm CE.app'],
    bundleIdentifiers: ['com.jetbrains.pycharm', 'com.jetbrains.pycharm.ce'],
    windowsPathHints: ['JetBrains', 'PyCharm'],
    linuxPathHints: ['/opt/pycharm', '/snap/pycharm-community/current'],
  },
  {
    id: 'webstorm',
    name: 'WebStorm',
    command: 'webstorm',
    aliases: ['webstorm'],
    executableNames: {
      win32: ['webstorm64.exe', 'webstorm.exe'],
      darwin: ['WebStorm.app'],
      linux: ['webstorm.sh', 'webstorm'],
    },
    displayNamePatterns: ['webstorm'],
    appNamePatterns: ['WebStorm.app'],
    bundleIdentifiers: ['com.jetbrains.WebStorm'],
    windowsPathHints: ['JetBrains', 'WebStorm'],
    linuxPathHints: ['/opt/webstorm'],
  },
  {
    id: 'goland',
    name: 'GoLand',
    command: 'goland',
    aliases: ['goland'],
    executableNames: {
      win32: ['goland64.exe', 'goland.exe'],
      darwin: ['GoLand.app'],
      linux: ['goland.sh', 'goland'],
    },
    displayNamePatterns: ['goland'],
    appNamePatterns: ['GoLand.app'],
    bundleIdentifiers: ['com.jetbrains.goland'],
    windowsPathHints: ['JetBrains', 'GoLand'],
    linuxPathHints: ['/opt/goland'],
  },
  {
    id: 'phpstorm',
    name: 'PhpStorm',
    command: 'phpstorm',
    aliases: ['phpstorm'],
    executableNames: {
      win32: ['phpstorm64.exe', 'phpstorm.exe'],
      darwin: ['PhpStorm.app'],
      linux: ['phpstorm.sh', 'phpstorm'],
    },
    displayNamePatterns: ['phpstorm'],
    appNamePatterns: ['PhpStorm.app'],
    bundleIdentifiers: ['com.jetbrains.phpstorm'],
    windowsPathHints: ['JetBrains', 'PhpStorm'],
    linuxPathHints: ['/opt/phpstorm'],
  },
  {
    id: 'clion',
    name: 'CLion',
    command: 'clion',
    aliases: ['clion'],
    executableNames: {
      win32: ['clion64.exe', 'clion.exe'],
      darwin: ['CLion.app'],
      linux: ['clion.sh', 'clion'],
    },
    displayNamePatterns: ['clion'],
    appNamePatterns: ['CLion.app'],
    bundleIdentifiers: ['com.jetbrains.CLion'],
    windowsPathHints: ['JetBrains', 'CLion'],
    linuxPathHints: ['/opt/clion'],
  },
  {
    id: 'rider',
    name: 'Rider',
    command: 'rider',
    aliases: ['rider', 'jetbrains rider'],
    executableNames: {
      win32: ['rider64.exe', 'rider.exe'],
      darwin: ['Rider.app'],
      linux: ['rider.sh', 'rider'],
    },
    displayNamePatterns: ['rider'],
    appNamePatterns: ['Rider.app'],
    bundleIdentifiers: ['com.jetbrains.rider'],
    windowsPathHints: ['JetBrains', 'Rider'],
    linuxPathHints: ['/opt/rider'],
  },
  {
    id: 'rubymine',
    name: 'RubyMine',
    command: 'rubymine',
    aliases: ['rubymine'],
    executableNames: {
      win32: ['rubymine64.exe', 'rubymine.exe'],
      darwin: ['RubyMine.app'],
      linux: ['rubymine.sh', 'rubymine'],
    },
    displayNamePatterns: ['rubymine'],
    appNamePatterns: ['RubyMine.app'],
    bundleIdentifiers: ['com.jetbrains.rubymine'],
    windowsPathHints: ['JetBrains', 'RubyMine'],
    linuxPathHints: ['/opt/rubymine'],
  },
  {
    id: 'datagrip',
    name: 'DataGrip',
    command: 'datagrip',
    aliases: ['datagrip'],
    executableNames: {
      win32: ['datagrip64.exe', 'datagrip.exe'],
      darwin: ['DataGrip.app'],
      linux: ['datagrip.sh', 'datagrip'],
    },
    displayNamePatterns: ['datagrip'],
    appNamePatterns: ['DataGrip.app'],
    bundleIdentifiers: ['com.jetbrains.datagrip'],
    windowsPathHints: ['JetBrains', 'DataGrip'],
    linuxPathHints: ['/opt/datagrip'],
  },
  {
    id: 'dataspell',
    name: 'DataSpell',
    command: 'dataspell',
    aliases: ['dataspell'],
    executableNames: {
      win32: ['dataspell64.exe', 'dataspell.exe'],
      darwin: ['DataSpell.app'],
      linux: ['dataspell.sh', 'dataspell'],
    },
    displayNamePatterns: ['dataspell'],
    appNamePatterns: ['DataSpell.app'],
    bundleIdentifiers: ['com.jetbrains.dataspell'],
    windowsPathHints: ['JetBrains', 'DataSpell'],
    linuxPathHints: ['/opt/dataspell'],
  },
  {
    id: 'androidstudio',
    name: 'Android Studio',
    command: 'studio',
    aliases: ['android studio', 'studio'],
    executableNames: {
      win32: ['studio64.exe', 'studio.exe'],
      darwin: ['Android Studio.app'],
      linux: ['studio.sh', 'studio'],
    },
    displayNamePatterns: ['android studio'],
    appNamePatterns: ['Android Studio.app'],
    bundleIdentifiers: ['com.google.android.studio', 'com.google.android.studio-EAP'],
    windowsPathHints: ['Android', 'Android Studio'],
    linuxPathHints: ['/opt/android-studio'],
  },
  {
    id: 'eclipse',
    name: 'Eclipse',
    command: 'eclipse',
    aliases: ['eclipse', 'eclipse ide'],
    executableNames: {
      win32: ['eclipse.exe'],
      darwin: ['Eclipse.app'],
      linux: ['eclipse'],
    },
    displayNamePatterns: ['eclipse'],
    appNamePatterns: ['Eclipse.app'],
    bundleIdentifiers: ['org.eclipse.platform.ide'],
    windowsPathHints: ['Eclipse Foundation', 'eclipse'],
    linuxPathHints: ['/opt/eclipse'],
  },
  {
    id: 'sts',
    name: 'Spring Tool Suite',
    command: 'sts',
    aliases: ['spring tool suite', 'sts'],
    executableNames: {
      win32: ['SpringToolSuite4.exe', 'STS.exe'],
      darwin: ['SpringToolSuite4.app', 'STS.app'],
      linux: ['SpringToolSuite4', 'sts'],
    },
    displayNamePatterns: ['spring tool suite', 'sts'],
    appNamePatterns: ['SpringToolSuite4.app', 'STS.app'],
    bundleIdentifiers: ['com.springsource.sts4'],
    windowsPathHints: ['Spring Tool Suite', 'STS'],
    linuxPathHints: ['/opt/sts'],
  },
  {
    id: 'sublime',
    name: 'Sublime Text',
    command: 'subl',
    aliases: ['sublime text', 'sublime', 'subl'],
    executableNames: {
      win32: ['sublime_text.exe', 'subl.exe'],
      darwin: ['Sublime Text.app'],
      linux: ['sublime_text', 'subl'],
    },
    displayNamePatterns: ['sublime text'],
    appNamePatterns: ['Sublime Text.app'],
    bundleIdentifiers: ['com.sublimetext.4', 'com.sublimetext.3'],
    windowsPathHints: ['Sublime Text'],
    linuxPathHints: ['/opt/sublime_text'],
  },
  {
    id: 'zed',
    name: 'Zed',
    command: 'zed',
    aliases: ['zed'],
    executableNames: {
      win32: ['Zed.exe'],
      darwin: ['Zed.app'],
      linux: ['zed'],
    },
    displayNamePatterns: ['zed'],
    appNamePatterns: ['Zed.app'],
    bundleIdentifiers: ['dev.zed.Zed'],
    windowsPathHints: ['Zed'],
    linuxPathHints: ['/opt/zed'],
  },
];

const DEFAULT_LAUNCH_ARGS = (targetPath: string) => [targetPath];
const LAUNCH_ARGS_BY_ID: Record<string, (targetPath: string) => string[]> = {
  vscode: DEFAULT_LAUNCH_ARGS,
  'vscode-insiders': DEFAULT_LAUNCH_ARGS,
  cursor: DEFAULT_LAUNCH_ARGS,
  vscodium: DEFAULT_LAUNCH_ARGS,
  idea: DEFAULT_LAUNCH_ARGS,
  pycharm: DEFAULT_LAUNCH_ARGS,
  webstorm: DEFAULT_LAUNCH_ARGS,
  goland: DEFAULT_LAUNCH_ARGS,
  phpstorm: DEFAULT_LAUNCH_ARGS,
  clion: DEFAULT_LAUNCH_ARGS,
  rider: DEFAULT_LAUNCH_ARGS,
  rubymine: DEFAULT_LAUNCH_ARGS,
  datagrip: DEFAULT_LAUNCH_ARGS,
  dataspell: DEFAULT_LAUNCH_ARGS,
  androidstudio: DEFAULT_LAUNCH_ARGS,
  eclipse: DEFAULT_LAUNCH_ARGS,
  sts: DEFAULT_LAUNCH_ARGS,
  sublime: DEFAULT_LAUNCH_ARGS,
  zed: DEFAULT_LAUNCH_ARGS,
};

let windowsShortcutCache: WindowsShortcutEntry[] | null = null;
let windowsUninstallCache: WindowsUninstallEntry[] | null = null;

function normalizeText(value: string | undefined | null): string {
  return (value || '').trim().toLowerCase();
}

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())).map(value => value.trim()))];
}

function safeSpawn(command: string, args: string[]): string | null {
  try {
    const result = spawnSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    if (result.error || result.status !== 0) {
      return null;
    }

    return (result.stdout || '').trim();
  } catch {
    return null;
  }
}

function pathExists(pathToCheck: string | undefined | null): pathToCheck is string {
  if (!pathToCheck) {
    return false;
  }

  try {
    return existsSync(pathToCheck);
  } catch {
    return false;
  }
}

function cleanWindowsRegistryPath(raw: string | undefined): string | null {
  if (!raw) {
    return null;
  }

  let cleaned = raw.trim().replace(/^"|"$/g, '');
  cleaned = cleaned.replace(/,\d+$/, '');

  const exeIndex = cleaned.toLowerCase().indexOf('.exe');
  if (exeIndex >= 0) {
    cleaned = cleaned.slice(0, exeIndex + 4);
  }

  return pathExists(cleaned) ? resolve(cleaned) : null;
}

function extractRegistryValue(rawLine: string | undefined): string | undefined {
  if (!rawLine) {
    return undefined;
  }

  const match = rawLine.match(/REG_\w+\s+(.*)$/);
  return match ? match[1].trim() : rawLine.trim();
}

function parseVersionFromPath(filePath: string): string | undefined {
  const normalized = filePath.replace(/\\/g, '/');
  const match = normalized.match(/(\d{4}\.\d+(?:\.\d+)?)/);
  return match?.[1];
}

function scorePath(pathToScore: string): number {
  const normalized = normalizeText(pathToScore).replace(/\\/g, '/');
  let score = 0;

  if (normalized.includes('/program files/')) {
    score += 30;
  }
  if (normalized.includes('/applications/')) {
    score += 30;
  }
  if (normalized.includes('/jetbrains/toolbox/')) {
    score += 24;
  }
  if (normalized.includes('/appdata/local/programs/')) {
    score += 18;
  }
  if (normalized.includes('/bin/')) {
    score += 8;
  }

  return score;
}

function candidateToIDEConfig(entry: IDECatalogEntry, candidate: DetectedIDECandidate): IDEConfig {
  return {
    id: entry.id,
    name: entry.name,
    command: entry.command,
    path: candidate.path,
    enabled: true,
    icon: candidate.icon,
    installPath: candidate.installPath,
    detected: true,
    source: candidate.source,
    version: candidate.version,
    catalogId: entry.id,
    isCustom: false,
  };
}

function dedupeCandidates(candidates: DetectedIDECandidate[]): DetectedIDECandidate[] {
  const byPath = new Map<string, DetectedIDECandidate>();

  for (const candidate of candidates) {
    if (!pathExists(candidate.path)) {
      continue;
    }

    const key = resolve(candidate.path);
    const existing = byPath.get(key);
    if (!existing || candidate.confidence > existing.confidence) {
      byPath.set(key, candidate);
    }
  }

  return [...byPath.values()];
}

function pickBestCandidate(candidates: DetectedIDECandidate[]): DetectedIDECandidate | null {
  const deduped = dedupeCandidates(candidates);
  if (deduped.length === 0) {
    return null;
  }

  deduped.sort((left, right) => {
    const confidenceDiff = right.confidence - left.confidence;
    if (confidenceDiff !== 0) {
      return confidenceDiff;
    }

    const pathDiff = scorePath(right.path) - scorePath(left.path);
    if (pathDiff !== 0) {
      return pathDiff;
    }

    return right.path.length - left.path.length;
  });

  return deduped[0];
}

function pushCandidate(
  results: DetectedIDECandidate[],
  entry: IDECatalogEntry,
  pathToBinary: string,
  source: string,
  confidence: number,
  installPath?: string,
  version?: string,
  iconSource?: string,
): void {
  if (!pathExists(pathToBinary)) {
    return;
  }

  results.push({
    catalogId: entry.id,
    name: entry.name,
    command: entry.command,
    path: resolve(pathToBinary),
    installPath: installPath ? resolve(installPath) : undefined,
    icon: iconSource ? resolve(iconSource) : installPath ? resolve(installPath) : resolve(pathToBinary),
    source,
    confidence,
    version: version || parseVersionFromPath(pathToBinary),
  });
}

function getCatalogEntry(identifier: string): IDECatalogEntry | undefined {
  const normalized = normalizeText(identifier);
  return IDE_CATALOG.find(entry =>
    entry.id === normalized ||
    normalizeText(entry.command) === normalized ||
    normalizeText(entry.name) === normalized ||
    entry.aliases.some(alias => normalizeText(alias) === normalized)
  );
}

function isDirectory(pathToCheck: string): boolean {
  try {
    return statSync(pathToCheck).isDirectory();
  } catch {
    return false;
  }
}

function listDirectory(pathToList: string): string[] {
  try {
    return readdirSync(pathToList);
  } catch {
    return [];
  }
}

function listDirectoryEntries(pathToList: string): string[] {
  try {
    return readdirSync(pathToList, { withFileTypes: true }).map(entry => join(pathToList, entry.name));
  } catch {
    return [];
  }
}

function findMacAppExecutable(appPath: string, entry: IDECatalogEntry): string | null {
  const macOSDir = join(appPath, 'Contents', 'MacOS');
  if (!pathExists(macOSDir)) {
    return null;
  }

  const preferredNames = uniqueStrings([
    ...(entry.executableNames.darwin || []).map(name => basename(name, '.app')),
    basename(appPath, '.app'),
    entry.command,
  ]);

  for (const fileName of preferredNames) {
    const candidate = join(macOSDir, fileName);
    if (pathExists(candidate)) {
      return candidate;
    }
  }

  const firstBinary = listDirectory(macOSDir)
    .map(fileName => join(macOSDir, fileName))
    .find(pathExists);

  return firstBinary || null;
}

function matchesAnyPattern(value: string | undefined | null, patterns: string[]): boolean {
  const normalized = normalizeText(value);
  return patterns.some(pattern => normalized.includes(normalizeText(pattern)));
}

function scanPathLookup(entry: IDECatalogEntry): DetectedIDECandidate[] {
  const executableNames = entry.executableNames[CURRENT_PLATFORM] || [];
  const locator = CURRENT_PLATFORM === 'win32' ? 'where.exe' : 'which';
  const results: DetectedIDECandidate[] = [];

  for (const executableName of executableNames) {
    const output = safeSpawn(locator, [executableName]);
    if (!output) {
      continue;
    }

    const firstMatch = output.split(/\r?\n/).find(line => pathExists(line.trim()));
    if (!firstMatch) {
      continue;
    }

    const resolvedPath = resolve(firstMatch.trim());
    pushCandidate(results, entry, resolvedPath, 'path', 58, dirname(resolvedPath));
  }

  return results;
}

function queryWindowsAppPaths(executableName: string): string[] {
  const hives = [
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths',
    'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths',
    'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths',
  ];

  const matches: string[] = [];

  for (const hive of hives) {
    const output = safeSpawn('reg', ['query', `${hive}\\${executableName}`, '/ve']);
    if (!output) {
      continue;
    }

    const value = cleanWindowsRegistryPath(extractRegistryValue(output.split(/\r?\n/).find(line => line.includes('REG_'))));
    if (value) {
      matches.push(value);
    }
  }

  return uniqueStrings(matches);
}

function getWindowsUninstallEntries(): WindowsUninstallEntry[] {
  if (windowsUninstallCache) {
    return windowsUninstallCache;
  }

  const hives = [
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  ];

  const entries: WindowsUninstallEntry[] = [];

  for (const hive of hives) {
    const output = safeSpawn('reg', ['query', hive, '/s']);
    if (!output) {
      continue;
    }

    const lines = output.split(/\r?\n/);
    let current: WindowsUninstallEntry | null = null;

    for (const line of lines) {
      if (line.startsWith('HKEY_')) {
        if (current && (current.displayName || current.displayIcon || current.installLocation)) {
          entries.push(current);
        }
        current = {};
        continue;
      }

      if (!current) {
        continue;
      }

      const match = line.match(/^\s+([A-Za-z0-9_]+)\s+REG_\w+\s+(.*)$/);
      if (!match) {
        continue;
      }

      const [, key, value] = match;
      if (key === 'DisplayName') {
        current.displayName = value.trim();
      } else if (key === 'DisplayIcon') {
        current.displayIcon = value.trim();
      } else if (key === 'InstallLocation') {
        current.installLocation = value.trim();
      } else if (key === 'DisplayVersion') {
        current.displayVersion = value.trim();
      }
    }

    if (current && (current.displayName || current.displayIcon || current.installLocation)) {
      entries.push(current);
    }
  }

  windowsUninstallCache = entries;
  return entries;
}

function getWindowsShortcutEntries(): WindowsShortcutEntry[] {
  if (windowsShortcutCache) {
    return windowsShortcutCache;
  }

  const roots = uniqueStrings([
    process.env.ProgramData ? join(process.env.ProgramData, 'Microsoft', 'Windows', 'Start Menu', 'Programs') : undefined,
    process.env.APPDATA ? join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs') : undefined,
    process.env.USERPROFILE ? join(process.env.USERPROFILE, 'Desktop') : undefined,
    process.env.PUBLIC ? join(process.env.PUBLIC, 'Desktop') : undefined,
  ]);

  const shortcutPaths: string[] = [];
  const queue = [...roots];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current) || !pathExists(current)) {
      continue;
    }
    visited.add(current);

    for (const entryPath of listDirectoryEntries(current)) {
      if (isDirectory(entryPath)) {
        queue.push(entryPath);
        continue;
      }

      if (entryPath.toLowerCase().endsWith('.lnk')) {
        shortcutPaths.push(entryPath);
      }
    }
  }

  const entries = shortcutPaths
    .map((shortcutPath): WindowsShortcutEntry | null => {
      try {
        const shortcut = electronShell.readShortcutLink(shortcutPath);
        if (!shortcut.target || !pathExists(shortcut.target)) {
          return null;
        }

        return {
          name: basename(shortcutPath, '.lnk'),
          targetPath: shortcut.target,
          iconLocation: shortcut.icon,
        };
      } catch {
        return null;
      }
    })
    .filter((entry): entry is WindowsShortcutEntry => entry !== null);

  windowsShortcutCache = entries;
  return entries;
}

function getWindowsDirectCandidates(entry: IDECatalogEntry): string[] {
  const roots = uniqueStrings([
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Programs') : undefined,
    process.env.LocalAppData ? join(process.env.LocalAppData, 'Programs') : undefined,
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'],
    process.env.ProgramW6432,
  ]);

  const candidates: string[] = [];
  const executableNames = entry.executableNames.win32 || [];

  for (const root of roots) {
    for (const hint of entry.windowsPathHints || []) {
      for (const executableName of executableNames) {
        candidates.push(join(root, hint, executableName));
        candidates.push(join(root, hint, 'bin', executableName));
      }
    }
  }

  if (entry.id === 'cursor' && process.env.LOCALAPPDATA) {
    candidates.push(join(process.env.LOCALAPPDATA, 'Programs', 'Cursor', 'Cursor.exe'));
  }

  if (entry.id === 'vscode' && process.env.LOCALAPPDATA) {
    candidates.push(join(process.env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code', 'Code.exe'));
  }

  if (entry.id === 'vscode-insiders' && process.env.LOCALAPPDATA) {
    candidates.push(join(process.env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code Insiders', 'Code - Insiders.exe'));
  }

  if (entry.id === 'vscodium' && process.env.LOCALAPPDATA) {
    candidates.push(join(process.env.LOCALAPPDATA, 'Programs', 'VSCodium', 'VSCodium.exe'));
  }

  return uniqueStrings(candidates).filter(pathExists);
}

function findExecutableNearRoot(rootPath: string, executableNames: string[], keywords: string[]): string[] {
  if (!pathExists(rootPath)) {
    return [];
  }

  const matches: string[] = [];
  const queue: Array<{ path: string; depth: number }> = [{ path: rootPath, depth: 0 }];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const normalizedCurrent = resolve(current.path);
    if (visited.has(normalizedCurrent) || current.depth > 4) {
      continue;
    }
    visited.add(normalizedCurrent);

    for (const executableName of executableNames) {
      const directExecutable = join(current.path, executableName);
      if (pathExists(directExecutable)) {
        matches.push(directExecutable);
      }

      const binExecutable = join(current.path, 'bin', executableName);
      if (pathExists(binExecutable)) {
        matches.push(binExecutable);
      }
    }

    const children = listDirectory(current.path);
    for (const childName of children) {
      const childPath = join(current.path, childName);
      if (!isDirectory(childPath)) {
        continue;
      }

      if (current.depth === 0) {
        const shouldTraverse =
          keywords.length === 0 ||
          matchesAnyPattern(childName, keywords) ||
          matchesAnyPattern(current.path, keywords) ||
          matchesAnyPattern(childPath, ['JetBrains', 'Toolbox', 'Microsoft', 'Programs', 'Android', 'Cursor', 'Eclipse', 'Sublime', 'Spring']);

        if (!shouldTraverse) {
          continue;
        }
      }

      queue.push({ path: childPath, depth: current.depth + 1 });
    }
  }

  return uniqueStrings(matches);
}

function getWindowsSearchRoots(entry: IDECatalogEntry): string[] {
  const envRoots = uniqueStrings([
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'],
    process.env.ProgramW6432,
    process.env.LocalAppData,
    process.env.LOCALAPPDATA,
    process.env.USERPROFILE ? join(process.env.USERPROFILE, 'AppData', 'Local', 'Programs') : undefined,
    process.env.USERPROFILE ? join(process.env.USERPROFILE, 'scoop', 'apps') : undefined,
  ]);

  const hintedRoots = (entry.windowsPathHints || []).flatMap(hint => envRoots.map(root => join(root, hint)));
  const toolboxRoots = entry.aliases.flatMap(alias => [
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'JetBrains', 'Toolbox', 'apps', alias.replace(/\s+/g, '')) : undefined,
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'JetBrains', 'Toolbox', 'apps', alias.split(' ')[0].toLowerCase()) : undefined,
  ]);

  return uniqueStrings([...envRoots, ...hintedRoots, ...toolboxRoots]);
}

function scanWindowsCatalog(entry: IDECatalogEntry): DetectedIDECandidate[] {
  const results: DetectedIDECandidate[] = [];
  const executableNames = entry.executableNames.win32 || [];

  for (const directCandidate of getWindowsDirectCandidates(entry)) {
    pushCandidate(results, entry, directCandidate, 'filesystem:direct', 94, dirname(directCandidate));
  }

  for (const executableName of executableNames) {
    for (const appPath of queryWindowsAppPaths(executableName)) {
      pushCandidate(results, entry, appPath, 'registry:app-paths', 96, dirname(appPath));
    }
  }

  for (const uninstallEntry of getWindowsUninstallEntries()) {
    if (!matchesAnyPattern(uninstallEntry.displayName, entry.displayNamePatterns)) {
      continue;
    }

    const displayIcon = cleanWindowsRegistryPath(uninstallEntry.displayIcon);
    const installLocation = uninstallEntry.installLocation && pathExists(uninstallEntry.installLocation)
      ? resolve(uninstallEntry.installLocation)
      : undefined;

    if (displayIcon) {
      pushCandidate(
        results,
        entry,
        displayIcon,
        'registry:uninstall',
        88,
        installLocation || dirname(displayIcon),
        uninstallEntry.displayVersion,
        uninstallEntry.displayIcon ? cleanWindowsRegistryPath(uninstallEntry.displayIcon) || undefined : undefined,
      );
      continue;
    }

    if (installLocation) {
      for (const executableName of executableNames) {
        const installMatch = findExecutableNearRoot(installLocation, [executableName], entry.aliases)[0];
        if (installMatch) {
          pushCandidate(results, entry, installMatch, 'registry:uninstall', 84, installLocation, uninstallEntry.displayVersion);
        }
      }
    }
  }

  for (const shortcut of getWindowsShortcutEntries()) {
    if (!matchesAnyPattern(shortcut.name, [...entry.displayNamePatterns, ...entry.aliases])) {
      continue;
    }

    pushCandidate(
      results,
      entry,
      shortcut.targetPath,
      'start-menu',
      76,
      dirname(shortcut.targetPath),
      parseVersionFromPath(shortcut.targetPath),
      cleanWindowsRegistryPath(shortcut.iconLocation) || shortcut.targetPath,
    );
  }

  for (const root of getWindowsSearchRoots(entry)) {
    const matches = findExecutableNearRoot(root, executableNames, [...entry.aliases, ...entry.displayNamePatterns]);
    for (const match of matches) {
      pushCandidate(results, entry, match, 'filesystem', 66, dirname(dirname(match)));
    }
  }

  return [...results, ...scanPathLookup(entry)];
}

function scanMacApplications(entry: IDECatalogEntry): DetectedIDECandidate[] {
  const appRoots = ['/Applications', join(homedir(), 'Applications')];
  const results: DetectedIDECandidate[] = [];

  for (const appRoot of appRoots) {
    if (!pathExists(appRoot)) {
      continue;
    }

    for (const appName of listDirectory(appRoot)) {
      if (!appName.endsWith('.app')) {
        continue;
      }

      const appPath = join(appRoot, appName);
      if (!matchesAnyPattern(appName, [...(entry.appNamePatterns || []), ...entry.aliases, ...entry.displayNamePatterns])) {
        continue;
      }

      const executableMatch = findMacAppExecutable(appPath, entry);

      if (executableMatch) {
        pushCandidate(results, entry, executableMatch, 'applications', 84, appPath, parseVersionFromPath(executableMatch), appPath);
      }
    }
  }

  return results;
}

function scanMacMetadata(entry: IDECatalogEntry): DetectedIDECandidate[] {
  const results: DetectedIDECandidate[] = [];

  for (const bundleId of entry.bundleIdentifiers || []) {
    const output = safeSpawn('mdfind', [`kMDItemCFBundleIdentifier=="${bundleId}"`]);
    if (!output) {
      continue;
    }

    for (const appPath of output.split(/\r?\n/).map(line => line.trim()).filter(line => line.endsWith('.app') && pathExists(line))) {
      const executableMatch = findMacAppExecutable(appPath, entry);
      if (executableMatch) {
        pushCandidate(results, entry, executableMatch, 'mdfind', 90, appPath, parseVersionFromPath(executableMatch), appPath);
      }
    }
  }

  return results;
}

function scanLinuxCatalog(entry: IDECatalogEntry): DetectedIDECandidate[] {
  const results: DetectedIDECandidate[] = [];

  for (const hintPath of entry.linuxPathHints || []) {
    if (!pathExists(hintPath)) {
      continue;
    }

    const executableNames = entry.executableNames.linux || [];
    const match = findExecutableNearRoot(hintPath, executableNames, entry.aliases);
    for (const executablePath of match) {
      pushCandidate(results, entry, executablePath, 'filesystem', 72, dirname(dirname(executablePath)));
    }
  }

  return [...results, ...scanPathLookup(entry)];
}

function scanCatalog(entry: IDECatalogEntry): DetectedIDECandidate | null {
  let candidates: DetectedIDECandidate[] = [];

  if (CURRENT_PLATFORM === 'win32') {
    candidates = scanWindowsCatalog(entry);
  } else if (CURRENT_PLATFORM === 'darwin') {
    candidates = [...scanMacApplications(entry), ...scanMacMetadata(entry), ...scanPathLookup(entry)];
  } else {
    candidates = scanLinuxCatalog(entry);
  }

  return pickBestCandidate(candidates);
}

export function scanInstalledIDEs(): IDEConfig[] {
  return IDE_CATALOG
    .map(entry => {
      const candidate = scanCatalog(entry);
      return candidate ? candidateToIDEConfig(entry, candidate) : null;
    })
    .filter((value): value is IDEConfig => value !== null);
}

export function getDefaultIDEConfigs(): IDEConfig[] {
  return IDE_CATALOG.map(entry => ({
    id: entry.id,
    name: entry.name,
    command: entry.command,
    enabled: false,
    icon: entry.id,
    catalogId: entry.id,
    detected: false,
    isCustom: false,
  }));
}

export function scanSpecificIDE(ideName: string): string | null {
  const entry = getCatalogEntry(ideName);
  if (!entry) {
    return null;
  }

  const candidate = scanCatalog(entry);
  return candidate?.path || null;
}

export function getSupportedIDENames(): string[] {
  return IDE_CATALOG.map(entry => entry.name);
}

export function getOpenInIDEArgs(ide: Pick<IDEConfig, 'catalogId' | 'id'>, targetPath: string): string[] {
  const catalogId = ide.catalogId || ide.id;
  const resolver = (catalogId && LAUNCH_ARGS_BY_ID[catalogId]) || DEFAULT_LAUNCH_ARGS;
  return resolver(targetPath);
}

export function isImageFile(pathToCheck: string): boolean {
  return ['.png', '.jpg', '.jpeg', '.ico', '.icns', '.svg'].includes(extname(pathToCheck).toLowerCase());
}
