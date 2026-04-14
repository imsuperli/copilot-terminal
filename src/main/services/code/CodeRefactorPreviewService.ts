import path from 'path';
import { promises as fsPromises } from 'fs';
import type {
  CodePanePreviewChangeSet,
  CodePanePreviewFileChange,
  CodePanePreviewStats,
  CodePaneTextEdit,
} from '../../../shared/types/electron-api';

function compareTextEditsDescending(left: CodePaneTextEdit, right: CodePaneTextEdit): number {
  if (left.range.endLineNumber !== right.range.endLineNumber) {
    return right.range.endLineNumber - left.range.endLineNumber;
  }

  if (left.range.endColumn !== right.range.endColumn) {
    return right.range.endColumn - left.range.endColumn;
  }

  if (left.range.startLineNumber !== right.range.startLineNumber) {
    return right.range.startLineNumber - left.range.startLineNumber;
  }

  return right.range.startColumn - left.range.startColumn;
}

function getOffsetAt(content: string, lineNumber: number, column: number): number {
  if (lineNumber <= 1 && column <= 1) {
    return 0;
  }

  let currentLine = 1;
  let currentColumn = 1;
  for (let index = 0; index < content.length; index += 1) {
    if (currentLine === lineNumber && currentColumn === column) {
      return index;
    }

    if (content[index] === '\n') {
      currentLine += 1;
      currentColumn = 1;
    } else {
      currentColumn += 1;
    }
  }

  return content.length;
}

function applyTextEditsToContent(content: string, edits: CodePaneTextEdit[]): string {
  return edits
    .slice()
    .sort(compareTextEditsDescending)
    .reduce((currentContent, edit) => {
      const startOffset = getOffsetAt(currentContent, edit.range.startLineNumber, edit.range.startColumn);
      const endOffset = getOffsetAt(currentContent, edit.range.endLineNumber, edit.range.endColumn);
      return `${currentContent.slice(0, startOffset)}${edit.newText}${currentContent.slice(endOffset)}`;
    }, content);
}

function detectLanguage(filePath: string): string {
  const baseName = path.basename(filePath).toLowerCase();
  const extension = path.extname(baseName).toLowerCase();

  if (baseName === 'dockerfile') return 'dockerfile';
  if (baseName === '.gitignore') return 'plaintext';
  if (baseName === '.env' || baseName.startsWith('.env.')) return 'shell';

  switch (extension) {
    case '.ts':
    case '.tsx':
      return 'typescript';
    case '.js':
    case '.jsx':
      return 'javascript';
    case '.json':
      return 'json';
    case '.css':
    case '.scss':
    case '.less':
      return 'css';
    case '.html':
    case '.htm':
      return 'html';
    case '.md':
      return 'markdown';
    case '.py':
      return 'python';
    case '.sh':
    case '.bash':
    case '.zsh':
      return 'shell';
    case '.yml':
    case '.yaml':
      return 'yaml';
    case '.xml':
      return 'xml';
    case '.java':
      return 'java';
    case '.go':
      return 'go';
    case '.rs':
      return 'rust';
    default:
      return 'plaintext';
  }
}

function createSyntheticPreviewContent(label: string): string {
  return `# ${label}\n`;
}

async function readPreviewContent(filePath: string): Promise<string> {
  try {
    const buffer = await fsPromises.readFile(filePath);
    if (buffer.includes(0)) {
      return '[binary file omitted]';
    }

    return buffer.toString('utf-8');
  } catch {
    return '';
  }
}

async function collectDescendantFilePaths(targetPath: string): Promise<string[]> {
  let stats;
  try {
    stats = await fsPromises.stat(targetPath);
  } catch {
    return [];
  }

  if (!stats.isDirectory()) {
    return [targetPath];
  }

  const filePaths: string[] = [];
  const stack = [targetPath];
  while (stack.length > 0) {
    const currentPath = stack.pop();
    if (!currentPath) {
      continue;
    }

    const entries = await fsPromises.readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
      } else if (entry.isFile()) {
        filePaths.push(entryPath);
      }
    }
  }

  return filePaths.sort((left, right) => left.localeCompare(right));
}

