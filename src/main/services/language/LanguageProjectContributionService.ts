import path from 'path';
import type {
  CodePaneExternalLibraryRoot,
  CodePaneExternalLibrarySection,
  CodePaneListDirectoryConfig,
  CodePaneProjectContribution,
  CodePaneReadFileConfig,
  CodePaneReadFileResult,
  CodePaneRunSession,
  CodePaneTreeEntry,
} from '../../../shared/types/electron-api';
import { CodeFileService } from '../code/CodeFileService';
import { CodeRunProfileService } from '../code/CodeRunProfileService';
import { LanguageProjectAdapterRegistry } from './adapters/LanguageProjectAdapterRegistry';
import { invalidatePythonProjectInfo, setPythonInterpreterOverride } from './adapters/PythonProjectAdapter';
import { ExternalJarService } from './ExternalJarService';

export interface LanguageProjectContributionServiceOptions {
  codeFileService: CodeFileService;
  runProfileService?: CodeRunProfileService;
  adapterRegistry?: LanguageProjectAdapterRegistry;
}

type MatchedExternalRoot = {
  section: CodePaneExternalLibrarySection;
  root: CodePaneExternalLibraryRoot;
};

export class LanguageProjectContributionService {
  private readonly codeFileService: CodeFileService;
  private readonly runProfileService: CodeRunProfileService | null;
  private readonly adapterRegistry: LanguageProjectAdapterRegistry;
  private readonly externalJarService: ExternalJarService;

  constructor(options: LanguageProjectContributionServiceOptions) {
    this.codeFileService = options.codeFileService;
    this.runProfileService = options.runProfileService ?? null;
    this.adapterRegistry = options.adapterRegistry ?? new LanguageProjectAdapterRegistry();
    this.externalJarService = new ExternalJarService();
  }

  async getExternalLibrarySections(rootPath: string): Promise<CodePaneExternalLibrarySection[]> {
    return await this.adapterRegistry.getExternalLibrarySections(rootPath);
  }

  async getProjectContributions(rootPath: string): Promise<CodePaneProjectContribution[]> {
    return await this.adapterRegistry.getProjectContributions(rootPath);
  }

  async refreshProjectModel(rootPath: string): Promise<CodePaneProjectContribution[]> {
    invalidatePythonProjectInfo(rootPath);
    return await this.getProjectContributions(rootPath);
  }

  async runProjectCommand(rootPath: string, commandId: string): Promise<CodePaneRunSession | null> {
    const command = await this.adapterRegistry.resolveProjectCommand(rootPath, commandId);
    if (!command) {
      throw new Error(`Unknown project command: ${commandId}`);
    }

    if (command.actionType === 'refresh-model') {
      await this.refreshProjectModel(rootPath);
      return null;
    }

    if (command.actionType === 'set-python-interpreter') {
      setPythonInterpreterOverride(rootPath, command.interpreterPath ?? null);
      return null;
    }

    if (!this.runProfileService) {
      throw new Error('CodeRunProfileService not initialized');
    }
    if (!command.command || !command.args || !command.workingDirectory) {
      throw new Error(`Project command ${commandId} is missing execution details`);
    }

    const target = this.runProfileService.registerAdHocTarget({
      rootPath,
      label: command.title,
      detail: command.detail ?? `${command.command} ${command.args.join(' ')}`.trim(),
      kind: command.runKind ?? 'task',
      languageId: command.languageId,
      workingDirectory: command.workingDirectory,
      command: command.command,
      args: command.args,
    });

    return await this.runProfileService.runTarget({
      rootPath,
      targetId: target.id,
    });
  }

  async hasExternalLibraryPath(rootPath: string, targetPath: string): Promise<boolean> {
    if (this.externalJarService.isJarUri(targetPath)) {
      const jarPath = this.externalJarService.getJarUriJarPath(targetPath);
      return jarPath ? (await this.matchExternalRoot(rootPath, jarPath)) !== null : false;
    }

    return (await this.matchExternalRoot(rootPath, targetPath)) !== null;
  }

