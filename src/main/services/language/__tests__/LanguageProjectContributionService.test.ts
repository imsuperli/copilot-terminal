import path from 'path';
import { tmpdir } from 'os';
import { promises as fsPromises } from 'fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CodeFileService } from '../../code/CodeFileService';
import { CodeRunProfileService } from '../../code/CodeRunProfileService';
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
            getProjectContribution: async () => null,
            resolveProjectCommand: async () => null,
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

  it('aggregates project contributions and runs project commands through the run profile service', async () => {
    const sessionEvents: Array<{ rootPath: string; session: { label: string; state: string } }> = [];
    const outputEvents: Array<{ rootPath: string; chunk: string }> = [];
    const runProfileService = new CodeRunProfileService({
      emitSessionChanged: (payload) => {
        sessionEvents.push({
          rootPath: payload.rootPath,
          session: {
            label: payload.session.label,
            state: payload.session.state,
          },
        });
      },
      emitSessionOutput: (payload) => {
        outputEvents.push({
          rootPath: payload.rootPath,
          chunk: payload.chunk,
        });
      },
      now: () => '2026-04-13T00:00:00.000Z',
    });

    const service = new LanguageProjectContributionService({
      codeFileService: new CodeFileService(),
      runProfileService,
      adapterRegistry: new LanguageProjectAdapterRegistry({
        adapters: [
          {
            languageId: 'java',
            getExternalLibrarySection: async () => null,
            getProjectContribution: async () => ({
              id: 'java-project',
              title: 'Java Project',
              languageId: 'java',
              commandGroups: [
                {
                  id: 'java-commands',
                  title: 'Maven',
                  commands: [
                    {
                      id: 'java-command-test',
                      title: 'Test',
                      detail: `${process.execPath} -e console.log("project")`,
                    },
                  ],
                },
              ],
            }),
            resolveProjectCommand: async (_workspaceRoot, commandId) => (
              commandId === 'java-command-test'
                ? {
                    id: 'java-command-test',
                    title: 'Test',
                    detail: 'node -e project',
                    command: process.execPath,
                    args: ['-e', 'console.log("project")'],
                    workingDirectory: workspaceRootPath,
                    languageId: 'java',
                    kind: 'task',
                  }
                : null
            ),
          },
        ],
      }),
    });

    const contributions = await service.getProjectContributions(workspaceRootPath);
    expect(contributions).toEqual([
      expect.objectContaining({
        title: 'Java Project',
        languageId: 'java',
      }),
    ]);

    const session = await service.runProjectCommand(workspaceRootPath, 'java-command-test');
    expect(session.label).toBe('Test');

    await waitForCondition(() => (
      outputEvents.some((event) => event.rootPath === workspaceRootPath && event.chunk.includes('project'))
    ));
    expect(sessionEvents.some((event) => event.rootPath === workspaceRootPath)).toBe(true);
  });
});

async function waitForCondition(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const startedAt = Date.now();

  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Timed out waiting for condition');
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
