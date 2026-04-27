import path from 'path';
import { isLikelyPythonVirtualEnvDirectory } from '../../utils/pythonVirtualEnv';

export const CODE_PANE_IGNORED_DIRECTORY_NAMES = new Set([
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

export const CODE_PANE_INDEX_SCHEMA_VERSION = 1;

export const CODE_PANE_INDEX_IGNORE_SIGNATURE = Array.from(CODE_PANE_IGNORED_DIRECTORY_NAMES)
  .concat('dynamic-python-env')
  .sort()
  .join('|');

export function shouldIgnoreCodePaneDirectory(directoryName: string, directoryPath?: string): boolean {
  if (CODE_PANE_IGNORED_DIRECTORY_NAMES.has(directoryName)) {
    return true;
  }

  if (directoryName !== 'env' || !directoryPath) {
    return false;
  }

  return isLikelyPythonVirtualEnvDirectory(path.resolve(directoryPath));
}

export function isIgnoredCodePanePath(projectRootPath: string, targetPath: string): boolean {
  const normalizedProjectRootPath = path.resolve(projectRootPath);
  const normalizedTargetPath = path.resolve(targetPath);
  const relativePath = path.relative(normalizedProjectRootPath, normalizedTargetPath);
  if (!relativePath || relativePath.startsWith('..')) {
    return false;
  }

  let currentPath = normalizedProjectRootPath;
  for (const segment of relativePath.split(path.sep)) {
    currentPath = path.join(currentPath, segment);
    if (shouldIgnoreCodePaneDirectory(segment, currentPath)) {
      return true;
    }
  }

  return false;
}
