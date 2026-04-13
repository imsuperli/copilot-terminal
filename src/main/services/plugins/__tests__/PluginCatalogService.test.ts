import { afterEach, describe, expect, it, vi } from 'vitest';
import { PluginCatalogService } from '../PluginCatalogService';

describe('PluginCatalogService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws when the remote marketplace catalog request fails', async () => {
    const service = new PluginCatalogService({
      catalogUrl: 'https://plugin.notta.top/catalog.json',
      fetchImpl: vi.fn(async () => {
        throw new Error('network down');
      }) as typeof fetch,
    });

    await expect(service.list({ refresh: true })).rejects.toThrow('network down');
  });

  it('resolves relative marketplace asset urls against the remote catalog origin', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      async json() {
        return {
          schemaVersion: 1,
          generatedAt: '2026-04-12T00:00:00.000Z',
          plugins: [
            {
              id: 'official.java-jdtls',
              name: 'Java (JDTLS)',
              publisher: 'Copilot Terminal',
              latestVersion: '0.1.0',
              platforms: [
                {
                  os: process.platform,
                  arch: process.arch,
                  downloadUrl: 'packages/official.java-jdtls-0.1.0.zip',
                  sha256: 'def456',
                },
              ],
            },
          ],
        };
      },
    })) as typeof fetch;

    const service = new PluginCatalogService({
      catalogUrl: 'https://example.com/plugin-marketplace/catalog.json',
      fetchImpl,
    });

    const [entry] = await service.list({ refresh: true });
    expect(entry.platforms[0].downloadUrl).toBe(
      'https://example.com/plugin-marketplace/packages/official.java-jdtls-0.1.0.zip',
    );
  });

  it('reuses cached catalog data until an explicit refresh is requested', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      async json() {
        return {
          schemaVersion: 1,
          generatedAt: '2026-04-12T00:00:00.000Z',
          plugins: [
            {
              id: 'official.java-jdtls',
              name: 'Java (JDTLS)',
              publisher: 'Copilot Terminal',
              latestVersion: '0.1.0',
              platforms: [
                {
                  os: process.platform,
                  arch: process.arch,
                  downloadUrl: 'packages/official.java-jdtls-0.1.0.zip',
                  sha256: 'def456',
                },
              ],
            },
          ],
        };
      },
    })) as typeof fetch;

    const service = new PluginCatalogService({
      catalogUrl: 'https://example.com/plugin-marketplace/catalog.json',
      fetchImpl,
    });

    await service.list({ refresh: true });
    await service.list();

    expect(fetchImpl).toHaveBeenCalledTimes(1);

    await service.list({ refresh: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
