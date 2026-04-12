import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PluginCatalogService } from '../PluginCatalogService';

describe('PluginCatalogService', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'copilot-terminal-plugin-catalog-'));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('resolves relative marketplace asset urls from a local fallback catalog', async () => {
    const fallbackCatalogPath = path.join(tempDir, 'plugin-marketplace', 'catalog.json');
    await fs.ensureDir(path.dirname(fallbackCatalogPath));
    await fs.writeJson(fallbackCatalogPath, {
      schemaVersion: 1,
      generatedAt: '2026-04-12T00:00:00.000Z',
      plugins: [
        {
          id: 'official.python-pyright',
          name: 'Python (Pyright)',
          publisher: 'Copilot Terminal',
          latestVersion: '0.1.0',
          platforms: [
            {
              os: process.platform,
              arch: process.arch,
              downloadUrl: 'packages/official.python-pyright-0.1.0.zip',
              sha256: 'abc123',
            },
          ],
        },
      ],
    });

    const service = new PluginCatalogService({
      cachePath: path.join(tempDir, 'cache', 'catalog.json'),
      catalogUrl: '',
      fallbackCatalogPath,
    });

    const [entry] = await service.list();
    expect(entry.platforms[0].downloadUrl).toBe(
      pathToFileURL(path.join(tempDir, 'plugin-marketplace', 'packages', 'official.python-pyright-0.1.0.zip')).href,
    );
  });

  it('resolves relative marketplace asset urls against the remote catalog origin and caches absolute urls', async () => {
    const cachePath = path.join(tempDir, 'cache', 'catalog.json');
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
      cachePath,
      catalogUrl: 'https://example.com/plugin-marketplace/catalog.json',
      fetchImpl,
    });

    const [entry] = await service.list({ refresh: true });
    expect(entry.platforms[0].downloadUrl).toBe(
      'https://example.com/plugin-marketplace/packages/official.java-jdtls-0.1.0.zip',
    );

    const cachedCatalog = await fs.readJson(cachePath);
    expect(cachedCatalog.plugins[0].platforms[0].downloadUrl).toBe(
      'https://example.com/plugin-marketplace/packages/official.java-jdtls-0.1.0.zip',
    );
  });
});