export class CodeRefactorPreviewService {
  async buildTextEditPreview(config: {
    previewId: string;
    title: string;
    source: CodePanePreviewChangeSet['source'];
    rootPath: string;
    createdAt: string;
    description?: string;
    edits: CodePaneTextEdit[];
    warnings?: string[];
  }): Promise<CodePanePreviewChangeSet> {
    const files = await buildTextEditFileChanges(config.previewId, config.edits);

    return {
      id: config.previewId,
      title: config.title,
      source: config.source,
      description: config.description,
      createdAt: config.createdAt,
      files,
      ...(config.warnings && config.warnings.length > 0 ? { warnings: config.warnings } : {}),
      stats: buildPreviewStats(files),
    };
  }

  async buildPathPreview(config: {
    previewId: string;
    title: string;
    source: CodePanePreviewChangeSet['source'];
    createdAt: string;
    description?: string;
    operation: 'rename' | 'move' | 'delete';
    sourcePath: string;
    targetPath?: string;
    extraEdits?: CodePaneTextEdit[];
    warnings?: string[];
  }): Promise<CodePanePreviewChangeSet> {
    const descendants = await collectDescendantFilePaths(config.sourcePath);
    const filePaths = descendants.length > 0 ? descendants : [config.sourcePath];
    const files: CodePanePreviewFileChange[] = [];

    for (const filePath of filePaths) {
      const relativePath = path.relative(config.sourcePath, filePath);
      const targetFilePath = config.targetPath
        ? path.resolve(config.targetPath, relativePath === '' ? '.' : relativePath)
        : undefined;
      const beforeContent = descendants.length > 0 || filePath !== config.sourcePath
        ? await readPreviewContent(filePath)
        : createSyntheticPreviewContent(path.basename(filePath));

      files.push({
        id: `${config.previewId}:${filePath}`,
        kind: config.operation,
        filePath,
        targetFilePath: targetFilePath && targetFilePath !== filePath ? targetFilePath : undefined,
        language: detectLanguage(filePath),
        beforeContent,
        afterContent: config.operation === 'delete' ? '' : beforeContent,
        edits: [],
      });
    }

    if ((config.extraEdits ?? []).length > 0) {
      const editFiles = await buildTextEditFileChanges(config.previewId, config.extraEdits ?? []);
      const editFilesByPath = new Map(editFiles.map((change) => [change.filePath, change]));
      const mergedFiles = files.map((change) => {
        const mergeKey = change.targetFilePath ?? change.filePath;
        const editChange = editFilesByPath.get(mergeKey);
        if (!editChange) {
          return change;
        }

        editFilesByPath.delete(mergeKey);
        return {
          ...change,
          language: editChange.language,
          afterContent: editChange.afterContent,
          edits: editChange.edits,
        };
      });

      files.length = 0;
      files.push(...mergedFiles, ...Array.from(editFilesByPath.values()));
    }

    return {
      id: config.previewId,
      title: config.title,
      source: config.source,
      description: config.description,
      createdAt: config.createdAt,
      files,
      ...(config.warnings && config.warnings.length > 0 ? { warnings: config.warnings } : {}),
      stats: buildPreviewStats(files),
    };
  }
}

async function buildTextEditFileChanges(
  previewId: string,
  edits: CodePaneTextEdit[],
): Promise<CodePanePreviewFileChange[]> {
  const editsByFilePath = new Map<string, CodePaneTextEdit[]>();
  for (const edit of edits) {
    const fileEdits = editsByFilePath.get(edit.filePath) ?? [];
    fileEdits.push(edit);
    editsByFilePath.set(edit.filePath, fileEdits);
  }

  const files: CodePanePreviewFileChange[] = [];
  for (const [filePath, fileEdits] of editsByFilePath.entries()) {
    const beforeContent = await readPreviewContent(filePath);
    files.push({
      id: `${previewId}:${filePath}`,
      kind: 'modify',
      filePath,
      language: detectLanguage(filePath),
      beforeContent,
      afterContent: applyTextEditsToContent(beforeContent, fileEdits),
      edits: fileEdits,
    });
  }

  return files;
}

function buildPreviewStats(files: CodePanePreviewFileChange[]): CodePanePreviewStats {
  return {
    fileCount: files.length,
    editCount: files.reduce((totalCount, file) => totalCount + file.edits.length, 0),
    renameCount: files.filter((file) => file.kind === 'rename').length,
    moveCount: files.filter((file) => file.kind === 'move').length,
    deleteCount: files.filter((file) => file.kind === 'delete').length,
    modifyCount: files.filter((file) => file.kind === 'modify').length,
  };
}
