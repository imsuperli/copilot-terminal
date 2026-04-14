import path from 'path';
import type {
  CodePaneExternalLibrarySection,
  CodePaneProjectContribution,
  CodePaneProjectTreeItem,
} from '../../../../shared/types/electron-api';
import {
  createExternalLibraryRoot,
  createExternalLibrarySection,
  createProjectContribution,
  directoryExists,
  fileExists,
  findWorkspaceFiles,
  formatWorkspaceRelativePath,
  hasProjectIndicators,
  hasTopLevelExtension,
  listDirectoryNames,
  readTextFile,
  type LanguageProjectAdapter,
  type LanguageProjectCommandDefinition,
  type LanguageProjectCommandGroupDefinition,
} from './LanguageProjectAdapter';

const PYTHON_PROJECT_INDICATORS = [
  'pyproject.toml',
  'requirements.txt',
  'setup.py',
  'setup.cfg',
  'Pipfile',
  'manage.py',
  '.venv',
  'venv',
  'env',
];

export class PythonProjectAdapter implements LanguageProjectAdapter {
  readonly languageId = 'python';

  async getExternalLibrarySection(workspaceRoot: string): Promise<CodePaneExternalLibrarySection | null> {
    const looksLikePythonProject = await isPythonWorkspace(workspaceRoot);
    if (!looksLikePythonProject) {
      return null;
    }

    const roots = [];
    const environmentRoots = [
      path.join(workspaceRoot, '.venv'),
      path.join(workspaceRoot, 'venv'),
      path.join(workspaceRoot, 'env'),
      process.env.VIRTUAL_ENV,
      process.env.CONDA_PREFIX,
    ].filter((value): value is string => Boolean(value));

    for (const environmentRoot of environmentRoots) {
      const normalizedEnvironmentRoot = path.resolve(environmentRoot);
      if (!await directoryExists(normalizedEnvironmentRoot)) {
        continue;
      }

      const windowsSitePackagesPath = path.join(normalizedEnvironmentRoot, 'Lib', 'site-packages');
      if (await directoryExists(windowsSitePackagesPath)) {
        roots.push(createExternalLibraryRoot(
          `python-site-packages-${roots.length + 1}`,
          'site-packages',
          windowsSitePackagesPath,
        ));
        roots.push(createExternalLibraryRoot(
          `python-stdlib-${roots.length + 1}`,
          'Standard Library',
          path.join(normalizedEnvironmentRoot, 'Lib'),
        ));
        continue;
      }

      const pythonLibRoot = path.join(normalizedEnvironmentRoot, 'lib');
      const pythonVersionDirectories = (await listDirectoryNames(pythonLibRoot))
        .filter((entryName) => /^python\d+(\.\d+)?$/i.test(entryName));

      for (const pythonVersionDirectory of pythonVersionDirectories) {
        const stdlibPath = path.join(pythonLibRoot, pythonVersionDirectory);
        const sitePackagesPath = path.join(stdlibPath, 'site-packages');
        if (await directoryExists(sitePackagesPath)) {
          roots.push(createExternalLibraryRoot(
            `python-site-packages-${roots.length + 1}`,
            'site-packages',
            sitePackagesPath,
          ));
          roots.push(createExternalLibraryRoot(
            `python-stdlib-${roots.length + 1}`,
            'Standard Library',
            stdlibPath,
          ));
        }
      }
    }

    return createExternalLibrarySection('python-external-libraries', this.languageId, roots);
  }

  async getProjectContribution(workspaceRoot: string): Promise<CodePaneProjectContribution | null> {
    const projectInfo = await detectPythonProject(workspaceRoot);
    if (!projectInfo) {
      return null;
    }

    const frameworkStatusItems = projectInfo.frameworkInsights ? [
      {
        id: 'python-framework-name',
        label: `Framework: ${projectInfo.frameworkInsights.frameworkLabel}`,
        tone: 'info' as const,
      },
      {
        id: 'python-framework-routes',
        label: `Routes: ${projectInfo.frameworkInsights.routes.length}`,
        tone: 'info' as const,
      },
    ] : [];

    return createProjectContribution('python-project', this.languageId, 'Python Project', {
      statusItems: [
        {
          id: 'python-environment',
          label: projectInfo.environmentLabel,
          tone: projectInfo.hasEnvironment ? 'info' : 'warning',
        },
        {
          id: 'python-tests',
          label: projectInfo.hasTests ? 'Tests detected' : 'No tests detected',
          tone: projectInfo.hasTests ? 'info' : 'warning',
        },
        {
          id: 'python-entrypoint',
          label: projectInfo.entrypointLabel,
          tone: 'info',
        },
        ...frameworkStatusItems,
      ],
      detailCards: [
        {
          id: 'python-project-details',
          title: 'Environment',
          lines: [
            `Root: ${workspaceRoot}`,
            `Interpreter: ${projectInfo.interpreterPath ?? 'python'}`,
            `Project file: ${projectInfo.projectFilePath ?? 'Not detected'}`,
          ],
        },
        ...(projectInfo.frameworkInsights ? [
          {
            id: 'python-framework-details',
            title: 'Framework',
            lines: [
              `Type: ${projectInfo.frameworkInsights.frameworkLabel}`,
              `Entrypoints: ${projectInfo.frameworkInsights.entrypoints.length}`,
              `Routes: ${projectInfo.frameworkInsights.routes.length}`,
            ],
          },
        ] : []),
      ],
      treeSections: projectInfo.frameworkInsights ? buildPythonTreeSections(projectInfo.frameworkInsights) : undefined,
      commandGroups: this.getCommandGroups(workspaceRoot, projectInfo),
    });
  }

