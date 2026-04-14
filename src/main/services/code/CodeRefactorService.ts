import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs-extra';
import type {
  CodePaneApplyRefactorConfig,
  CodePanePrepareRefactorConfig,
  CodePanePreviewChangeSet,
  CodePaneTextEdit,
} from '../../../shared/types/electron-api';
import type { Workspace } from '../../types/workspace';
import { CodeFileService } from './CodeFileService';
import { CodeRefactorPreviewService } from './CodeRefactorPreviewService';
import { isPathWithin } from './codeGitUtils';
import { LanguageFeatureService } from '../language/LanguageFeatureService';

type TextEditPlan = {
  type: 'text-edits';
  rootPath: string;
  changeSet: CodePanePreviewChangeSet;
  edits: CodePaneTextEdit[];
};

type PathPlan = {
  type: 'path';
  rootPath: string;
  changeSet: CodePanePreviewChangeSet;
  operation: 'rename' | 'move' | 'delete';
  sourcePath: string;
  targetPath?: string;
};

type RefactorPlan = TextEditPlan | PathPlan;

function buildPathOperationTitle(
  operation: PathPlan['operation'],
  sourcePath: string,
  targetPath?: string,
): string {
  switch (operation) {
    case 'rename':
      return `Rename ${path.basename(sourcePath)} to ${path.basename(targetPath ?? sourcePath)}`;
    case 'move':
      return `Move ${path.basename(sourcePath)} to ${targetPath ?? sourcePath}`;
    case 'delete':
    default:
      return `Safe delete ${path.basename(sourcePath)}`;
  }
}

function getPathOperationDescription(
  operation: PathPlan['operation'],
  sourcePath: string,
  targetPath?: string,
): string {
  switch (operation) {
    case 'rename':
      return `${sourcePath} -> ${targetPath ?? sourcePath}`;
    case 'move':
      return `${sourcePath} -> ${targetPath ?? sourcePath}`;
    case 'delete':
    default:
      return `Remove ${sourcePath}`;
  }
}

export interface CodeRefactorServiceOptions {
  codeFileService: CodeFileService;
  languageFeatureService: LanguageFeatureService;
  previewService?: CodeRefactorPreviewService;
  now?: () => string;
}

export class CodeRefactorService {
  private readonly previewPlans = new Map<string, RefactorPlan>();

  private readonly previewService: CodeRefactorPreviewService;

  private readonly now: () => string;

  constructor(private readonly options: CodeRefactorServiceOptions) {
    this.previewService = options.previewService ?? new CodeRefactorPreviewService();
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async prepareRefactor(config: CodePanePrepareRefactorConfig, workspace: Workspace | null): Promise<CodePanePreviewChangeSet> {
    switch (config.kind) {
      case 'rename-symbol': {
        const edits = await this.options.languageFeatureService.renameSymbol({
          rootPath: config.rootPath,
          filePath: config.filePath,
          language: config.language,
          position: config.position,
          newName: config.newName,
        }, workspace);
        return await this.storeTextEditPreview(config.rootPath, edits, `Rename symbol to ${config.newName}`);
      }
      case 'code-action': {
        const edits = await this.options.languageFeatureService.runCodeAction({
          rootPath: config.rootPath,
          filePath: config.filePath,
          language: config.language,
          actionId: config.actionId,
        }, workspace);
        return await this.storeTextEditPreview(config.rootPath, edits, config.title ?? 'Preview refactor');
      }
      case 'rename-path':
      case 'move-path': {
        const operation = config.kind === 'rename-path' ? 'rename' : 'move';
        return await this.storePathPreview(config.rootPath, operation, config.filePath, config.nextFilePath);
      }
      case 'safe-delete':
      default:
        return await this.storePathPreview(config.rootPath, 'delete', config.filePath);
    }
  }

  async applyRefactor(config: CodePaneApplyRefactorConfig): Promise<CodePanePreviewChangeSet> {
    const plan = this.previewPlans.get(config.previewId);
    if (!plan) {
      throw new Error(`Unknown refactor preview: ${config.previewId}`);
    }

    if (plan.type === 'text-edits') {
      await this.applyTextEdits(plan);
    } else {
      await this.applyPathOperation(plan);
    }

    this.previewPlans.delete(config.previewId);
    return plan.changeSet;
  }

  private async storeTextEditPreview(rootPath: string, edits: CodePaneTextEdit[], title: string): Promise<CodePanePreviewChangeSet> {
    const previewId = randomUUID();
    const changeSet = await this.previewService.buildTextEditPreview({
      previewId,
      rootPath,
      title,
      source: 'refactor',
      createdAt: this.now(),
      edits,
    });

    this.previewPlans.set(previewId, {
      type: 'text-edits',
      rootPath,
      changeSet,
      edits,
    });
    return changeSet;
  }

  private async storePathPreview(
    rootPath: string,
    operation: PathPlan['operation'],
    sourcePath: string,
    targetPath?: string,
  ): Promise<CodePanePreviewChangeSet> {
    const resolvedRootPath = path.resolve(rootPath);
    const resolvedSourcePath = path.resolve(sourcePath);
    if (!isPathWithin(resolvedRootPath, resolvedSourcePath)) {
      throw new Error('Refactor target is outside the code pane root');
    }

    const resolvedTargetPath = targetPath ? path.resolve(targetPath) : undefined;
    if (resolvedTargetPath && !isPathWithin(resolvedRootPath, resolvedTargetPath)) {
      throw new Error('Refactor destination is outside the code pane root');
    }

    const previewId = randomUUID();
    const changeSet = await this.previewService.buildPathPreview({
      previewId,
      title: buildPathOperationTitle(operation, resolvedSourcePath, resolvedTargetPath),
      source: 'refactor',
      createdAt: this.now(),
      description: getPathOperationDescription(operation, resolvedSourcePath, resolvedTargetPath),
      operation,
      sourcePath: resolvedSourcePath,
      targetPath: resolvedTargetPath,
    });

    this.previewPlans.set(previewId, {
      type: 'path',
      rootPath: resolvedRootPath,
      changeSet,
      operation,
      sourcePath: resolvedSourcePath,
      targetPath: resolvedTargetPath,
    });
    return changeSet;
  }

  private async applyTextEdits(plan: TextEditPlan): Promise<void> {
    const editsByFilePath = new Map<string, CodePaneTextEdit[]>();
    for (const edit of plan.edits) {
      const fileEdits = editsByFilePath.get(edit.filePath) ?? [];
      fileEdits.push(edit);
      editsByFilePath.set(edit.filePath, fileEdits);
    }

    for (const fileChange of plan.changeSet.files) {
      const readResult = await this.options.codeFileService.readFile({
        rootPath: plan.rootPath,
        filePath: fileChange.filePath,
      });
      await this.options.codeFileService.writeFile({
        rootPath: plan.rootPath,
        filePath: fileChange.filePath,
        content: fileChange.afterContent,
        expectedMtimeMs: readResult.mtimeMs,
      });
    }
  }

  private async applyPathOperation(plan: PathPlan): Promise<void> {
    if (plan.operation === 'delete') {
      await fs.remove(plan.sourcePath);
      return;
    }

    if (!plan.targetPath) {
      throw new Error('Refactor target path is missing');
    }

    await fs.ensureDir(path.dirname(plan.targetPath));
    await fs.move(plan.sourcePath, plan.targetPath, { overwrite: true });
  }
}
