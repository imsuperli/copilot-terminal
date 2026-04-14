import path from 'path';
import { homedir } from 'os';
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
        {
          id: 'go-benchmarks',
          label: `Benchmarks: ${projectInfo.insights.benchmarks.length}`,
          tone: 'info',
        },
        {
          id: 'go-examples',
          label: `Examples: ${projectInfo.insights.examples.length}`,
          tone: 'info',
        },
      ],
      diagnostics: buildGoProjectDiagnostics(projectInfo),
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
        {
          id: 'go-insights',
          title: 'GoLand-style Insights',
          lines: [
            `Benchmarks: ${projectInfo.insights.benchmarks.length}`,
            `Examples: ${projectInfo.insights.examples.length}`,
            `go:generate directives: ${projectInfo.insights.generateDirectives.length}`,
          ],
        },
      ],
      treeSections: buildGoTreeSections(projectInfo.insights),
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
      createGoCommand(
        'go-project-test',
        'Go Test',
        'go test ./...',
        'go',
        ['test', './...'],
        workspaceRoot,
        {
          runKind: 'test',
        },
      ),
      createGoCommand('go-project-build', 'Go Build', 'go build ./...', 'go', ['build', './...'], workspaceRoot),
      createGoCommand(
        'go-project-env',
        'Go Env',
        'go env',
        'go',
        ['env'],
        workspaceRoot,
        {
          kind: 'configure',
        },
      ),
      createGoCommand(
        'go-project-mod-tidy',
        'Go Mod Tidy',
        'go mod tidy',
        'go',
        ['mod', 'tidy'],
        workspaceRoot,
        {
          kind: 'repair',
        },
      ),
      createGoCommand('go-project-generate', 'Go Generate', 'go generate ./...', 'go', ['generate', './...'], workspaceRoot),
      createGoCommand(
        'go-project-bench',
        'Go Bench',
        'go test ./... -bench .',
        'go',
        ['test', './...', '-bench', '.'],
        workspaceRoot,
        {
          runKind: 'test',
        },
      ),
    ];

    return [
      {
        id: 'go-project-sync',
        title: 'Workspace Sync',
        commands: buildGoSyncCommands(workspaceRoot, projectInfo),
      },
      {
        id: 'go-project-repair',
        title: 'Repair',
        commands: buildGoRepairCommands(workspaceRoot, projectInfo),
      },
      {
        id: 'go-project-commands',
        title: 'Go',
        commands,
      },
    ];
  }
}

interface GoProjectInsightEntry {
  id: string;
  label: string;
  description: string;
  filePath: string;
  lineNumber: number;
}

interface GoProjectInsights {
  benchmarks: GoProjectInsightEntry[];
  examples: GoProjectInsightEntry[];
  generateDirectives: GoProjectInsightEntry[];
}

interface GoProjectInfo {
  moduleName: string | null;
  defaultModuleName: string;
  goModPath: string | null;
  goWorkPath: string | null;
  hasVendor: boolean;
  goModuleCachePath: string;
  insights: GoProjectInsights;
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
    defaultModuleName: `example.com/${path.basename(workspaceRoot)}`,
    goModPath: await fileExists(goModPath) ? goModPath : null,
    goWorkPath: await fileExists(goWorkPath) ? goWorkPath : null,
    hasVendor: await directoryExists(path.join(workspaceRoot, 'vendor')),
    goModuleCachePath: process.env.GOMODCACHE
      ? path.resolve(process.env.GOMODCACHE)
      : path.join(homedir(), 'go', 'pkg', 'mod'),
    insights: await collectGoInsights(workspaceRoot),
  };
}

async function collectGoInsights(workspaceRoot: string): Promise<GoProjectInsights> {
  const goFiles = await findWorkspaceFiles(workspaceRoot, ['**/*.go']);
  const benchmarks: GoProjectInsightEntry[] = [];
  const examples: GoProjectInsightEntry[] = [];
  const generateDirectives: GoProjectInsightEntry[] = [];

  for (const filePath of goFiles) {
    const content = await readTextFile(filePath);
    if (!content) {
      continue;
    }

    const relativePath = formatWorkspaceRelativePath(workspaceRoot, filePath);
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const trimmedLine = lines[index].trim();
      const benchmarkMatch = trimmedLine.match(/^func\s+(Benchmark[A-Za-z0-9_]+)\s*\(\s*[A-Za-z0-9_]+\s+\*testing\.B\s*\)/);
      if (benchmarkMatch) {
        benchmarks.push({
          id: `go-benchmark:${filePath}:${benchmarkMatch[1]}:${index + 1}`,
          label: benchmarkMatch[1],
          description: relativePath,
          filePath,
          lineNumber: index + 1,
        });
      }

      const exampleMatch = trimmedLine.match(/^func\s+(Example[A-Za-z0-9_]+)\s*\(\s*\)/);
      if (exampleMatch) {
        examples.push({
          id: `go-example:${filePath}:${exampleMatch[1]}:${index + 1}`,
          label: exampleMatch[1],
          description: relativePath,
          filePath,
          lineNumber: index + 1,
        });
      }

      const generateMatch = trimmedLine.match(/^\/\/go:generate\s+(.+)$/);
      if (generateMatch) {
        generateDirectives.push({
          id: `go-generate:${filePath}:${index + 1}`,
          label: '//go:generate',
          description: `${generateMatch[1]} · ${relativePath}`,
          filePath,
          lineNumber: index + 1,
        });
      }
    }
  }

  return {
    benchmarks,
    examples,
    generateDirectives,
  };
}

