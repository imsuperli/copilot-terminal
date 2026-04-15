import path from 'path';
import { tmpdir } from 'os';
import { promises as fsPromises } from 'fs';
import { createWriteStream } from 'fs';
import yazl from 'yazl';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CodeFileService } from '../../code/CodeFileService';
import { CodeRunProfileService } from '../../code/CodeRunProfileService';
import { LanguageProjectContributionService } from '../LanguageProjectContributionService';
import { LanguageProjectAdapterRegistry } from '../adapters/LanguageProjectAdapterRegistry';
import { resolvePythonEnvironment } from '../adapters/PythonProjectAdapter';

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

  it('expands Maven sources jars and reads source entries as external libraries', async () => {
    const mavenArtifactDirectory = path.join(externalRootPath, 'com', 'example', 'demo', '1.0.0');
    const sourceRootDirectoryPath = path.join(workspaceRootPath, 'jar-source');
    const classRootDirectoryPath = path.join(workspaceRootPath, 'jar-class');
    const sourceDirectoryPath = path.join(sourceRootDirectoryPath, 'com', 'example');
    const classDirectoryPath = path.join(classRootDirectoryPath, 'com', 'example');
    const jarPath = path.join(mavenArtifactDirectory, 'demo-1.0.0.jar');
    const sourcesJarPath = path.join(mavenArtifactDirectory, 'demo-1.0.0-sources.jar');

    await fsPromises.mkdir(sourceDirectoryPath, { recursive: true });
    await fsPromises.mkdir(classDirectoryPath, { recursive: true });
    await fsPromises.mkdir(mavenArtifactDirectory, { recursive: true });
    await fsPromises.writeFile(
      path.join(sourceDirectoryPath, 'Demo.java'),
      'package com.example;\npublic class Demo {}\n',
      'utf-8',
    );
    await fsPromises.writeFile(
      path.join(classDirectoryPath, 'Demo.class'),
      Buffer.from([0xca, 0xfe, 0xba, 0xbe]),
    );
    await createZipArchive(sourceRootDirectoryPath, sourcesJarPath);
    await createZipArchive(classRootDirectoryPath, jarPath);

    const service = new LanguageProjectContributionService({
      codeFileService: new CodeFileService(),
      adapterRegistry: new LanguageProjectAdapterRegistry({
        adapters: [
          {
            languageId: 'java',
            getExternalLibrarySection: async () => ({
              id: 'java-external-libraries',
              label: 'External Libraries',
              languageId: 'java',
              roots: [
                {
                  id: 'maven-repository',
                  label: 'Maven Repository',
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

    const artifactEntries = await service.listDirectory({
      rootPath: workspaceRootPath,
      targetPath: mavenArtifactDirectory,
    });
    const jarEntry = artifactEntries.find((entry) => entry.name === 'demo-1.0.0.jar');
    expect(jarEntry).toEqual(expect.objectContaining({
      type: 'directory',
      hasChildren: true,
    }));
    expect(jarEntry?.path).toContain(encodeURIComponent(sourcesJarPath));

    const packageEntries = await service.listDirectory({
      rootPath: workspaceRootPath,
      targetPath: jarEntry?.path,
    });
    const comEntry = packageEntries.find((entry) => entry.name === 'com');
    expect(comEntry).toEqual(expect.objectContaining({
      type: 'directory',
    }));

    const exampleEntries = await service.listDirectory({
      rootPath: workspaceRootPath,
      targetPath: `${comEntry?.path}/example`,
    });
    const sourceEntry = exampleEntries.find((entry) => entry.name === 'Demo.java');
    expect(sourceEntry).toEqual(expect.objectContaining({
      type: 'file',
    }));

    const readResult = await service.readFile({
      rootPath: workspaceRootPath,
      filePath: sourceEntry?.path ?? '',
    });
    expect(readResult.content).toContain('public class Demo');
    expect(readResult.language).toBe('java');
    expect(readResult.readOnly).toBe(true);
    expect(readResult.displayPath).toBe('External Libraries/demo-1.0.0-sources.jar/com/example/Demo.java');
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

  it('builds Spring Boot project insights with request mappings and config files', async () => {
    await fsPromises.mkdir(path.join(workspaceRootPath, 'src', 'main', 'java', 'com', 'example'), { recursive: true });
    await fsPromises.mkdir(path.join(workspaceRootPath, 'src', 'main', 'resources'), { recursive: true });
    await fsPromises.writeFile(
      path.join(workspaceRootPath, 'pom.xml'),
      '<project><artifactId>demo</artifactId><dependencies><dependency>spring-boot-starter-web</dependency></dependencies></project>',
      'utf8',
    );
    await fsPromises.writeFile(
      path.join(workspaceRootPath, 'src', 'main', 'java', 'com', 'example', 'DemoApplication.java'),
      [
        '@SpringBootApplication',
        'public class DemoApplication {}',
        '',
      ].join('\n'),
      'utf8',
    );
    await fsPromises.writeFile(
      path.join(workspaceRootPath, 'src', 'main', 'java', 'com', 'example', 'UserController.java'),
      [
        '@RestController',
        '@RequestMapping("/api/users")',
        'public class UserController {',
        '  @GetMapping("/list")',
        '  public String list() { return "ok"; }',
        '}',
        '',
      ].join('\n'),
      'utf8',
    );
    await fsPromises.writeFile(
      path.join(workspaceRootPath, 'src', 'main', 'resources', 'application.yml'),
      'server:\n  port: 8080\n',
      'utf8',
    );

    const service = new LanguageProjectContributionService({
      codeFileService: new CodeFileService(),
    });

    const contributions = await service.getProjectContributions(workspaceRootPath);
    const javaContribution = contributions.find((item) => item.languageId === 'java');
    expect(javaContribution).toMatchObject({
      title: 'Java Project',
      treeSections: expect.arrayContaining([
        expect.objectContaining({
          title: 'Request Mappings',
          items: expect.arrayContaining([
            expect.objectContaining({
              label: 'GET /api/users/list',
            }),
          ]),
        }),
        expect.objectContaining({
          title: 'Config Files',
          items: expect.arrayContaining([
            expect.objectContaining({
              label: 'src/main/resources/application.yml',
            }),
          ]),
        }),
      ]),
    });
  });

  it('builds Python and Go framework insights from the default adapters', async () => {
    await fsPromises.mkdir(path.join(workspaceRootPath, 'app'), { recursive: true });
    await fsPromises.writeFile(
      path.join(workspaceRootPath, 'app', 'main.py'),
      [
        'from fastapi import FastAPI',
        'app = FastAPI()',
        '@app.get("/health")',
        'def health():',
        '    return {"ok": True}',
        '',
      ].join('\n'),
      'utf8',
    );
    await fsPromises.writeFile(path.join(workspaceRootPath, 'go.mod'), 'module example.com/demo\n', 'utf8');
    await fsPromises.writeFile(
      path.join(workspaceRootPath, 'service_test.go'),
      [
        'package main',
        'import "testing"',
        'func BenchmarkService(b *testing.B) {}',
        'func ExampleService() {}',
        '//go:generate mockgen -source service.go',
        '',
      ].join('\n'),
      'utf8',
    );

    const service = new LanguageProjectContributionService({
      codeFileService: new CodeFileService(),
    });

    const contributions = await service.getProjectContributions(workspaceRootPath);
    const pythonContribution = contributions.find((item) => item.languageId === 'python');
    const goContribution = contributions.find((item) => item.languageId === 'go');

    expect(pythonContribution).toMatchObject({
      treeSections: expect.arrayContaining([
        expect.objectContaining({
          title: 'Routes',
          items: expect.arrayContaining([
            expect.objectContaining({
              label: 'GET /health',
            }),
          ]),
        }),
      ]),
    });

    expect(goContribution).toMatchObject({
      treeSections: expect.arrayContaining([
        expect.objectContaining({
          title: 'Benchmarks',
          items: expect.arrayContaining([
            expect.objectContaining({
              label: 'BenchmarkService',
            }),
          ]),
        }),
        expect.objectContaining({
          title: 'go:generate',
          items: expect.arrayContaining([
            expect.objectContaining({
              label: '//go:generate',
            }),
          ]),
        }),
      ]),
    });
  });

  it('surfaces environment control commands and applies python interpreter overrides without a run session', async () => {
    const dotVenvInterpreterPath = path.join(workspaceRootPath, '.venv', 'bin', 'python');
    const venvInterpreterPath = path.join(workspaceRootPath, 'venv', 'bin', 'python');

    await fsPromises.mkdir(path.dirname(dotVenvInterpreterPath), { recursive: true });
    await fsPromises.mkdir(path.dirname(venvInterpreterPath), { recursive: true });
    await fsPromises.writeFile(dotVenvInterpreterPath, '#!/usr/bin/env python\n', 'utf8');
    await fsPromises.writeFile(venvInterpreterPath, '#!/usr/bin/env python\n', 'utf8');
    await fsPromises.writeFile(path.join(workspaceRootPath, 'requirements.txt'), 'fastapi\n', 'utf8');
    await fsPromises.writeFile(path.join(workspaceRootPath, 'pom.xml'), '<project></project>\n', 'utf8');
    await fsPromises.writeFile(path.join(workspaceRootPath, 'go.mod'), 'module example.com/demo\n', 'utf8');

    const service = new LanguageProjectContributionService({
      codeFileService: new CodeFileService(),
    });

    const contributions = await service.getProjectContributions(workspaceRootPath);
    const pythonContribution = contributions.find((item) => item.languageId === 'python');
    const javaContribution = contributions.find((item) => item.languageId === 'java');
    const goContribution = contributions.find((item) => item.languageId === 'go');

    expect(pythonContribution).toMatchObject({
      commandGroups: expect.arrayContaining([
        expect.objectContaining({
          title: 'Environment',
          commands: expect.arrayContaining([
            expect.objectContaining({
              id: 'python-project-refresh-model',
              kind: 'refresh',
            }),
            expect.objectContaining({
              id: 'python-project-interpreter:auto',
              kind: 'configure',
            }),
          ]),
        }),
      ]),
    });
    expect(javaContribution).toMatchObject({
      commandGroups: expect.arrayContaining([
        expect.objectContaining({
          title: 'Project Sync',
          commands: expect.arrayContaining([
            expect.objectContaining({
              kind: 'refresh',
            }),
          ]),
        }),
      ]),
    });
    expect(goContribution).toMatchObject({
      commandGroups: expect.arrayContaining([
        expect.objectContaining({
          title: 'Workspace Sync',
          commands: expect.arrayContaining([
            expect.objectContaining({
              kind: 'refresh',
            }),
          ]),
        }),
      ]),
    });

    const selectedInterpreterCommand = pythonContribution?.commandGroups
      ?.flatMap((group) => group.commands)
      .find((command) => command.id.startsWith('python-project-interpreter:') && command.detail?.includes('/venv/bin/python'));
    expect(selectedInterpreterCommand).toBeDefined();

    expect(await service.runProjectCommand(workspaceRootPath, 'python-project-refresh-model')).toBeNull();
    expect(await service.runProjectCommand(workspaceRootPath, selectedInterpreterCommand!.id)).toBeNull();

    const resolvedEnvironment = await resolvePythonEnvironment(workspaceRootPath);
    expect(resolvedEnvironment.interpreterPath).toBe(venvInterpreterPath);
  });

  it('builds diagnostics and repair actions for degraded project environments', async () => {
    await fsPromises.writeFile(path.join(workspaceRootPath, 'requirements.txt'), 'requests\n', 'utf8');
    await fsPromises.writeFile(path.join(workspaceRootPath, 'pom.xml'), '<project></project>\n', 'utf8');
    await fsPromises.writeFile(path.join(workspaceRootPath, 'main.go'), 'package main\nfunc main() {}\n', 'utf8');

    const service = new LanguageProjectContributionService({
      codeFileService: new CodeFileService(),
    });

    const contributions = await service.getProjectContributions(workspaceRootPath);
    const pythonContribution = contributions.find((item) => item.languageId === 'python');
    const javaContribution = contributions.find((item) => item.languageId === 'java');
    const goContribution = contributions.find((item) => item.languageId === 'go');

    expect(pythonContribution).toMatchObject({
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          severity: 'warning',
          message: 'No Python virtual environment detected',
          commandId: 'python-project-create-venv',
        }),
      ]),
    });

    expect(javaContribution).toMatchObject({
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          severity: 'warning',
          message: 'Maven wrapper not detected',
        }),
        expect.objectContaining({
          severity: 'warning',
          message: 'Main source directory is missing',
          commandId: 'java-maven-clean-verify',
        }),
      ]),
    });

    expect(goContribution).toMatchObject({
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          message: 'go.mod is not detected',
          commandId: 'go-project-mod-init',
        }),
      ]),
    });
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

async function createZipArchive(sourceDirectoryPath: string, targetArchivePath: string): Promise<void> {
  const zipFile = new yazl.ZipFile();
  const filePaths = await collectFilePaths(sourceDirectoryPath);
  for (const filePath of filePaths) {
    zipFile.addFile(filePath, path.relative(sourceDirectoryPath, filePath).split(path.sep).join('/'));
  }

  await new Promise<void>((resolve, reject) => {
    zipFile.outputStream
      .pipe(createWriteStream(targetArchivePath))
      .on('close', resolve)
      .on('error', reject);
    zipFile.on('error', reject);
    zipFile.end();
  });
}

async function collectFilePaths(directoryPath: string): Promise<string[]> {
  const entries = await fsPromises.readdir(directoryPath, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...await collectFilePaths(entryPath));
    } else if (entry.isFile()) {
      results.push(entryPath);
    }
  }

  return results;
}
