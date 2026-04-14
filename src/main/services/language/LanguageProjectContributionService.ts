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

  constructor(options: LanguageProjectContributionServiceOptions) {
    this.codeFileService = options.codeFileService;
    this.runProfileService = options.runProfileService ?? null;
    this.adapterRegistry = options.adapterRegistry ?? new LanguageProjectAdapterRegistry();
  }

  async getExternalLibrarySections(rootPath: string): Promise<CodePaneExternalLibrarySection[]> {
    return await this.adapterRegistry.getExternalLibrarySections(rootPath);
  }

  async getProjectContributions(rootPath: string): Promise<CodePaneProjectContribution[]> {
    return await this.adapterRegistry.getProjectContributions(rootPath);
  }

  async refreshProjectModel(rootPath: string): Promise<CodePaneProjectContribution[]> {
    return await this.getProjectContributions(rootPath);
  }

  async runProjectCommand(rootPath: string, commandId: string): Promise<CodePaneRunSession> {
    if (!this.runProfileService) {
      throw new Error('CodeRunProfileService not initialized');
    }

    const command = await this.adapterRegistry.resolveProjectCommand(rootPath, commandId);
    if (!command) {
      throw new Error(`Unknown project command: ${commandId}`);
    }

    const target = this.runProfileService.registerAdHocTarget({
      rootPath,
      label: command.title,
      detail: command.detail ?? `${command.command} ${command.args.join(' ')}`.trim(),
      kind: command.kind ?? 'task',
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
    return (await this.matchExternalRoot(rootPath, targetPath)) !== null;
  }

  async listDirectory(config: CodePaneListDirectoryConfig): Promise<CodePaneTreeEntry[]> {
    const targetPath = config.targetPath;
    if (!targetPath) {
      throw new Error('Missing external library directory path');
    }

    const matchedRoot = await this.matchExternalRoot(config.rootPath, targetPath);
    if (!matchedRoot) {
      throw new Error('Target path is outside the workspace and not part of External Libraries');
    }

    return await this.codeFileService.listDirectoryFromAllowedRoots({
      allowedRootPaths: [matchedRoot.root.path],
      targetPath,
      includeHidden: config.includeHidden,
    });
  }

  async readFile(config: CodePaneReadFileConfig): Promise<CodePaneReadFileResult> {
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
