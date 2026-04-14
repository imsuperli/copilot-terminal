import type {
  CodePaneGitHistoryConfig,
  CodePaneGitHistoryEntry,
  CodePaneGitHistoryResult,
} from '../../../shared/types/electron-api';
import {
  execFileAsync,
  getRepoRelativePath,
  resolveRepoContext,
} from './codeGitUtils';

const HISTORY_RECORD_SEPARATOR = '\x1e';
const HISTORY_FIELD_SEPARATOR = '\x1f';

function parseHistory(stdout: string, scope: CodePaneGitHistoryEntry['scope']): CodePaneGitHistoryEntry[] {
  return stdout
    .split(HISTORY_RECORD_SEPARATOR)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [commitSha = '', refsRaw = '', subject = '', author = '', email = '', timestampRaw = '0'] = entry.split(HISTORY_FIELD_SEPARATOR);
      return {
        commitSha,
        shortSha: commitSha.slice(0, 7),
        subject,
        author,
        email,
        timestamp: Number(timestampRaw) || 0,
        refs: refsRaw
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
        scope,
      } satisfies CodePaneGitHistoryEntry;
    });
}

export class CodeGitHistoryService {
  async getHistory(config: CodePaneGitHistoryConfig): Promise<CodePaneGitHistoryResult> {
    const repoContext = await resolveRepoContext(config.rootPath);
    if (!repoContext) {
      return {
        scope: 'repository',
        entries: [],
      };
    }

    const limit = Math.max(1, Math.min(config.limit ?? 30, 100));
    if (config.filePath && config.lineNumber) {
      const lineHistory = await this.getLineHistory(repoContext.repoRootPath, repoContext, config.filePath, config.lineNumber, limit);
      return {
        scope: 'line',
        targetFilePath: config.filePath,
        targetLineNumber: config.lineNumber,
        entries: lineHistory,
      };
    }

    if (config.filePath) {
      const fileHistory = await this.getFileHistory(repoContext.repoRootPath, repoContext, config.filePath, limit);
      return {
        scope: 'file',
        targetFilePath: config.filePath,
        entries: fileHistory,
      };
    }

    const repositoryHistory = await this.getRepositoryHistory(repoContext.repoRootPath, limit);
    return {
      scope: 'repository',
      entries: repositoryHistory,
    };
  }

  private async getRepositoryHistory(repoRootPath: string, limit: number): Promise<CodePaneGitHistoryEntry[]> {
    const { stdout } = await execFileAsync(
      'git',
      [
        '-C',
        repoRootPath,
        'log',
        `-n${String(limit)}`,
        '--decorate=short',
        `--pretty=format:%H${HISTORY_FIELD_SEPARATOR}%D${HISTORY_FIELD_SEPARATOR}%s${HISTORY_FIELD_SEPARATOR}%an${HISTORY_FIELD_SEPARATOR}%ae${HISTORY_FIELD_SEPARATOR}%ct${HISTORY_RECORD_SEPARATOR}`,
      ],
      { encoding: 'utf-8', maxBuffer: 16 * 1024 * 1024 },
    );
    return parseHistory(stdout as string, 'file');
  }

  private async getFileHistory(
    repoRootPath: string,
    repoContext: NonNullable<Awaited<ReturnType<typeof resolveRepoContext>>>,
    filePath: string,
    limit: number,
  ): Promise<CodePaneGitHistoryEntry[]> {
    const relativeFilePath = getRepoRelativePath(repoContext, filePath);
    if (!relativeFilePath) {
      return [];
    }

    const { stdout } = await execFileAsync(
      'git',
      [
        '-C',
        repoRootPath,
        'log',
        '--follow',
        `-n${String(limit)}`,
        '--decorate=short',
        `--pretty=format:%H${HISTORY_FIELD_SEPARATOR}%D${HISTORY_FIELD_SEPARATOR}%s${HISTORY_FIELD_SEPARATOR}%an${HISTORY_FIELD_SEPARATOR}%ae${HISTORY_FIELD_SEPARATOR}%ct${HISTORY_RECORD_SEPARATOR}`,
        '--',
        relativeFilePath,
      ],
      { encoding: 'utf-8', maxBuffer: 16 * 1024 * 1024 },
    );
    return parseHistory(stdout as string, 'file').map((entry) => ({
      ...entry,
      filePath,
    }));
  }

  private async getLineHistory(
    repoRootPath: string,
    repoContext: NonNullable<Awaited<ReturnType<typeof resolveRepoContext>>>,
    filePath: string,
    lineNumber: number,
    limit: number,
  ): Promise<CodePaneGitHistoryEntry[]> {
    const relativeFilePath = getRepoRelativePath(repoContext, filePath);
    if (!relativeFilePath) {
      return [];
    }

    try {
      const { stdout } = await execFileAsync(
        'git',
        [
          '-C',
          repoRootPath,
          'log',
          `-L${lineNumber},${lineNumber}:${relativeFilePath}`,
          '--no-patch',
          `-n${String(limit)}`,
          '--decorate=short',
          `--pretty=format:%H${HISTORY_FIELD_SEPARATOR}%D${HISTORY_FIELD_SEPARATOR}%s${HISTORY_FIELD_SEPARATOR}%an${HISTORY_FIELD_SEPARATOR}%ae${HISTORY_FIELD_SEPARATOR}%ct${HISTORY_RECORD_SEPARATOR}`,
        ],
        { encoding: 'utf-8', maxBuffer: 16 * 1024 * 1024 },
      );
      return parseHistory(stdout as string, 'line').map((entry) => ({
        ...entry,
        filePath,
        lineNumber,
      }));
    } catch {
      return (await this.getFileHistory(repoRootPath, repoContext, filePath, limit)).map((entry) => ({
        ...entry,
        scope: 'line',
        lineNumber,
      }));
    }
  }
}
