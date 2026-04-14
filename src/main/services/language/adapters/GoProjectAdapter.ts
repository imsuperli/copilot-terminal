import path from 'path';
import { homedir } from 'os';
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
  readTextFile,
  type LanguageProjectAdapter,
  type LanguageProjectCommandDefinition,
  type LanguageProjectCommandGroupDefinition,
} from './LanguageProjectAdapter';

const GO_PROJECT_INDICATORS = [
  'go.mod',
  'go.work',
  'vendor',
];

export class GoProjectAdapter implements LanguageProjectAdapter {
  readonly languageId = 'go';

  async getExternalLibrarySection(workspaceRoot: string): Promise<CodePaneExternalLibrarySection | null> {
    const looksLikeGoProject = await hasProjectIndicators(workspaceRoot, GO_PROJECT_INDICATORS)
      || await hasTopLevelExtension(workspaceRoot, '.go');
    if (!looksLikeGoProject) {
      return null;
    }

    const roots = [];
    const vendorPath = path.join(workspaceRoot, 'vendor');
    if (await directoryExists(vendorPath)) {
      roots.push(createExternalLibraryRoot(
        'go-vendor',
        'Vendor',
        vendorPath,
      ));
    }

    const goModuleCachePath = process.env.GOMODCACHE
      ? path.resolve(process.env.GOMODCACHE)
      : path.join(homedir(), 'go', 'pkg', 'mod');
    if (await directoryExists(goModuleCachePath)) {
      roots.push(createExternalLibraryRoot(
        'go-module-cache',
        'Module Cache',
        goModuleCachePath,
      ));
    }

    const goRootSrcPath = getGoRootSourcePath();
    if (goRootSrcPath && await directoryExists(goRootSrcPath)) {
      roots.push(createExternalLibraryRoot(
        'go-stdlib',
        'Go Standard Library',
        goRootSrcPath,
      ));
    }

    return createExternalLibrarySection('go-external-libraries', this.languageId, roots);
  }

  async getProjectContribution(workspaceRoot: string): Promise<CodePaneProjectContribution | null> {
    const projectInfo = await detectGoProject(workspaceRoot);
    if (!projectInfo) {
      return null;
    }

    return createProjectContribution('go-project', this.languageId, 'Go Project', {
      statusItems: [
        {
          id: 'go-module',
          label: projectInfo.moduleName ? `Module: ${projectInfo.moduleName}` : 'Module: Not detected',
          tone: projectInfo.moduleName ? 'info' : 'warning',
        },
        {
          id: 'go-workspace',
          label: projectInfo.goWorkPath ? 'Workspace file detected' : 'Single-module workspace',
          tone: 'info',
        },
        {
          id: 'go-vendor',
          label: projectInfo.hasVendor ? 'Vendor directory detected' : 'Using module cache',
          tone: projectInfo.hasVendor ? 'info' : 'warning',
        },
      ],
      detailCards: [
        {
          id: 'go-project-details',
          title: 'Modules',
          lines: [
            `Root: ${workspaceRoot}`,
            `go.mod: ${projectInfo.goModPath ?? 'Not detected'}`,
            `go.work: ${projectInfo.goWorkPath ?? 'Not detected'}`,
            `GOMODCACHE: ${projectInfo.goModuleCachePath}`,
          ],
        },
      ],
      commandGroups: this.getCommandGroups(workspaceRoot, projectInfo),
    });
  }

  async resolveProjectCommand(workspaceRoot: string, commandId: string): Promise<LanguageProjectCommandDefinition | null> {
    const projectInfo = await detectGoProject(workspaceRoot);
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
    projectInfo: GoProjectInfo,
  ): LanguageProjectCommandGroupDefinition[] {
    const commands: LanguageProjectCommandDefinition[] = [
      createGoCommand('go-project-test', 'Go Test', 'go test ./...', 'go', ['test', './...'], workspaceRoot),
      createGoCommand('go-project-build', 'Go Build', 'go build ./...', 'go', ['build', './...'], workspaceRoot),
      createGoCommand('go-project-env', 'Go Env', 'go env', 'go', ['env'], workspaceRoot),
      createGoCommand('go-project-mod-tidy', 'Go Mod Tidy', 'go mod tidy', 'go', ['mod', 'tidy'], workspaceRoot),
    ];

    if (projectInfo.goWorkPath) {
      commands.push(createGoCommand('go-project-work-sync', 'Go Work Sync', 'go work sync', 'go', ['work', 'sync'], workspaceRoot));
    }

    return [
      {
        id: 'go-project-commands',
        title: 'Go',
        commands,
      },
    ];
  }
}

interface GoProjectInfo {
  moduleName: string | null;
  goModPath: string | null;
  goWorkPath: string | null;
  hasVendor: boolean;
  goModuleCachePath: string;
}

async function detectGoProject(workspaceRoot: string): Promise<GoProjectInfo | null> {
  const looksLikeGoProject = await hasProjectIndicators(workspaceRoot, GO_PROJECT_INDICATORS)
    || await hasTopLevelExtension(workspaceRoot, '.go');
  if (!looksLikeGoProject) {
    return null;
  }

  const goModPath = path.join(workspaceRoot, 'go.mod');
  const goWorkPath = path.join(workspaceRoot, 'go.work');
  const goModContent = await readTextFile(goModPath);

  return {
    moduleName: goModContent?.match(/^module\s+(.+)$/m)?.[1]?.trim() ?? null,
    goModPath: await fileExists(goModPath) ? goModPath : null,
    goWorkPath: await fileExists(goWorkPath) ? goWorkPath : null,
    hasVendor: await directoryExists(path.join(workspaceRoot, 'vendor')),
    goModuleCachePath: process.env.GOMODCACHE
      ? path.resolve(process.env.GOMODCACHE)
      : path.join(homedir(), 'go', 'pkg', 'mod'),
  };
}

function createGoCommand(
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
    command: resolveExecutable(command),
    args,
    workingDirectory,
    languageId: 'go',
    kind,
  };
}

function resolveExecutable(command: string): string {
  if (process.platform === 'win32' && command === 'go') {
    return 'go.exe';
  }

  return command;
}

function getGoRootSourcePath(): string | null {
  if (process.env.GOROOT) {
    return path.join(process.env.GOROOT, 'src');
  }

  if (process.platform === 'win32') {
    return path.join('C:\\', 'Program Files', 'Go', 'src');
  }

  return path.join('/usr', 'local', 'go', 'src');
}