function buildGoTreeSections(insights: GoProjectInsights) {
  const sections: Array<{ id: string; title: string; items: CodePaneProjectTreeItem[] }> = [];

  if (insights.benchmarks.length > 0) {
    sections.push({
      id: 'go-benchmarks',
      title: 'Benchmarks',
      items: insights.benchmarks.map((entry) => ({
        id: entry.id,
        label: entry.label,
        kind: 'entry',
        description: entry.description,
        filePath: entry.filePath,
        lineNumber: entry.lineNumber,
      })),
    });
  }

  if (insights.examples.length > 0) {
    sections.push({
      id: 'go-examples',
      title: 'Examples',
      items: insights.examples.map((entry) => ({
        id: entry.id,
        label: entry.label,
        kind: 'entry',
        description: entry.description,
        filePath: entry.filePath,
        lineNumber: entry.lineNumber,
      })),
    });
  }

  if (insights.generateDirectives.length > 0) {
    sections.push({
      id: 'go-generate',
      title: 'go:generate',
      items: insights.generateDirectives.map((entry) => ({
        id: entry.id,
        label: entry.label,
        kind: 'entry',
        description: entry.description,
        filePath: entry.filePath,
        lineNumber: entry.lineNumber,
      })),
    });
  }

  return sections;
}

function buildGoRepairCommands(
  workspaceRoot: string,
  projectInfo: GoProjectInfo,
): LanguageProjectCommandDefinition[] {
  const commands: LanguageProjectCommandDefinition[] = [];

  if (!projectInfo.goModPath) {
    commands.push(createGoCommand(
      'go-project-mod-init',
      'Initialize Module',
      `go mod init ${projectInfo.defaultModuleName}`,
      'go',
      ['mod', 'init', projectInfo.defaultModuleName],
      workspaceRoot,
      {
        kind: 'repair',
      },
    ));
  }

  commands.push(createGoCommand(
    'go-project-mod-tidy-repair',
    'Repair Modules',
    'go mod tidy',
    'go',
    ['mod', 'tidy'],
    workspaceRoot,
    {
      kind: 'repair',
    },
  ));

  return commands;
}

function buildGoProjectDiagnostics(projectInfo: GoProjectInfo): CodePaneProjectDiagnostic[] {
  const diagnostics: CodePaneProjectDiagnostic[] = [];

  if (!projectInfo.goModPath) {
    diagnostics.push({
      id: 'go-missing-module',
      severity: 'error',
      message: 'go.mod is not detected',
      detail: 'Go module metadata is required for dependency resolution, imports, and package navigation.',
      commandId: 'go-project-mod-init',
      commandLabel: 'Initialize Module',
    });
  }

  if (projectInfo.goWorkPath && !projectInfo.goModPath) {
    diagnostics.push({
      id: 'go-work-without-module',
      severity: 'warning',
      message: 'go.work exists without a local module',
      detail: 'Create or restore a module before syncing the workspace to avoid incomplete package loading.',
      commandId: 'go-project-work-sync',
      commandLabel: 'Go Work Sync',
    });
  }

  if (!projectInfo.hasVendor && !projectInfo.goModPath) {
    diagnostics.push({
      id: 'go-no-module-cache-fallback',
      severity: 'warning',
      message: 'No vendor directory or go.mod fallback is available',
      detail: 'Package lookup will remain degraded until the module is initialized and dependencies are downloaded.',
      commandId: 'go-project-mod-download',
      commandLabel: 'Download Modules',
    });
  }

  return diagnostics;
}

function buildGoSyncCommands(
  workspaceRoot: string,
  projectInfo: GoProjectInfo,
): LanguageProjectCommandDefinition[] {
  const commands: LanguageProjectCommandDefinition[] = [
    createGoProjectActionCommand(
      'go-project-refresh-model',
      'Refresh Go Workspace',
      'Reload Go module/workspace metadata and rescan project structure',
      'refresh',
      'refresh-model',
    ),
    createGoCommand(
      'go-project-mod-download',
      'Download Modules',
      'go mod download',
      'go',
      ['mod', 'download'],
      workspaceRoot,
      {
        kind: 'refresh',
      },
    ),
  ];

  if (projectInfo.goWorkPath) {
    commands.push(createGoCommand(
      'go-project-work-sync',
      'Go Work Sync',
      'go work sync',
      'go',
      ['work', 'sync'],
      workspaceRoot,
      {
        kind: 'refresh',
      },
    ));
  }

  return commands;
}

function createGoCommand(
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
    command: resolveExecutable(command),
    args,
    workingDirectory,
    languageId: 'go',
    kind: options.kind ?? 'run',
    runKind: options.runKind ?? 'task',
  };
}

function createGoProjectActionCommand(
  id: string,
  title: string,
  detail: string,
  kind: LanguageProjectCommandDefinition['kind'],
  actionType: LanguageProjectCommandDefinition['actionType'],
): LanguageProjectCommandDefinition {
  return {
    id,
    title,
    detail,
    languageId: 'go',
    kind,
    actionType,
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
