import type {
  CodePaneGitBlameConfig,
  CodePaneGitBlameLine,
} from '../../../shared/types/electron-api';
import {
  execFileAsync,
  getRepoRelativePath,
  resolveRepoContext,
} from './codeGitUtils';

export class CodeGitBlameService {
  async getBlame(config: CodePaneGitBlameConfig): Promise<CodePaneGitBlameLine[]> {
    const repoContext = await resolveRepoContext(config.rootPath);
    if (!repoContext) {
      return [];
    }

    const relativeFilePath = getRepoRelativePath(repoContext, config.filePath);
    if (!relativeFilePath) {
      return [];
    }

    const startLineNumber = Math.max(config.startLineNumber ?? 1, 1);
    const endLineNumber = Math.max(config.endLineNumber ?? startLineNumber, startLineNumber);
    const { stdout } = await execFileAsync(
      'git',
      [
        '-C',
        repoContext.repoRootPath,
        'blame',
        '--line-porcelain',
        `-L${startLineNumber},${endLineNumber}`,
        '--',
        relativeFilePath,
      ],
      { encoding: 'utf-8', maxBuffer: 16 * 1024 * 1024 },
    );

    return parseBlame(stdout as string);
  }
}

function parseBlame(stdout: string): CodePaneGitBlameLine[] {
  const lines = stdout.split('\n');
  const results: CodePaneGitBlameLine[] = [];
  let index = 0;

  while (index < lines.length) {
    const headerLine = lines[index]?.trim();
    if (!headerLine) {
      index += 1;
      continue;
    }

    const [commitSha = '', _originalLineNumber, finalLineNumberRaw = '0'] = headerLine.split(' ');
    const finalLineNumber = Number(finalLineNumberRaw) || 0;
    index += 1;

    let author = '';
    let summary = '';
    let timestamp = 0;
    let text = '';

    while (index < lines.length) {
      const currentLine = lines[index] ?? '';
      if (currentLine.startsWith('\t')) {
        text = currentLine.slice(1);
        index += 1;
        break;
      }

      if (!currentLine.trim()) {
        index += 1;
        continue;
      }

      if (currentLine.startsWith('author ')) {
        author = currentLine.slice('author '.length);
      } else if (currentLine.startsWith('author-time ')) {
        timestamp = Number(currentLine.slice('author-time '.length)) || 0;
      } else if (currentLine.startsWith('summary ')) {
        summary = currentLine.slice('summary '.length);
      }
      index += 1;
    }

    results.push({
      lineNumber: finalLineNumber,
      commitSha,
      shortSha: commitSha.slice(0, 7),
      author,
      summary,
      timestamp,
      text,
    });
  }

  return results;
}