  async listDirectory(config: CodePaneListDirectoryConfig): Promise<CodePaneTreeEntry[]> {
    const targetPath = config.targetPath;
    if (!targetPath) {
      throw new Error('Missing external library directory path');
    }

    if (this.externalJarService.isJarUri(targetPath)) {
      const parsedJarPath = this.externalJarService.getJarUriJarPath(targetPath);
      if (!parsedJarPath || !await this.matchExternalRoot(config.rootPath, parsedJarPath)) {
        throw new Error('Target jar is outside the workspace and not part of External Libraries');
      }

      return await this.externalJarService.listJarDirectory(targetPath);
    }

    const matchedRoot = await this.matchExternalRoot(config.rootPath, targetPath);
    if (!matchedRoot) {
      throw new Error('Target path is outside the workspace and not part of External Libraries');
    }

    const entries = await this.codeFileService.listDirectoryFromAllowedRoots({
      allowedRootPaths: [matchedRoot.root.path],
      targetPath,
      includeHidden: config.includeHidden,
    });

    return await Promise.all(entries.map(async (entry) => {
      if (entry.type !== 'file' || !this.externalJarService.isJarFilePath(entry.path)) {
        return entry;
      }

      const jarPath = await this.externalJarService.resolveBrowsableJarPath(entry.path);
      return {
        ...entry,
        path: this.externalJarService.createJarUri(jarPath),
        type: 'directory' as const,
        hasChildren: true,
      };
    }));
  }

  async readFile(config: CodePaneReadFileConfig): Promise<CodePaneReadFileResult> {
    if (this.externalJarService.isJarUri(config.filePath)) {
      const parsedJarPath = this.externalJarService.getJarUriJarPath(config.filePath);
      if (!parsedJarPath || !await this.matchExternalRoot(config.rootPath, parsedJarPath)) {
        throw new Error('Target jar is outside the workspace and not part of External Libraries');
      }

      return await this.externalJarService.readJarFile(config.filePath);
    }

    const matchedRoot = await this.matchExternalRoot(config.rootPath, config.filePath);
    if (!matchedRoot) {
      throw new Error('Target path is outside the workspace and not part of External Libraries');
    }

    const readResult = await this.codeFileService.readFileFromAllowedRoots({
      allowedRootPaths: [matchedRoot.root.path],
      filePath: config.filePath,
    });
    const relativePath = normalizeDisplayPath(path.relative(matchedRoot.root.path, config.filePath));

    return {
      ...readResult,
      readOnly: true,
      displayPath: path.posix.join(
        matchedRoot.section.label,
        formatLanguageLabel(matchedRoot.section.languageId),
        matchedRoot.root.label,
        relativePath || path.basename(config.filePath),
      ),
    };
  }

  private async matchExternalRoot(rootPath: string, targetPath: string): Promise<MatchedExternalRoot | null> {
    const resolvedTargetPath = path.resolve(targetPath);
    const externalLibrarySections = await this.getExternalLibrarySections(rootPath);

    for (const section of externalLibrarySections) {
      for (const root of section.roots) {
        if (isPathWithin(root.path, resolvedTargetPath)) {
          return {
            section,
            root,
          };
        }
      }
    }

    return null;
  }
}

function isPathWithin(parentPath: string, candidatePath: string): boolean {
  const relativePath = path.relative(parentPath, candidatePath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function normalizeDisplayPath(value: string): string {
  return value.split(path.sep).join('/').replace(/^\/+/, '');
}

function formatLanguageLabel(languageId: string): string {
  switch (languageId) {
    case 'java':
      return 'Java';
    case 'python':
      return 'Python';
    case 'go':
      return 'Go';
    default:
      return languageId ? `${languageId.slice(0, 1).toUpperCase()}${languageId.slice(1)}` : 'Language';
  }
}
