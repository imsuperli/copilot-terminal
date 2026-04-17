import type {
  CodePaneTreeEntry,
  CodePaneExternalLibrarySection,
  CodePaneGitGraphCommit,
  CodePaneGitRepositorySummary,
  CodePaneGitStatusEntry,
} from '../../shared/types/electron-api';

interface CacheEntry<T> {
  value: T;
  storedAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const inFlightRequests = new Map<string, Promise<unknown>>();

function normalizePath(pathValue: string): string {
  return pathValue.replace(/\\/g, '/').replace(/\/+$/, '');
}

function createScopedKey(rootPath: string, suffix: string): string {
  return `code-pane:${normalizePath(rootPath)}:${suffix}`;
}

export const CODE_PANE_EXTERNAL_LIBRARY_CACHE_TTL_MS = 5 * 60_000;
export const CODE_PANE_GIT_STATUS_CACHE_TTL_MS = 5_000;
export const CODE_PANE_GIT_SUMMARY_CACHE_TTL_MS = 5_000;
export const CODE_PANE_GIT_GRAPH_CACHE_TTL_MS = 15_000;
export const CODE_PANE_DIRECTORY_CACHE_TTL_MS = 60_000;

export function getExternalLibraryCache(rootPath: string): CodePaneExternalLibrarySection[] | null {
  return getCacheValue<CodePaneExternalLibrarySection[]>(
    createScopedKey(rootPath, 'external-libraries'),
    CODE_PANE_EXTERNAL_LIBRARY_CACHE_TTL_MS,
  );
}

export function setExternalLibraryCache(rootPath: string, value: CodePaneExternalLibrarySection[]): void {
  setCacheValue(createScopedKey(rootPath, 'external-libraries'), value);
}

export function getGitStatusCache(rootPath: string): CodePaneGitStatusEntry[] | null {
  return getCacheValue<CodePaneGitStatusEntry[]>(
    createScopedKey(rootPath, 'git-status'),
    CODE_PANE_GIT_STATUS_CACHE_TTL_MS,
  );
}

export function setGitStatusCache(rootPath: string, value: CodePaneGitStatusEntry[]): void {
  setCacheValue(createScopedKey(rootPath, 'git-status'), value);
}

export function getGitSummaryCache(rootPath: string): CodePaneGitRepositorySummary | null {
  return getCacheValue<CodePaneGitRepositorySummary>(
    createScopedKey(rootPath, 'git-summary'),
    CODE_PANE_GIT_SUMMARY_CACHE_TTL_MS,
  );
}

export function setGitSummaryCache(rootPath: string, value: CodePaneGitRepositorySummary | null): void {
  setCacheValue(createScopedKey(rootPath, 'git-summary'), value);
}

export function getGitGraphCache(rootPath: string): CodePaneGitGraphCommit[] | null {
  return getCacheValue<CodePaneGitGraphCommit[]>(
    createScopedKey(rootPath, 'git-graph'),
    CODE_PANE_GIT_GRAPH_CACHE_TTL_MS,
  );
}

export function setGitGraphCache(rootPath: string, value: CodePaneGitGraphCommit[]): void {
  setCacheValue(createScopedKey(rootPath, 'git-graph'), value);
}

export function getDirectoryCache(rootPath: string, directoryPath: string): CodePaneTreeEntry[] | null {
  return getCacheValue<CodePaneTreeEntry[]>(
    createScopedKey(rootPath, `directory:${normalizePath(directoryPath)}`),
    CODE_PANE_DIRECTORY_CACHE_TTL_MS,
  );
}

export function setDirectoryCache(rootPath: string, directoryPath: string, value: CodePaneTreeEntry[]): void {
  setCacheValue(createScopedKey(rootPath, `directory:${normalizePath(directoryPath)}`), value);
}

export function invalidateDirectoryCache(rootPath: string, directoryPath?: string): void {
  const normalizedRootPath = normalizePath(rootPath);
  const directoryPrefix = directoryPath
    ? createScopedKey(rootPath, `directory:${normalizePath(directoryPath)}`)
    : `code-pane:${normalizedRootPath}:directory:`;

  for (const key of Array.from(cache.keys())) {
    if (directoryPath) {
      if (key === directoryPrefix || key.startsWith(`${directoryPrefix}/`)) {
        cache.delete(key);
      }
      continue;
    }

    if (key.startsWith(directoryPrefix)) {
      cache.delete(key);
    }
  }
}

export async function dedupeProjectRequest<T>(
  rootPath: string,
  requestKey: string,
  factory: () => Promise<T>,
): Promise<T> {
  const scopedKey = createScopedKey(rootPath, requestKey);
  const existingRequest = inFlightRequests.get(scopedKey);
  if (existingRequest) {
    return await existingRequest as T;
  }

  const nextRequest = factory().finally(() => {
    if (inFlightRequests.get(scopedKey) === nextRequest) {
      inFlightRequests.delete(scopedKey);
    }
  });

  inFlightRequests.set(scopedKey, nextRequest);
  return await nextRequest;
}

export function invalidateProjectCache(
  rootPath: string,
  scope: 'all' | 'git' | 'git-status' | 'git-graph' | 'external-libraries' | 'directories' = 'all',
): void {
  const normalizedRootPath = normalizePath(rootPath);
  const projectPrefix = `code-pane:${normalizedRootPath}:`;

  for (const key of Array.from(cache.keys())) {
    if (!key.startsWith(projectPrefix)) {
      continue;
    }

    if (scope === 'all') {
      cache.delete(key);
      continue;
    }

    if (scope === 'git' && key.includes(':git-')) {
      cache.delete(key);
      continue;
    }

    if (scope === 'git-status' && (key.endsWith(':git-status') || key.endsWith(':git-summary'))) {
      cache.delete(key);
      continue;
    }

    if (scope === 'git-graph' && key.endsWith(':git-graph')) {
      cache.delete(key);
      continue;
    }

    if (scope === 'external-libraries' && key.endsWith(':external-libraries')) {
      cache.delete(key);
      continue;
    }

    if (scope === 'directories' && key.includes(':directory:')) {
      cache.delete(key);
    }
  }
}

export function resetCodePaneProjectCacheForTests(): void {
  cache.clear();
  inFlightRequests.clear();
}

function getCacheValue<T>(key: string, ttlMs: number): T | null {
  const entry = cache.get(key);
  if (!entry) {
    return null;
  }

  if (Date.now() - entry.storedAt > ttlMs) {
    cache.delete(key);
    return null;
  }

  return entry.value as T;
}

function setCacheValue<T>(key: string, value: T): void {
  cache.set(key, {
    value,
    storedAt: Date.now(),
  });
}