  async resolveProjectCommand(workspaceRoot: string, commandId: string): Promise<LanguageProjectCommandDefinition | null> {
    const projectInfo = await detectPythonProject(workspaceRoot);
    if (!projectInfo) {
      return null;
    }

    for (const group of this.getCommandGroups(workspaceRoot, projectInfo)) {
      for (const command of group.commands) {
        if (command.id === commandId) {
          return command;
        }
      }
    }

    return null;
  }

  private getCommandGroups(
    workspaceRoot: string,
    projectInfo: PythonProjectInfo,
  ): LanguageProjectCommandGroupDefinition[] {
    const pythonCommand = projectInfo.interpreterPath ?? resolveExecutable('python');
    const groups: LanguageProjectCommandGroupDefinition[] = [];
    const pythonCommands: LanguageProjectCommandDefinition[] = [
      createPythonCommand('python-project-pytest', 'Pytest', `${pythonCommand} -m pytest`, pythonCommand, ['-m', 'pytest'], workspaceRoot),
      createPythonCommand('python-project-pip-list', 'Pip List', `${pythonCommand} -m pip list`, pythonCommand, ['-m', 'pip', 'list'], workspaceRoot),
      createPythonCommand('python-project-pip-version', 'Pip Version', `${pythonCommand} -m pip --version`, pythonCommand, ['-m', 'pip', '--version'], workspaceRoot),
    ];

    if (projectInfo.managePyPath) {
      groups.push({
        id: 'python-project-django',
        title: 'Django',
        commands: [
          createPythonCommand(
            'python-project-runserver',
            'Run Server',
            `${pythonCommand} manage.py runserver`,
            pythonCommand,
            ['manage.py', 'runserver'],
            workspaceRoot,
            'application',
          ),
          createPythonCommand(
            'python-project-migrate',
            'Migrate',
            `${pythonCommand} manage.py migrate`,
            pythonCommand,
            ['manage.py', 'migrate'],
            workspaceRoot,
          ),
          createPythonCommand(
            'python-project-shell',
            'Shell',
            `${pythonCommand} manage.py shell`,
            pythonCommand,
            ['manage.py', 'shell'],
            workspaceRoot,
          ),
        ],
      });
    }

    if (projectInfo.frameworkInsights?.fastApiEntrypoint) {
      groups.push({
        id: 'python-project-fastapi',
        title: 'FastAPI',
        commands: [
          createPythonCommand(
            'python-project-fastapi-run',
            'Uvicorn Run',
            `${pythonCommand} -m uvicorn ${projectInfo.frameworkInsights.fastApiEntrypoint.importTarget} --reload`,
            pythonCommand,
            ['-m', 'uvicorn', projectInfo.frameworkInsights.fastApiEntrypoint.importTarget, '--reload'],
            workspaceRoot,
            'application',
          ),
        ],
      });
    }

    groups.push({
      id: 'python-project-commands',
      title: 'Python',
      commands: pythonCommands,
    });

    return groups;
  }
}

interface PythonProjectInfo {
  hasEnvironment: boolean;
  environmentLabel: string;
  interpreterPath: string | null;
  projectFilePath: string | null;
  hasTests: boolean;
  managePyPath: string | null;
  entrypointLabel: string;
  frameworkInsights?: PythonFrameworkInsights;
}

interface PythonProjectEntry {
  id: string;
  label: string;
  description: string;
  filePath: string;
  lineNumber: number;
}

interface PythonFastApiEntrypoint {
  filePath: string;
  importTarget: string;
}

