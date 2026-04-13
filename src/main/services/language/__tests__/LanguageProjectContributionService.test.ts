import path from 'path';
import { tmpdir } from 'os';
import { promises as fsPromises } from 'fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CodeFileService } from '../../code/CodeFileService';
import { LanguageProjectContributionService } from '../LanguageProjectContributionService';
import { LanguageProjectAdapterRegistry } from '../adapters/LanguageProjectAdapterRegistry';

describe('LanguageProjectContributionService', () => {
  let workspaceRootPath: string;
  let externalRootPath: string;
  let externalFilePath: string;

  beforeEach(async () => {
    workspaceRootPath = await fsPromises.mkdtemp(path.join(tmpdir(), 'language-project-workspace-'));
    externalRootPath = await fsPromises.mkdtemp(path.join(tmpdir(), 'language-project-external-'));
    const packageDirectoryPath = path.join(externalRootPath, 'requests');
    externalFilePath = path.join(packageDirectoryPath, 'api.py');

    await fsPromises.mkdir(packageDirectoryPath, { recursive: true });
    await fsPromises.writeFile(externalFilePath, 'def get(url: str):\n    return url\n', 'utf-8');
  });

  afterEach(async () => {
    await Promise.all([
      fsPromises.rm(workspaceRootPath, { recursive: true, force: true }),
      fsPromises.rm(externalRootPath, { recursive: true, force: true }),
    ]);
  });

  it('lists and reads files from configured external library roots', async () => {
    const service = new LanguageProjectContributionService({
      codeFileService: new CodeFileService(),
      adapterRegistry: new LanguageProjectAdapterRegistry({
        adapters: [
          {
            languageId: 'python',
            getExternalLibrarySection: async () => ({
              id: 'python-external-libraries',
              label: 'External Libraries',
              languageId: 'python',
              roots: [
                {
                  id: 'python-site-packages',
                  label: 'site-packages',
                  path: externalRootPath,
                },
              ],
            }),
          },
        ],
      }),
    });

    const directoryEntries = await service.listDirectory({
      rootPath: workspaceRootPath,
      targetPath: externalRootPath,
    });
    expect(directoryEntries).toEqual([
      expect.objectContaining({
        path: path.join(externalRootPath, 'requests'),
        name: 'requests',
        type: 'directory',
      }),
    ]);

    const readResult = await service.readFile({
      rootPath: workspaceRootPath,
      filePath: externalFilePath,
    });
    expect(readResult.content).toContain('def get');
    expect(readResult.language).toBe('python');
    expect(readResult.readOnly).toBe(true);
    expect(readResult.displayPath).toBe('External Libraries/Python/site-packages/requests/api.py');
  });

  it('rejects files outside the declared external library roots', async () => {
    const service = new LanguageProjectContributionService({
      codeFileService: new CodeFileService(),
      adapterRegistry: new LanguageProjectAdapterRegistry({
        adapters: [],
      }),
    });

    await expect(service.readFile({
      rootPath: workspaceRootPath,
      filePath: externalFilePath,
    })).rejects.toThrow('not part of External Libraries');
  });
});
