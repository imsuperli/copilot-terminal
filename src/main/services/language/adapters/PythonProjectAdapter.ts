import path from 'path';
import type {
  CodePaneExternalLibrarySection,
  CodePaneProjectContribution,
  CodePaneProjectDiagnostic,
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

const PYTHON_FRAMEWORK_SCAN_PATTERNS = [
  'main.py',
  'app.py',
  'manage.py',
  'app/**/*.py',
  'apps/**/*.py',
  'src/**/*.py',
  'backend/**/*.py',
  'server/**/*.py',
  'api/**/*.py',
  'services/**/*.py',
  'project/**/*.py',
  'config/**/*.py',
];

const PYTHON_PROJECT_INFO_CACHE_TTL_MS = 10_000;

type PythonInterpreterSource = 'workspace' | 'poetry' | 'virtualenv' | 'conda' | 'system';

export interface PythonInterpreterCandidate {
  id: string;
  label: string;
  detail: string;
  interpreterPath: string;
  environmentRoot: string;
  source: PythonInterpreterSource;
}

const pythonInterpreterOverrides = new Map<string, string>();
const pythonProjectInfoCache = new Map<string, {
  promise: Promise<PythonProjectInfo | null>;
  createdAt: number;
}>();

export class PythonProjectAdapter implements LanguageProjectAdapter {
  readonly languageId = 'python';

  async getExternalLibrarySection(workspaceRoot: string): Promise<CodePaneExternalLibrarySection | null> {
    const looksLikePythonProject = await isPythonWorkspace(workspaceRoot);
    if (!looksLikePythonProject) {
      return null;
    }

    const roots = [];
    const environmentResolution = await resolvePythonEnvironmentDetails(workspaceRoot);
    const environmentRoots = deduplicateEnvironmentRoots([
      ...environmentResolution.candidates.map((candidate) => candidate.environmentRoot),
      environmentResolution.environmentRoot,
    ]);

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
    const projectInfo = await getCachedPythonProjectInfo(workspaceRoot);
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
          id: 'python-interpreter',
          label: projectInfo.interpreterSelectionLabel,
          tone: projectInfo.interpreterTone,
        },
        {
          id: 'python-environment',
          label: projectInfo.environmentLabel,
          tone: projectInfo.hasEnvironment ? 'info' : 'warning',
        },
        {
          id: 'python-environment-count',
          label: `Environments: ${projectInfo.environmentCount}`,
          tone: projectInfo.environmentCount > 0 ? 'info' : 'warning',
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
      diagnostics: buildPythonProjectDiagnostics(projectInfo),
      detailCards: [
        {
          id: 'python-project-details',
          title: 'Environment',
          lines: [
            `Root: ${workspaceRoot}`,
            `Interpreter: ${projectInfo.interpreterPath ?? resolveExecutable('python')}`,
            `Selection: ${projectInfo.interpreterSourceLabel}`,
            `Environment root: ${projectInfo.environmentRoot ?? 'Not detected'}`,
            `Detected environments: ${projectInfo.environmentCount}`,
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
    const projectInfo = await getCachedPythonProjectInfo(workspaceRoot);
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
    const environmentCommands = buildPythonEnvironmentCommands(workspaceRoot, projectInfo);
    const pythonCommands: LanguageProjectCommandDefinition[] = [
      createPythonCommand(
        'python-project-pytest',
        'Pytest',
        `${pythonCommand} -m pytest`,
        pythonCommand,
        ['-m', 'pytest'],
        workspaceRoot,
        {
          runKind: 'test',
        },
      ),
      createPythonCommand(
        'python-project-pip-list',
        'Pip List',
        `${pythonCommand} -m pip list`,
        pythonCommand,
        ['-m', 'pip', 'list'],
        workspaceRoot,
      ),
      createPythonCommand(
        'python-project-pip-version',
        'Pip Version',
        `${pythonCommand} -m pip --version`,
        pythonCommand,
        ['-m', 'pip', '--version'],
        workspaceRoot,
      ),
    ];

    if (environmentCommands.length > 0) {
      groups.push({
        id: 'python-project-environment',
        title: 'Environment',
        commands: environmentCommands,
      });
    }

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
            {
              runKind: 'application',
            },
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
            {
              runKind: 'application',
            },
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
  interpreterSelectionLabel: string;
  interpreterTone: 'info' | 'warning' | 'error';
  interpreterSourceLabel: string;
  interpreterOverride: boolean;
  interpreterOverrideMissing: boolean;
  environmentRoot: string | null;
  environmentCount: number;
  projectFilePath: string | null;
  hasRequirementsFile: boolean;
  hasPoetryProject: boolean;
  hasTests: boolean;
  managePyPath: string | null;
  entrypointLabel: string;
  interpreterCandidates: PythonInterpreterCandidate[];
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

interface PythonEnvironmentResolution {
  environmentRoot: string | null;
  interpreterPath: string | null;
  source: PythonInterpreterSource | null;
  candidates: PythonInterpreterCandidate[];
  overridePath: string | null;
  isOverrideActive: boolean;
  isOverrideMissing: boolean;
}

async function detectPythonProject(workspaceRoot: string): Promise<PythonProjectInfo | null> {
  const looksLikePythonProject = await isPythonWorkspace(workspaceRoot);
  if (!looksLikePythonProject) {
    return null;
  }

  const environmentInfo = await resolvePythonEnvironmentDetails(workspaceRoot);
  const projectFilePath = await detectFirstExistingFile(workspaceRoot, [
    'pyproject.toml',
    'requirements.txt',
    'Pipfile',
    'setup.py',
    'setup.cfg',
  ]);
  const pyprojectContent = await readTextFile(path.join(workspaceRoot, 'pyproject.toml')) ?? '';
  const managePyPath = path.join(workspaceRoot, 'manage.py');
  const hasManagePy = await fileExists(managePyPath);
  const frameworkInsights = await collectPythonFrameworkInsights(workspaceRoot, hasManagePy ? managePyPath : null);
  const primaryEntrypoint = frameworkInsights.entrypoints[0]?.label ?? 'standard Python module';

  return {
    hasEnvironment: Boolean(environmentInfo.environmentRoot),
    environmentLabel: environmentInfo.environmentRoot
      ? `Environment: ${path.basename(environmentInfo.environmentRoot)}`
      : (environmentInfo.isOverrideMissing ? 'Environment: Selected interpreter missing' : 'Environment: Not detected'),
    interpreterPath: environmentInfo.interpreterPath,
    interpreterSelectionLabel: buildInterpreterSelectionLabel(environmentInfo),
    interpreterTone: resolveInterpreterTone(environmentInfo),
    interpreterSourceLabel: buildInterpreterSourceLabel(environmentInfo),
    interpreterOverride: environmentInfo.isOverrideActive || environmentInfo.isOverrideMissing,
    interpreterOverrideMissing: environmentInfo.isOverrideMissing,
    environmentRoot: environmentInfo.environmentRoot,
    environmentCount: environmentInfo.candidates.length,
    projectFilePath,
    hasRequirementsFile: await fileExists(path.join(workspaceRoot, 'requirements.txt')),
    hasPoetryProject: /\[tool\.poetry(?:\.|])/i.test(pyprojectContent)
      || await fileExists(path.join(workspaceRoot, 'poetry.lock')),
    hasTests: await directoryExists(path.join(workspaceRoot, 'tests')),
    managePyPath: hasManagePy ? managePyPath : null,
    entrypointLabel: `Entrypoint: ${primaryEntrypoint}`,
    interpreterCandidates: environmentInfo.candidates,
    ...(frameworkInsights ? { frameworkInsights } : {}),
  };
}

async function getCachedPythonProjectInfo(workspaceRoot: string): Promise<PythonProjectInfo | null> {
  const normalizedWorkspaceRoot = path.resolve(workspaceRoot);
  const now = Date.now();
  const cachedEntry = pythonProjectInfoCache.get(normalizedWorkspaceRoot);
  if (cachedEntry && now - cachedEntry.createdAt < PYTHON_PROJECT_INFO_CACHE_TTL_MS) {
    return await cachedEntry.promise;
  }

  const promise = detectPythonProject(normalizedWorkspaceRoot).catch((error) => {
    const currentEntry = pythonProjectInfoCache.get(normalizedWorkspaceRoot);
    if (currentEntry?.promise === promise) {
      pythonProjectInfoCache.delete(normalizedWorkspaceRoot);
    }
    throw error;
  });

  pythonProjectInfoCache.set(normalizedWorkspaceRoot, {
    promise,
    createdAt: now,
  });

  return await promise;
}

async function collectPythonFrameworkInsights(
  workspaceRoot: string,
  managePyPath: string | null,
): Promise<PythonFrameworkInsights> {
  const pythonFiles = deduplicateFilePaths([
    ...await findWorkspaceFiles(workspaceRoot, PYTHON_FRAMEWORK_SCAN_PATTERNS),
    ...await findWorkspaceFiles(workspaceRoot, ['**/*.py'], [
      '**/tests/**',
      '**/test_*.py',
      '**/*_test.py',
    ]),
  ]).slice(0, 400);
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
  const environment = await resolvePythonEnvironmentDetails(workspaceRoot);
  return {
    environmentRoot: environment.environmentRoot,
    interpreterPath: environment.interpreterPath,
  };
}

export function setPythonInterpreterOverride(workspaceRoot: string, interpreterPath: string | null): void {
  const normalizedWorkspaceRoot = path.resolve(workspaceRoot);
  if (!interpreterPath) {
    pythonInterpreterOverrides.delete(normalizedWorkspaceRoot);
    invalidatePythonProjectInfo(normalizedWorkspaceRoot);
    return;
  }

  pythonInterpreterOverrides.set(normalizedWorkspaceRoot, normalizeInterpreterPath(interpreterPath));
  invalidatePythonProjectInfo(normalizedWorkspaceRoot);
}

export function invalidatePythonProjectInfo(workspaceRoot: string): void {
  pythonProjectInfoCache.delete(path.resolve(workspaceRoot));
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
  options: {
    kind?: LanguageProjectCommandDefinition['kind'];
    runKind?: LanguageProjectCommandDefinition['runKind'];
  } = {},
): LanguageProjectCommandDefinition {
  return {
    id,
    title,
    detail,
    command,
    args,
    workingDirectory,
    languageId: 'python',
    kind: options.kind ?? 'run',
    runKind: options.runKind ?? 'task',
  };
}

function createPythonProjectActionCommand(
  id: string,
  title: string,
  detail: string,
  kind: LanguageProjectCommandDefinition['kind'],
  actionType: LanguageProjectCommandDefinition['actionType'],
  interpreterPath?: string | null,
): LanguageProjectCommandDefinition {
  return {
    id,
    title,
    detail,
    languageId: 'python',
    kind,
    actionType,
    ...(interpreterPath !== undefined ? { interpreterPath } : {}),
  };
}

function buildPythonEnvironmentCommands(
  workspaceRoot: string,
  projectInfo: PythonProjectInfo,
): LanguageProjectCommandDefinition[] {
  const commands: LanguageProjectCommandDefinition[] = [
    createPythonProjectActionCommand(
      'python-project-refresh-model',
      'Refresh Project Model',
      'Rescan interpreters, project files, and framework entrypoints',
      'refresh',
      'refresh-model',
    ),
    createPythonProjectActionCommand(
      'python-project-interpreter:auto',
      projectInfo.interpreterOverride ? 'Use Auto-detected Interpreter' : 'Auto-detected Interpreter',
      projectInfo.interpreterPath
        ? `Clear manual override and use ${projectInfo.interpreterPath}`
        : 'Clear manual override and fall back to PATH resolution',
      'configure',
      'set-python-interpreter',
      null,
    ),
  ];

  for (const candidate of projectInfo.interpreterCandidates) {
    const isSelected = projectInfo.interpreterPath
      ? isSameInterpreterPath(projectInfo.interpreterPath, candidate.interpreterPath)
      : false;

    commands.push(createPythonProjectActionCommand(
      `python-project-interpreter:${toSafeCommandSegment(candidate.interpreterPath)}`,
      isSelected
        ? (projectInfo.interpreterOverride ? `Selected: ${candidate.label}` : `Auto: ${candidate.label}`)
        : `Use ${candidate.label}`,
      candidate.detail,
      'configure',
      'set-python-interpreter',
      candidate.interpreterPath,
    ));
  }

  if (projectInfo.interpreterPath && projectInfo.hasRequirementsFile) {
    commands.push(createPythonCommand(
      'python-project-install-requirements',
      'Install Requirements',
      `${projectInfo.interpreterPath} -m pip install -r requirements.txt`,
      projectInfo.interpreterPath,
      ['-m', 'pip', 'install', '-r', 'requirements.txt'],
      workspaceRoot,
      {
        kind: 'configure',
      },
    ));
  }

  if (!projectInfo.hasEnvironment) {
    commands.push(createPythonCommand(
      'python-project-create-venv',
      'Create .venv',
      `${resolveExecutable('python')} -m venv .venv`,
      resolveExecutable('python'),
      ['-m', 'venv', '.venv'],
      workspaceRoot,
      {
        kind: 'repair',
      },
    ));
  }

  if (projectInfo.hasPoetryProject) {
    commands.push(createPythonCommand(
      'python-project-poetry-install',
      'Poetry Install',
      'poetry install',
      'poetry',
      ['install'],
      workspaceRoot,
      {
        kind: 'repair',
      },
    ));
  }

  return commands;
}

function buildPythonProjectDiagnostics(projectInfo: PythonProjectInfo): CodePaneProjectDiagnostic[] {
  const diagnostics: CodePaneProjectDiagnostic[] = [];

  if (projectInfo.interpreterOverrideMissing) {
    diagnostics.push({
      id: 'python-missing-interpreter-override',
      severity: 'error',
      message: 'Selected interpreter is no longer available',
      detail: 'Clear the override or choose another interpreter before running project commands.',
      commandId: 'python-project-interpreter:auto',
      commandLabel: 'Use Auto-detected Interpreter',
    });
  }

  if (!projectInfo.hasEnvironment) {
    diagnostics.push({
      id: 'python-missing-environment',
      severity: 'warning',
      message: projectInfo.hasPoetryProject
        ? 'No Poetry environment detected'
        : 'No Python virtual environment detected',
      detail: projectInfo.hasPoetryProject
        ? 'Run Poetry install or create a local .venv to restore package resolution.'
        : 'Create a local .venv or choose an existing interpreter to restore imports and jump-to-definition.',
      commandId: projectInfo.hasPoetryProject ? 'python-project-poetry-install' : 'python-project-create-venv',
      commandLabel: projectInfo.hasPoetryProject ? 'Poetry Install' : 'Create .venv',
    });
  }

  if (projectInfo.hasRequirementsFile && projectInfo.hasEnvironment) {
    diagnostics.push({
      id: 'python-requirements-sync',
      severity: 'info',
      message: 'requirements.txt detected',
      detail: 'Refresh installed packages after switching interpreters to keep completion and imports accurate.',
      commandId: 'python-project-install-requirements',
      commandLabel: 'Install Requirements',
    });
  }

  return diagnostics;
}

async function resolvePythonEnvironmentDetails(workspaceRoot: string): Promise<PythonEnvironmentResolution> {
  const candidates = await listPythonInterpreterCandidates(workspaceRoot);
  const overridePath = getPythonInterpreterOverride(workspaceRoot);
  if (overridePath) {
    const matchingCandidate = candidates.find((candidate) => (
      isSameInterpreterPath(candidate.interpreterPath, overridePath)
    ));
    if (matchingCandidate) {
      return {
        environmentRoot: matchingCandidate.environmentRoot,
        interpreterPath: matchingCandidate.interpreterPath,
        source: matchingCandidate.source,
        candidates,
        overridePath,
        isOverrideActive: true,
        isOverrideMissing: false,
      };
    }

    if (await fileExists(overridePath)) {
      return {
        environmentRoot: deriveEnvironmentRootFromInterpreter(overridePath),
        interpreterPath: overridePath,
        source: 'system',
        candidates,
        overridePath,
        isOverrideActive: true,
        isOverrideMissing: false,
      };
    }

    return {
      environmentRoot: null,
      interpreterPath: null,
      source: null,
      candidates,
      overridePath,
      isOverrideActive: false,
      isOverrideMissing: true,
    };
  }

  const primaryCandidate = candidates[0] ?? null;
  return {
    environmentRoot: primaryCandidate?.environmentRoot ?? null,
    interpreterPath: primaryCandidate?.interpreterPath ?? null,
    source: primaryCandidate?.source ?? null,
    candidates,
    overridePath: null,
    isOverrideActive: false,
    isOverrideMissing: false,
  };
}

async function listPythonInterpreterCandidates(workspaceRoot: string): Promise<PythonInterpreterCandidate[]> {
  const normalizedWorkspaceRoot = path.resolve(workspaceRoot);
  const pyprojectContent = await readTextFile(path.join(normalizedWorkspaceRoot, 'pyproject.toml')) ?? '';
  const hasPoetry = /\[tool\.poetry(?:\.|])/i.test(pyprojectContent)
    || await fileExists(path.join(normalizedWorkspaceRoot, 'poetry.lock'));
  const candidateRoots: Array<{ environmentRoot: string; source: PythonInterpreterSource }> = [
    {
      environmentRoot: path.join(normalizedWorkspaceRoot, '.venv'),
      source: hasPoetry ? 'poetry' : 'workspace',
    },
    {
      environmentRoot: path.join(normalizedWorkspaceRoot, 'venv'),
      source: 'workspace',
    },
    {
      environmentRoot: path.join(normalizedWorkspaceRoot, 'env'),
      source: 'workspace',
    },
    ...(process.env.VIRTUAL_ENV ? [{
      environmentRoot: process.env.VIRTUAL_ENV,
      source: 'virtualenv' as const,
    }] : []),
    ...(process.env.CONDA_PREFIX ? [{
      environmentRoot: process.env.CONDA_PREFIX,
      source: 'conda' as const,
    }] : []),
  ];
  const candidates: PythonInterpreterCandidate[] = [];
  const seenInterpreterPaths = new Set<string>();

  for (const candidateRoot of candidateRoots) {
    const environmentRoot = path.resolve(candidateRoot.environmentRoot);
    if (!await directoryExists(environmentRoot)) {
      continue;
    }

    const interpreterPath = await resolveEnvironmentInterpreterPath(environmentRoot);
    if (!interpreterPath) {
      continue;
    }

    const normalizedInterpreterPath = normalizeInterpreterPath(interpreterPath);
    const comparisonKey = toInterpreterComparisonKey(normalizedInterpreterPath);
    if (seenInterpreterPaths.has(comparisonKey)) {
      continue;
    }

    seenInterpreterPaths.add(comparisonKey);
    candidates.push({
      id: `python-interpreter:${candidateRoot.source}:${toSafeCommandSegment(normalizedInterpreterPath)}`,
      label: formatPythonInterpreterLabel(candidateRoot.source, environmentRoot),
      detail: `${formatInterpreterSourceLabel(candidateRoot.source)} · ${normalizedInterpreterPath}`,
      interpreterPath: normalizedInterpreterPath,
      environmentRoot,
      source: candidateRoot.source,
    });
  }

  return candidates;
}

async function resolveEnvironmentInterpreterPath(environmentRoot: string): Promise<string | null> {
  const candidates = process.platform === 'win32'
    ? [path.join(environmentRoot, 'Scripts', 'python.exe')]
    : [path.join(environmentRoot, 'bin', 'python'), path.join(environmentRoot, 'bin', 'python3')];

  for (const interpreterPath of candidates) {
    if (await fileExists(interpreterPath)) {
      return path.resolve(interpreterPath);
    }
  }

  return null;
}

function getPythonInterpreterOverride(workspaceRoot: string): string | null {
  return pythonInterpreterOverrides.get(path.resolve(workspaceRoot)) ?? null;
}

function buildInterpreterSelectionLabel(environment: PythonEnvironmentResolution): string {
  if (environment.isOverrideMissing) {
    return 'Interpreter: Missing override';
  }

  if (environment.interpreterPath) {
    return `Interpreter: ${path.basename(environment.interpreterPath)}`;
  }

  return 'Interpreter: python (PATH)';
}

function resolveInterpreterTone(environment: PythonEnvironmentResolution): 'info' | 'warning' | 'error' {
  if (environment.isOverrideMissing) {
    return 'error';
  }

  if (environment.interpreterPath) {
    return 'info';
  }

  return 'warning';
}

function buildInterpreterSourceLabel(environment: PythonEnvironmentResolution): string {
  if (environment.isOverrideMissing) {
    return `Manual override missing: ${environment.overridePath ?? 'Unknown interpreter'}`;
  }

  const sourceLabel = environment.source ? formatInterpreterSourceLabel(environment.source) : 'PATH fallback';
  if (environment.isOverrideActive) {
    return `Manual override · ${sourceLabel}`;
  }

  return `Auto-detected · ${sourceLabel}`;
}

function formatInterpreterSourceLabel(source: PythonInterpreterSource): string {
  switch (source) {
    case 'poetry':
      return 'Poetry';
    case 'virtualenv':
      return 'Virtualenv';
    case 'conda':
      return 'Conda';
    case 'workspace':
      return 'Workspace';
    case 'system':
    default:
      return 'System';
  }
}

function formatPythonInterpreterLabel(source: PythonInterpreterSource, environmentRoot: string): string {
  const environmentName = path.basename(environmentRoot);
  switch (source) {
    case 'poetry':
      return `Poetry (${environmentName})`;
    case 'virtualenv':
      return `Virtualenv (${environmentName})`;
    case 'conda':
      return `Conda (${environmentName})`;
    case 'workspace':
      return `Workspace (${environmentName})`;
    case 'system':
    default:
      return `System (${environmentName})`;
  }
}

function deriveEnvironmentRootFromInterpreter(interpreterPath: string): string | null {
  const normalizedInterpreterPath = normalizeInterpreterPath(interpreterPath);
  const parentDirectory = path.dirname(normalizedInterpreterPath);
  const parentName = path.basename(parentDirectory).toLowerCase();
  if (parentName === 'bin' || parentName === 'scripts') {
    return path.dirname(parentDirectory);
  }

  return path.dirname(normalizedInterpreterPath);
}

function normalizeInterpreterPath(interpreterPath: string): string {
  return path.resolve(interpreterPath);
}

function deduplicateEnvironmentRoots(environmentRoots: Array<string | null | undefined>): string[] {
  const seenRoots = new Set<string>();
  const deduplicatedRoots: string[] = [];

  for (const environmentRoot of environmentRoots) {
    if (!environmentRoot) {
      continue;
    }

    const normalizedEnvironmentRoot = path.resolve(environmentRoot);
    if (seenRoots.has(toInterpreterComparisonKey(normalizedEnvironmentRoot))) {
      continue;
    }

    seenRoots.add(toInterpreterComparisonKey(normalizedEnvironmentRoot));
    deduplicatedRoots.push(normalizedEnvironmentRoot);
  }

  return deduplicatedRoots;
}

function isSameInterpreterPath(left: string, right: string): boolean {
  return toInterpreterComparisonKey(left) === toInterpreterComparisonKey(right);
}

function toInterpreterComparisonKey(value: string): string {
  const normalizedValue = normalizeInterpreterPath(value);
  return process.platform === 'win32' ? normalizedValue.toLowerCase() : normalizedValue;
}

function toSafeCommandSegment(value: string): string {
  return value
    .replace(/\./g, '-dot-')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'default';
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

  return (await findWorkspaceFiles(workspaceRoot, [
    '*.py',
    'src/**/*.py',
    'app/**/*.py',
    'backend/**/*.py',
    'server/**/*.py',
    'api/**/*.py',
  ])).length > 0;
}

function deduplicateFilePaths(filePaths: string[]): string[] {
  return Array.from(new Set(filePaths.map((filePath) => path.resolve(filePath))));
}
