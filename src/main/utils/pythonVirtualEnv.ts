import fs from 'fs';
import path from 'path';

const PYTHON_VENV_SCAN_CACHE_TTL_MS = 10_000;
const PYTHON_VENV_DETECTION_CACHE_TTL_MS = 10_000;
const PYTHON_VENV_SCAN_MAX_DEPTH = 4;
const PYTHON_VENV_SCAN_MAX_DIRECTORIES = 400;
const PYTHON_VENV_SCAN_MAX_MATCHES = 16;

const PYTHON_VENV_SCAN_IGNORED_DIRECTORY_NAMES = new Set([
  '.git',
  '.hg',
  '.svn',
  'node_modules',
  'dist',
  'build',
  'target',
  'out',
  '.gradle',
  '.idea',
  '.mvn',
  '.settings',
  '.vscode',
  '.cache',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  '.tox',
  '.nox',
  '.venv',
  'venv',
  '__pycache__',
  'site-packages',
  'dist-packages',
  '.turbo',
  '.parcel-cache',
  '.sass-cache',
  '.next',
]);

const pythonVirtualEnvDirectoryCache = new Map<string, {
  directories: string[];
  createdAt: number;
}>();
const pythonVirtualEnvDetectionCache = new Map<string, {
  result: boolean;
  createdAt: number;
}>();

export function isLikelyPythonVirtualEnvDirectory(directoryPath: string): boolean {
  const normalizedDirectoryPath = path.resolve(directoryPath);
  const now = Date.now();
  const cachedDetection = pythonVirtualEnvDetectionCache.get(normalizedDirectoryPath);
  if (cachedDetection && now - cachedDetection.createdAt < PYTHON_VENV_DETECTION_CACHE_TTL_MS) {
    return cachedDetection.result;
  }

  const result = detectPythonVirtualEnvDirectory(normalizedDirectoryPath);
  pythonVirtualEnvDetectionCache.set(normalizedDirectoryPath, {
    result,
    createdAt: now,
  });
  return result;
}

function detectPythonVirtualEnvDirectory(directoryPath: string): boolean {
  const normalizedDirectoryPath = path.resolve(directoryPath);
  try {
    if (!fs.existsSync(normalizedDirectoryPath) || !fs.statSync(normalizedDirectoryPath).isDirectory()) {
      return false;
    }
  } catch {
    return false;
  }

  const directMarkers = [
    path.join(normalizedDirectoryPath, 'pyvenv.cfg'),
    path.join(normalizedDirectoryPath, 'bin', 'python'),
    path.join(normalizedDirectoryPath, 'bin', 'python3'),
    path.join(normalizedDirectoryPath, 'Scripts', 'python.exe'),
    path.join(normalizedDirectoryPath, 'Lib', 'site-packages'),
  ];

  if (directMarkers.some((candidatePath) => fs.existsSync(candidatePath))) {
    return true;
  }

  try {
    const libEntries = fs.readdirSync(path.join(normalizedDirectoryPath, 'lib'), { withFileTypes: true });
    return libEntries.some((entry) => (
      entry.isDirectory()
      && /^python\d+(\.\d+)?$/i.test(entry.name)
      && (
        fs.existsSync(path.join(normalizedDirectoryPath, 'lib', entry.name, 'site-packages'))
        || fs.existsSync(path.join(normalizedDirectoryPath, 'lib', entry.name, 'dist-packages'))
      )
    ));
  } catch {
    return false;
  }
}

export function getPythonVirtualEnvIgnoreGlobs(workspaceRoot: string): {
  exclude: string[];
  ignore: string[];
} {
  const normalizedWorkspaceRoot = path.resolve(workspaceRoot);
  const directories = findPythonVirtualEnvDirectories(normalizedWorkspaceRoot);
  const exclude: string[] = [];
  const ignore: string[] = [];

  for (const directoryPath of directories) {
    const relativePath = path.relative(normalizedWorkspaceRoot, directoryPath).split(path.sep).join('/');
    if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      continue;
    }

    exclude.push(relativePath);
    ignore.push(`${relativePath}/**`);
  }

  return { exclude, ignore };
}

function findPythonVirtualEnvDirectories(workspaceRoot: string): string[] {
  const normalizedWorkspaceRoot = path.resolve(workspaceRoot);
  const now = Date.now();
  const cachedEntry = pythonVirtualEnvDirectoryCache.get(normalizedWorkspaceRoot);
  if (cachedEntry && now - cachedEntry.createdAt < PYTHON_VENV_SCAN_CACHE_TTL_MS) {
    return cachedEntry.directories;
  }

  const directories = scanPythonVirtualEnvDirectories(normalizedWorkspaceRoot);
  pythonVirtualEnvDirectoryCache.set(normalizedWorkspaceRoot, {
    directories,
    createdAt: now,
  });
  return directories;
}

function scanPythonVirtualEnvDirectories(workspaceRoot: string): string[] {
  const directories: string[] = [];
  const stack: Array<{ directoryPath: string; depth: number }> = [{ directoryPath: workspaceRoot, depth: 0 }];
  let scannedDirectoryCount = 0;

  while (stack.length > 0 && scannedDirectoryCount < PYTHON_VENV_SCAN_MAX_DIRECTORIES && directories.length < PYTHON_VENV_SCAN_MAX_MATCHES) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    scannedDirectoryCount += 1;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current.directoryPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        continue;
      }

      const entryPath = path.join(current.directoryPath, entry.name);
      if (entry.name === 'env' && isLikelyPythonVirtualEnvDirectory(entryPath)) {
        directories.push(entryPath);
        if (directories.length >= PYTHON_VENV_SCAN_MAX_MATCHES) {
          break;
        }
        continue;
      }

      if (current.depth >= PYTHON_VENV_SCAN_MAX_DEPTH) {
        continue;
      }

      if (PYTHON_VENV_SCAN_IGNORED_DIRECTORY_NAMES.has(entry.name)) {
        continue;
      }

      if (entry.name.startsWith('.') && entry.name !== 'env') {
        continue;
      }

      stack.push({
        directoryPath: entryPath,
        depth: current.depth + 1,
      });
    }
  }

  return directories;
}