interface PythonFrameworkInsights {
  frameworkLabel: 'Django' | 'FastAPI' | 'Python';
  entrypoints: PythonProjectEntry[];
  routes: PythonProjectEntry[];
  fastApiEntrypoint?: PythonFastApiEntrypoint;
}

async function detectPythonProject(workspaceRoot: string): Promise<PythonProjectInfo | null> {
  const looksLikePythonProject = await isPythonWorkspace(workspaceRoot);
  if (!looksLikePythonProject) {
    return null;
  }

  const environmentInfo = await resolvePythonEnvironment(workspaceRoot);
  const projectFilePath = await detectFirstExistingFile(workspaceRoot, [
    'pyproject.toml',
    'requirements.txt',
    'Pipfile',
    'setup.py',
    'setup.cfg',
  ]);
  const managePyPath = path.join(workspaceRoot, 'manage.py');
  const hasManagePy = await fileExists(managePyPath);
  const frameworkInsights = await collectPythonFrameworkInsights(workspaceRoot, hasManagePy ? managePyPath : null);
  const primaryEntrypoint = frameworkInsights.entrypoints[0]?.label ?? 'standard Python module';

  return {
    hasEnvironment: Boolean(environmentInfo.environmentRoot),
    environmentLabel: environmentInfo.environmentRoot
      ? `Environment: ${path.basename(environmentInfo.environmentRoot)}`
      : 'Environment: Not detected',
    interpreterPath: environmentInfo.interpreterPath,
    projectFilePath,
    hasTests: await directoryExists(path.join(workspaceRoot, 'tests')),
    managePyPath: hasManagePy ? managePyPath : null,
    entrypointLabel: `Entrypoint: ${primaryEntrypoint}`,
    ...(frameworkInsights ? { frameworkInsights } : {}),
  };
}

async function collectPythonFrameworkInsights(
  workspaceRoot: string,
  managePyPath: string | null,
): Promise<PythonFrameworkInsights> {
  const pythonFiles = await findWorkspaceFiles(workspaceRoot, ['**/*.py']);
  const routes: PythonProjectEntry[] = [];
  const entrypoints: PythonProjectEntry[] = [];
  let fastApiEntrypoint: PythonFastApiEntrypoint | undefined;

  if (managePyPath) {
    entrypoints.push({
      id: `python-entry:${managePyPath}`,
      label: 'manage.py',
      description: formatWorkspaceRelativePath(workspaceRoot, managePyPath),
      filePath: managePyPath,
      lineNumber: 1,
    });

    for (const fileName of ['app/asgi.py', 'app/wsgi.py', 'config/asgi.py', 'config/wsgi.py', 'project/asgi.py', 'project/wsgi.py']) {
      const candidatePath = path.join(workspaceRoot, fileName);
      if (await fileExists(candidatePath)) {
        entrypoints.push({
          id: `python-entry:${candidatePath}`,
          label: path.basename(candidatePath),
          description: formatWorkspaceRelativePath(workspaceRoot, candidatePath),
          filePath: candidatePath,
          lineNumber: 1,
        });
      }
    }

    return {
      frameworkLabel: 'Django',
      entrypoints,
      routes,
    };
  }

  for (const filePath of pythonFiles) {
    const content = await readTextFile(filePath);
    if (!content) {
      continue;
    }

    const parsed = parseFastApiFile(workspaceRoot, filePath, content);
    routes.push(...parsed.routes);
    if (parsed.entrypoint) {
      entrypoints.push(parsed.entrypoint);
      fastApiEntrypoint = {
        filePath,
        importTarget: parsed.importTarget,
      };
    }
  }

  if (entrypoints.length > 0 || routes.length > 0) {
    return {
      frameworkLabel: 'FastAPI',
      entrypoints,
      routes,
      ...(fastApiEntrypoint ? { fastApiEntrypoint } : {}),
    };
  }

  const mainPyPath = path.join(workspaceRoot, 'main.py');
  if (await fileExists(mainPyPath)) {
    entrypoints.push({
      id: `python-entry:${mainPyPath}`,
      label: 'main.py',
      description: formatWorkspaceRelativePath(workspaceRoot, mainPyPath),
      filePath: mainPyPath,
      lineNumber: 1,
    });
  }

  return {
    frameworkLabel: 'Python',
    entrypoints,
    routes,
  };
}

