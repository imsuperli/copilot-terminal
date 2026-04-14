import path from 'path';
import type {
  CodePaneExternalLibrarySection,
  CodePaneProjectContribution,
} from '../../../../shared/types/electron-api';
import {
  createExternalLibraryRoot,
  createExternalLibrarySection,
  createProjectContribution,
  directoryExists,
  fileExists,
  hasProjectIndicators,
  hasTopLevelExtension,
  listDirectoryNames,
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
    const looksLikePythonProject = await hasProjectIndicators(workspaceRoot, PYTHON_PROJECT_INDICATORS)
      || await hasTopLevelExtension(workspaceRoot, '.py');
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
      ],
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
    const commands: LanguageProjectCommandDefinition[] = [
      createPythonCommand('python-project-pytest', 'Pytest', `${pythonCommand} -m pytest`, pythonCommand, ['-m', 'pytest'], workspaceRoot),
      createPythonCommand('python-project-pip-list', 'Pip List', `${pythonCommand} -m pip list`, pythonCommand, ['-m', 'pip', 'list'], workspaceRoot),
      createPythonCommand('python-project-pip-version', 'Pip Version', `${pythonCommand} -m pip --version`, pythonCommand, ['-m', 'pip', '--version'], workspaceRoot),
    ];

    if (projectInfo.managePyPath) {
      commands.unshift(createPythonCommand(
        'python-project-runserver',
        'Run Server',
        `${pythonCommand} manage.py runserver`,
        pythonCommand,
        ['manage.py', 'runserver'],
        workspaceRoot,
      ));
    }

    return [
      {
        id: 'python-project-commands',
        title: 'Python',
        commands,
      },
    ];
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
}

async function detectPythonProject(workspaceRoot: string): Promise<PythonProjectInfo | null> {
  const looksLikePythonProject = await hasProjectIndicators(workspaceRoot, PYTHON_PROJECT_INDICATORS)
    || await hasTopLevelExtension(workspaceRoot, '.py');
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

  return {
    hasEnvironment: Boolean(environmentInfo.environmentRoot),
    environmentLabel: environmentInfo.environmentRoot
      ? `Environment: ${path.basename(environmentInfo.environmentRoot)}`
      : 'Environment: Not detected',
    interpreterPath: environmentInfo.interpreterPath,
    projectFilePath,
    hasTests: await directoryExists(path.join(workspaceRoot, 'tests')),
    managePyPath: await fileExists(managePyPath) ? managePyPath : null,
    entrypointLabel: await fileExists(managePyPath)
      ? 'Entrypoint: manage.py'
      : 'Entrypoint: standard Python module',
  };
}

async function resolvePythonEnvironment(workspaceRoot: string): Promise<{
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
