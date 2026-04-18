export type CodePaneTrackedRequestStatus = 'running' | 'completed' | 'error' | 'cancelled';

export interface CodePaneTrackedRequest {
  id: string;
  key: string;
  label: string;
  meta?: string;
  status: CodePaneTrackedRequestStatus;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  fromCache?: boolean;
  error?: string;
}

interface CacheEntry<T> {
  value: T;
  storedAt: number;
}

interface RequestHandle {
  id: string;
  key: string;
}

export class CodePaneRuntimeStore {
  private readonly requestVersions = new Map<string, number>();
  private readonly requestMap = new Map<string, CodePaneTrackedRequest>();
  private readonly requestOrder: string[] = [];
  private readonly cache = new Map<string, CacheEntry<unknown>>();
  private readonly listeners = new Set<() => void>();
  private version = 0;

  constructor(
    private readonly options: {
      maxRequests?: number;
    } = {},
  ) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getVersion(): number {
    return this.version;
  }

  markLatest(key: string): number {
    const nextVersion = (this.requestVersions.get(key) ?? 0) + 1;
    this.requestVersions.set(key, nextVersion);
    return nextVersion;
  }

  isLatest(key: string, version: number): boolean {
    return (this.requestVersions.get(key) ?? 0) === version;
  }

  beginRequest(key: string, label: string, meta?: string): RequestHandle {
    const id = `${key}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    this.requestMap.set(id, {
      id,
      key,
      label,
      meta,
      status: 'running',
      startedAt: Date.now(),
    });
    this.requestOrder.unshift(id);
    this.trimRequests();
    this.emit();
    return { id, key };
  }

  finishRequest(
    handle: RequestHandle,
    status: Exclude<CodePaneTrackedRequestStatus, 'running'>,
    options?: {
      error?: string;
      fromCache?: boolean;
    },
  ): void {
    const existingRequest = this.requestMap.get(handle.id);
    if (!existingRequest) {
      return;
    }

    const endedAt = Date.now();
    this.requestMap.set(handle.id, {
      ...existingRequest,
      status,
      endedAt,
      durationMs: endedAt - existingRequest.startedAt,
      fromCache: options?.fromCache,
      error: options?.error,
    });
    this.emit();
  }

  recordRequest(
    key: string,
    label: string,
    options?: {
      meta?: string;
      status?: Exclude<CodePaneTrackedRequestStatus, 'running'>;
      error?: string;
      fromCache?: boolean;
      durationMs?: number;
    },
  ): void {
    const id = `${key}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const endedAt = Date.now();
    const durationMs = Math.max(0, options?.durationMs ?? 0);
    const startedAt = endedAt - durationMs;
    this.requestMap.set(id, {
      id,
      key,
      label,
      meta: options?.meta,
      status: options?.status ?? 'completed',
      startedAt,
      endedAt,
      durationMs,
      fromCache: options?.fromCache,
      error: options?.error,
    });
    this.requestOrder.unshift(id);
    this.trimRequests();
    this.emit();
  }

  getRunningRequests(): CodePaneTrackedRequest[] {
    return this.requestOrder
      .map((id) => this.requestMap.get(id))
      .filter((request): request is CodePaneTrackedRequest => Boolean(request))
      .filter((request) => request.status === 'running');
  }

  getRecentRequests(): CodePaneTrackedRequest[] {
    return this.requestOrder
      .map((id) => this.requestMap.get(id))
      .filter((request): request is CodePaneTrackedRequest => Boolean(request));
  }

  getCache<T>(key: string, ttlMs: number): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    if (Date.now() - entry.storedAt > ttlMs) {
      this.cache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  setCache<T>(key: string, value: T): void {
    this.cache.set(key, {
      value,
      storedAt: Date.now(),
    });
  }

  deleteCache(key: string): void {
    this.cache.delete(key);
  }

  invalidateCachePrefix(prefix: string): void {
    if (!prefix) {
      return;
    }

    for (const key of Array.from(this.cache.keys())) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  clearCache(): void {
    this.cache.clear();
  }

  private trimRequests(): void {
    const maxRequests = Math.max(this.options.maxRequests ?? 60, 10);
    if (this.requestOrder.length <= maxRequests) {
      return;
    }

    const removedRequestIds = this.requestOrder.splice(maxRequests);
    for (const requestId of removedRequestIds) {
      this.requestMap.delete(requestId);
    }
  }

  private emit(): void {
    this.version += 1;
    for (const listener of Array.from(this.listeners)) {
      listener();
    }
  }
}