function buildPythonTreeSections(insights: PythonFrameworkInsights) {
  const sections: Array<{ id: string; title: string; items: CodePaneProjectTreeItem[] }> = [];

  if (insights.entrypoints.length > 0) {
    sections.push({
      id: 'python-entrypoints',
      title: 'Entrypoints',
      items: insights.entrypoints.map((entry) => ({
        id: entry.id,
        label: entry.label,
        kind: 'entry',
        description: entry.description,
        filePath: entry.filePath,
        lineNumber: entry.lineNumber,
      })),
    });
  }

  if (insights.routes.length > 0) {
    sections.push({
      id: 'python-routes',
      title: 'Routes',
      items: insights.routes.map((route) => ({
        id: route.id,
        label: route.label,
        kind: 'entry',
        description: route.description,
        filePath: route.filePath,
        lineNumber: route.lineNumber,
      })),
    });
  }

  return sections;
}

function parseFastApiFile(
  workspaceRoot: string,
  filePath: string,
  content: string,
): {
  entrypoint?: PythonProjectEntry;
  importTarget: string;
  routes: PythonProjectEntry[];
} {
  const lines = content.split(/\r?\n/);
  const routes: PythonProjectEntry[] = [];
  let hasFastApiApp = false;

  for (let index = 0; index < lines.length; index += 1) {
    const trimmedLine = lines[index].trim();
    if (!hasFastApiApp && /FastAPI\s*\(/.test(trimmedLine)) {
      hasFastApiApp = true;
    }

    const routeMatch = trimmedLine.match(/^@(?:[A-Za-z_][A-Za-z0-9_]*\.)?(get|post|put|delete|patch|options|head)\s*\(\s*["']([^"']+)["']/i);
    if (routeMatch) {
      routes.push({
        id: `python-route:${filePath}:${routeMatch[1].toUpperCase()}:${routeMatch[2]}:${index + 1}`,
        label: `${routeMatch[1].toUpperCase()} ${routeMatch[2]}`,
        description: formatWorkspaceRelativePath(workspaceRoot, filePath),
        filePath,
        lineNumber: index + 1,
      });
    }
  }

  const importTarget = buildPythonImportTarget(workspaceRoot, filePath);
  return {
    ...(hasFastApiApp ? {
      entrypoint: {
        id: `python-fastapi-entry:${filePath}`,
        label: path.basename(filePath),
        description: formatWorkspaceRelativePath(workspaceRoot, filePath),
        filePath,
        lineNumber: 1,
      },
    } : {}),
    importTarget,
    routes,
  };
}

function buildPythonImportTarget(workspaceRoot: string, filePath: string): string {
  const relativePath = path.relative(workspaceRoot, filePath).replace(/\.py$/i, '');
  const modulePath = relativePath.split(path.sep).join('.').replace(/\.__init__$/, '');
  return `${modulePath}:app`;
}

export async function resolvePythonEnvironment(workspaceRoot: string): Promise<{
  environmentRoot: string | null;
  interpreterPath: string | null;
}> {
  const candidates = [
    path.join(workspaceRoot, '.venv'),
    path.join(workspaceRoot, 'venv'),
    path.join(workspaceRoot, 'env'),
    process.env.VIRTUAL_ENV,
    process.env.CONDA_PREFIX,
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    const environmentRoot = path.resolve(candidate);
    if (!await directoryExists(environmentRoot)) {
      continue;
    }

    const interpreterPath = process.platform === 'win32'
      ? path.join(environmentRoot, 'Scripts', 'python.exe')
      : path.join(environmentRoot, 'bin', 'python');
    if (await fileExists(interpreterPath)) {
      return {
        environmentRoot,
        interpreterPath,
      };
    }

    return {
      environmentRoot,
      interpreterPath: null,
    };
  }

  return {
    environmentRoot: null,
    interpreterPath: null,
  };
}

async function detectFirstExistingFile(workspaceRoot: string, fileNames: string[]): Promise<string | null> {
  for (const fileName of fileNames) {
    const filePath = path.join(workspaceRoot, fileName);
    if (await fileExists(filePath)) {
      return filePath;
    }
  }

  return null;
}

function createPythonCommand(
  id: string,
  title: string,
  detail: string,
  command: string,
  args: string[],
  workingDirectory: string,
  kind: LanguageProjectCommandDefinition['kind'] = 'task',
): LanguageProjectCommandDefinition {
  return {
    id,
    title,
    detail,
    command,
    args,
    workingDirectory,
    languageId: 'python',
    kind,
  };
}

function resolveExecutable(command: string): string {
  if (process.platform === 'win32' && command === 'python') {
    return 'python.exe';
  }

  return command;
}

async function isPythonWorkspace(workspaceRoot: string): Promise<boolean> {
  if (await hasProjectIndicators(workspaceRoot, PYTHON_PROJECT_INDICATORS)) {
    return true;
  }

  if (await hasTopLevelExtension(workspaceRoot, '.py')) {
    return true;
  }

  return (await findWorkspaceFiles(workspaceRoot, ['**/*.py'])).length > 0;
}
