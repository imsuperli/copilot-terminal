import { randomUUID } from 'crypto';
import path from 'path';
import fg from 'fast-glob';
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

  private async storeTextEditPreview(
    rootPath: string,
    edits: CodePaneTextEdit[],
    title: string,
    warnings?: string[],
  ): Promise<CodePanePreviewChangeSet> {
    const previewId = randomUUID();
    const changeSet = await this.previewService.buildTextEditPreview({
      previewId,
      rootPath,
      title,
      source: 'refactor',
      createdAt: this.now(),
      edits,
      warnings,
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
    const { edits: extraEdits, warnings } = operation === 'delete'
      ? {
          edits: [] as CodePaneTextEdit[],
          warnings: await this.buildSafeDeleteWarnings(resolvedRootPath, resolvedSourcePath),
        }
      : await this.buildPathRefactorEdits(resolvedRootPath, operation, resolvedSourcePath, resolvedTargetPath);
    const changeSet = await this.previewService.buildPathPreview({
      previewId,
      title: buildPathOperationTitle(operation, resolvedSourcePath, resolvedTargetPath),
      source: 'refactor',
      createdAt: this.now(),
      description: getPathOperationDescription(operation, resolvedSourcePath, resolvedTargetPath),
      operation,
      sourcePath: resolvedSourcePath,
      targetPath: resolvedTargetPath,
      extraEdits,
      warnings,
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

    for (const fileChange of plan.changeSet.files) {
      if (fileChange.kind === 'modify') {
        await writeFileContent(fileChange.filePath, fileChange.afterContent);
        continue;
      }

      if ((fileChange.kind === 'rename' || fileChange.kind === 'move') && fileChange.targetFilePath) {
        if (fileChange.afterContent !== fileChange.beforeContent || fileChange.edits.length > 0) {
          await writeFileContent(fileChange.targetFilePath, fileChange.afterContent);
        }
      }
    }
  }

  private async buildPathRefactorEdits(
    rootPath: string,
    operation: Exclude<PathPlan['operation'], 'delete'>,
    sourcePath: string,
    targetPath: string | undefined,
  ): Promise<{ edits: CodePaneTextEdit[]; warnings: string[] }> {
    if (!targetPath) {
      return {
        edits: [],
        warnings: [],
      };
    }

    const sourceStats = await fs.stat(sourcePath).catch(() => null);
    if (!sourceStats) {
      return {
        edits: [],
        warnings: [],
      };
    }

    if (sourceStats.isDirectory()) {
      const javaPackageSource = getJavaPackageInfo(sourcePath);
      const javaPackageTarget = getJavaPackageInfo(targetPath);
      if (!javaPackageSource || !javaPackageTarget) {
        return {
          edits: [],
          warnings: [],
        };
      }

      return await this.buildJavaPackageMoveEdits(rootPath, javaPackageSource, javaPackageTarget);
    }

    const javaFileSource = getJavaFileInfo(sourcePath);
    const javaFileTarget = getJavaFileInfo(targetPath);
    if (!javaFileSource || !javaFileTarget) {
      return {
        edits: [],
        warnings: [],
      };
    }

    return await this.buildJavaFileMoveEdits(rootPath, javaFileSource, javaFileTarget);
  }

  private async buildJavaFileMoveEdits(
    rootPath: string,
    sourceInfo: JavaFileInfo,
    targetInfo: JavaFileInfo,
  ): Promise<{ edits: CodePaneTextEdit[]; warnings: string[] }> {
    const edits: CodePaneTextEdit[] = [];
    const warnings: string[] = [];
    const movedFileContent = await readTextContent(sourceInfo.filePath);
    let nextMovedFileContent = movedFileContent;

    if (sourceInfo.packageName !== targetInfo.packageName) {
      nextMovedFileContent = rewriteJavaPackageDeclaration(nextMovedFileContent, targetInfo.packageName);
      warnings.push(`Verify package-private references for ${sourceInfo.typeName} after moving from ${sourceInfo.packageName} to ${targetInfo.packageName}.`);
    }

    if (sourceInfo.typeName !== targetInfo.typeName) {
      nextMovedFileContent = rewriteJavaPrimaryTypeName(nextMovedFileContent, sourceInfo.typeName, targetInfo.typeName);
      warnings.push(`Verify simple type references after renaming ${sourceInfo.typeName} to ${targetInfo.typeName}.`);
    }

    const movedFileEdit = createFullFileReplacementEdit(targetInfo.filePath, movedFileContent, nextMovedFileContent);
    if (movedFileEdit) {
      edits.push(movedFileEdit);
    }

    const workspaceFiles = await listWorkspaceTextFiles(rootPath);
    const oldQualifiedName = sourceInfo.qualifiedName;
    const newQualifiedName = targetInfo.qualifiedName;

    for (const filePath of workspaceFiles) {
      if (filePath === sourceInfo.filePath) {
        continue;
      }

      const currentContent = await readTextContent(filePath);
      if (!currentContent) {
        continue;
      }

      const nextContent = replaceAllLiteral(currentContent, oldQualifiedName, newQualifiedName);
      const edit = createFullFileReplacementEdit(filePath, currentContent, nextContent);
      if (edit) {
        edits.push(edit);
      }
    }

    return {
      edits,
      warnings: uniqueStrings(warnings),
    };
  }

  private async buildJavaPackageMoveEdits(
    rootPath: string,
    sourceInfo: JavaPackageInfo,
    targetInfo: JavaPackageInfo,
  ): Promise<{ edits: CodePaneTextEdit[]; warnings: string[] }> {
    const edits: CodePaneTextEdit[] = [];
    const warnings = [
      `Verify package-private references after moving package ${sourceInfo.packageName} to ${targetInfo.packageName}.`,
    ];
    const sourceFiles = await listPathFiles(sourceInfo.directoryPath);
    const sourceFileSet = new Set(sourceFiles);

    for (const filePath of sourceFiles) {
      if (!filePath.endsWith('.java')) {
        continue;
      }

      const currentContent = await readTextContent(filePath);
      const packageInfo = getJavaFileInfo(filePath);
      if (!packageInfo) {
        continue;
      }

      const packageSuffix = packageInfo.packageName.slice(sourceInfo.packageName.length);
      const nextPackageName = `${targetInfo.packageName}${packageSuffix}`;
      const targetFilePath = path.join(targetInfo.directoryPath, path.relative(sourceInfo.directoryPath, filePath));
      const nextContent = rewriteJavaPackageDeclaration(currentContent, nextPackageName);
      const edit = createFullFileReplacementEdit(targetFilePath, currentContent, nextContent);
      if (edit) {
        edits.push(edit);
      }
    }

    const workspaceFiles = await listWorkspaceTextFiles(rootPath);
    for (const filePath of workspaceFiles) {
      if (sourceFileSet.has(filePath)) {
        continue;
      }

      const currentContent = await readTextContent(filePath);
      if (!currentContent) {
        continue;
      }

      const nextContent = replaceAllLiteral(currentContent, `${sourceInfo.packageName}.`, `${targetInfo.packageName}.`);
      const edit = createFullFileReplacementEdit(filePath, currentContent, nextContent);
      if (edit) {
        edits.push(edit);
      }
    }

    return {
      edits,
      warnings: uniqueStrings(warnings),
    };
  }

  private async buildSafeDeleteWarnings(rootPath: string, sourcePath: string): Promise<string[]> {
    const deletedFilePaths = new Set(await listPathFiles(sourcePath));
    if (deletedFilePaths.size === 0) {
      deletedFilePaths.add(sourcePath);
    }

    const workspaceFiles = await listWorkspaceTextFiles(rootPath);
    const warnings: string[] = [];

    for (const deletedFilePath of deletedFilePaths) {
      const javaFileInfo = getJavaFileInfo(deletedFilePath);
      if (!javaFileInfo) {
        continue;
      }

      let referenceCount = 0;
      for (const filePath of workspaceFiles) {
        if (deletedFilePaths.has(filePath)) {
          continue;
        }

        const content = await readTextContent(filePath);
        if (
          content.includes(`import ${javaFileInfo.qualifiedName};`)
          || content.includes(javaFileInfo.qualifiedName)
          || content.includes(`new ${javaFileInfo.typeName}(`)
        ) {
          referenceCount += 1;
        }
      }

      if (referenceCount > 0) {
        warnings.push(`${referenceCount} workspace files still reference ${javaFileInfo.qualifiedName}.`);
      }
    }

    return uniqueStrings(warnings);
  }
}

type JavaPackageInfo = {
  directoryPath: string;
  sourceRootPath: string;
  packageName: string;
};

type JavaFileInfo = JavaPackageInfo & {
  filePath: string;
  typeName: string;
  qualifiedName: string;
};

const WORKSPACE_TEXT_FILE_GLOBS = ['**/*'];
const WORKSPACE_IGNORE_GLOBS = [
  '**/.git/**',
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/target/**',
  '**/.gradle/**',
  '**/.idea/**',
];
const TEXT_FILE_EXTENSIONS = new Set([
  '.java',
  '.xml',
  '.gradle',
  '.groovy',
  '.kts',
  '.properties',
  '.yml',
  '.yaml',
  '.json',
  '.txt',
  '.md',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.py',
  '.go',
  '.rs',
]);

function getJavaPackageInfo(directoryPath: string): JavaPackageInfo | null {
  const normalizedPath = directoryPath.split(path.sep).join('/');
  const match = normalizedPath.match(/^(.*\/src\/(?:main|test)\/java)\/(.+)$/);
  if (!match) {
    return null;
  }

  return {
    directoryPath,
    sourceRootPath: match[1]!.split('/').join(path.sep),
    packageName: match[2]!.split('/').join('.'),
  };
}

function getJavaFileInfo(filePath: string): JavaFileInfo | null {
  if (!filePath.endsWith('.java')) {
    return null;
  }

  const packageInfo = getJavaPackageInfo(path.dirname(filePath));
  if (!packageInfo) {
    return null;
  }

  const typeName = path.basename(filePath, '.java');
  return {
    ...packageInfo,
    filePath,
    typeName,
    qualifiedName: `${packageInfo.packageName}.${typeName}`,
  };
}

async function listWorkspaceTextFiles(rootPath: string): Promise<string[]> {
  const candidatePaths = await fg(WORKSPACE_TEXT_FILE_GLOBS, {
    cwd: rootPath,
    absolute: true,
    onlyFiles: true,
    dot: true,
    ignore: [...WORKSPACE_IGNORE_GLOBS],
  });

  return candidatePaths.filter((filePath) => {
    const extension = path.extname(filePath).toLowerCase();
    return TEXT_FILE_EXTENSIONS.has(extension) || path.basename(filePath) === 'module-info.java';
  });
}

async function listPathFiles(targetPath: string): Promise<string[]> {
  const stats = await fs.stat(targetPath).catch(() => null);
  if (!stats) {
    return [];
  }

  if (stats.isFile()) {
    return [targetPath];
  }

  const candidatePaths = await fg(WORKSPACE_TEXT_FILE_GLOBS, {
    cwd: targetPath,
    absolute: true,
    onlyFiles: true,
    dot: true,
    ignore: [...WORKSPACE_IGNORE_GLOBS],
  });

  return candidatePaths;
}

async function readTextContent(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return '';
  }
}

async function writeFileContent(filePath: string, content: string): Promise<void> {
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, 'utf-8');
}

function createFullFileReplacementEdit(
  filePath: string,
  beforeContent: string,
  afterContent: string,
): CodePaneTextEdit | null {
  if (beforeContent === afterContent) {
    return null;
  }

  const lineCount = beforeContent === '' ? 1 : beforeContent.split('\n').length;
  const lastLine = beforeContent.split('\n').at(-1) ?? '';
  return {
    filePath,
    range: {
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: lineCount,
      endColumn: lastLine.length + 1,
    },
    newText: afterContent,
  };
}

function rewriteJavaPackageDeclaration(content: string, nextPackageName: string): string {
  const packagePattern = /^\s*package\s+[\w.]+\s*;\s*$/m;
  const packageLine = `package ${nextPackageName};`;

  if (packagePattern.test(content)) {
    return content.replace(packagePattern, packageLine);
  }

  return `${packageLine}\n\n${content}`;
}

function rewriteJavaPrimaryTypeName(content: string, currentTypeName: string, nextTypeName: string): string {
  let nextContent = content.replace(
    new RegExp(`\\b(class|interface|enum|record)\\s+${escapeRegExp(currentTypeName)}\\b`),
    `$1 ${nextTypeName}`,
  );
  nextContent = nextContent.replace(
    new RegExp(`\\b${escapeRegExp(currentTypeName)}\\s*\\(`, 'g'),
    `${nextTypeName}(`,
  );
  return nextContent;
}

function replaceAllLiteral(content: string, currentValue: string, nextValue: string): string {
  if (!currentValue || currentValue === nextValue || !content.includes(currentValue)) {
    return content;
  }

  return content.split(currentValue).join(nextValue);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
