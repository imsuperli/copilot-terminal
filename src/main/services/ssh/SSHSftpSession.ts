import { mkdir, readdir as readLocalDirectory } from 'fs/promises';
import { basename, dirname, join, posix as posixPath } from 'path';
import type { FileEntryWithStats, SFTPWrapper } from 'ssh2';
import type { Stats } from 'ssh2';
import type { SSHSftpDirectoryListing, SSHSftpEntry } from '../../../shared/types/ssh';

export interface SSHSftpSessionOptions {
  getWrapper: () => Promise<SFTPWrapper>;
}

export class SSHSftpSession {
  private readonly getWrapper: () => Promise<SFTPWrapper>;
  private homeDirectoryPromise: Promise<string> | null = null;
  private currentDirectoryPromise: Promise<string> | null = null;

  constructor(options: SSHSftpSessionOptions) {
    this.getWrapper = options.getWrapper;
  }

  async listDirectory(targetPath?: string): Promise<SSHSftpDirectoryListing> {
    const wrapper = await this.getWrapper();
    const resolvedPath = await this.resolveExistingPath(wrapper, targetPath ?? '.');
    const entries = await this.readdir(wrapper, resolvedPath);
    const mappedEntries = await Promise.all(entries.map((entry) => this.mapEntry(wrapper, resolvedPath, entry)));

    return {
      path: resolvedPath,
      entries: mappedEntries.sort(compareSftpEntries),
    };
  }

  async downloadFile(remotePath: string, localPath: string): Promise<void> {
    const wrapper = await this.getWrapper();
    const resolvedRemotePath = await this.resolveExistingPath(wrapper, remotePath);
    await this.fastGet(wrapper, resolvedRemotePath, localPath);
  }

  async uploadFiles(remotePath: string, localPaths: string[]): Promise<number> {
    if (localPaths.length === 0) {
      return 0;
    }

    const wrapper = await this.getWrapper();
    const resolvedRemotePath = await this.resolveExistingPath(wrapper, remotePath);

    for (const localPath of localPaths) {
      const remoteFilePath = posixPath.join(resolvedRemotePath, basename(localPath));
      await new Promise<void>((resolve, reject) => {
        wrapper.fastPut(localPath, remoteFilePath, (error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }

    return localPaths.length;
  }

  async uploadDirectory(remotePath: string, localDirectoryPath: string): Promise<number> {
    const wrapper = await this.getWrapper();
    const resolvedRemotePath = await this.resolveExistingPath(wrapper, remotePath);
    const remoteDirectoryPath = posixPath.join(resolvedRemotePath, basename(localDirectoryPath));
    await this.mkdir(wrapper, remoteDirectoryPath);
    return this.uploadDirectoryRecursive(wrapper, remoteDirectoryPath, localDirectoryPath);
  }

  async downloadEntry(remotePath: string, localPath: string): Promise<void> {
    const wrapper = await this.getWrapper();
    await this.downloadEntryRecursive(wrapper, remotePath, localPath);
  }

  async createDirectory(parentPath: string, name: string): Promise<string> {
    const wrapper = await this.getWrapper();
    const resolvedParentPath = await this.resolveExistingPath(wrapper, parentPath);
    const nextPath = posixPath.join(resolvedParentPath, name);
    await this.mkdir(wrapper, nextPath);
    return nextPath;
  }

  async deleteEntry(remotePath: string): Promise<void> {
    const wrapper = await this.getWrapper();
    const resolvedRemotePath = await this.resolveExistingPath(wrapper, remotePath);
    await this.deleteEntryRecursive(wrapper, resolvedRemotePath);
  }

  private async realpath(wrapper: SFTPWrapper, targetPath: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      wrapper.realpath(targetPath, (error, absolutePath) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(absolutePath);
      });
    });
  }

  private async resolveExistingPath(wrapper: SFTPWrapper, targetPath: string): Promise<string> {
    const normalizedTarget = normalizeTargetPath(targetPath);

    if (!normalizedTarget || normalizedTarget === '.') {
      return this.getCurrentDirectory(wrapper);
    }

    if (normalizedTarget === '~') {
      return this.getHomeDirectory(wrapper);
    }

    if (normalizedTarget.startsWith('~/')) {
      const homeDirectory = await this.getHomeDirectory(wrapper);
      const suffix = normalizedTarget.slice(2);
      return posixPath.normalize(posixPath.join(homeDirectory, suffix));
    }

    if (normalizedTarget.startsWith('/')) {
      return this.realpath(wrapper, posixPath.normalize(normalizedTarget));
    }

    const currentDirectory = await this.getCurrentDirectory(wrapper);
    return this.realpath(wrapper, posixPath.normalize(posixPath.join(currentDirectory, normalizedTarget)));
  }

  private async getCurrentDirectory(wrapper: SFTPWrapper): Promise<string> {
    if (!this.currentDirectoryPromise) {
      this.currentDirectoryPromise = this.realpath(wrapper, '.').catch((error) => {
        this.currentDirectoryPromise = null;
        throw error;
      });
    }

    return this.currentDirectoryPromise;
  }

  private async getHomeDirectory(wrapper: SFTPWrapper): Promise<string> {
    if (!this.homeDirectoryPromise) {
      this.homeDirectoryPromise = this.realpath(wrapper, '.').catch((error) => {
        this.homeDirectoryPromise = null;
        throw error;
      });
    }

    return this.homeDirectoryPromise;
  }

  private async readdir(wrapper: SFTPWrapper, targetPath: string): Promise<FileEntryWithStats[]> {
    return new Promise<FileEntryWithStats[]>((resolve, reject) => {
      wrapper.readdir(targetPath, (error, list) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(list);
      });
    });
  }

  private async stat(wrapper: SFTPWrapper, targetPath: string): Promise<Stats> {
    return new Promise<Stats>((resolve, reject) => {
      wrapper.stat(targetPath, (error, stats) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(stats);
      });
    });
  }

  private async lstat(wrapper: SFTPWrapper, targetPath: string): Promise<Stats> {
    return new Promise<Stats>((resolve, reject) => {
      wrapper.lstat(targetPath, (error, stats) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(stats);
      });
    });
  }

  private async fastGet(wrapper: SFTPWrapper, remotePath: string, localPath: string): Promise<void> {
    await mkdir(dirname(localPath), { recursive: true });
    await new Promise<void>((resolve, reject) => {
      wrapper.fastGet(remotePath, localPath, (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  private async fastPut(wrapper: SFTPWrapper, localPath: string, remotePath: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      wrapper.fastPut(localPath, remotePath, (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  private async mkdir(wrapper: SFTPWrapper, remotePath: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      wrapper.mkdir(remotePath, (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  private async rmdir(wrapper: SFTPWrapper, remotePath: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      wrapper.rmdir(remotePath, (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  private async unlink(wrapper: SFTPWrapper, remotePath: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      wrapper.unlink(remotePath, (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  private async uploadDirectoryRecursive(
    wrapper: SFTPWrapper,
    remoteDirectoryPath: string,
    localDirectoryPath: string,
  ): Promise<number> {
    const entries = await readLocalDirectory(localDirectoryPath, { withFileTypes: true });
    let uploadedCount = 0;

    for (const entry of entries) {
      const localEntryPath = join(localDirectoryPath, entry.name);
      const remoteEntryPath = posixPath.join(remoteDirectoryPath, entry.name);

      if (entry.isDirectory()) {
        try {
          await this.mkdir(wrapper, remoteEntryPath);
        } catch {
          // Ignore duplicate directory creation races and continue the recursive upload.
        }

        uploadedCount += await this.uploadDirectoryRecursive(wrapper, remoteEntryPath, localEntryPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      await this.fastPut(wrapper, localEntryPath, remoteEntryPath);
      uploadedCount += 1;
    }

    return uploadedCount;
  }

  private async downloadEntryRecursive(
    wrapper: SFTPWrapper,
    remotePath: string,
    localPath: string,
  ): Promise<void> {
    const resolvedRemotePath = await this.resolveExistingPath(wrapper, remotePath);
    const remoteStats = await this.stat(wrapper, resolvedRemotePath);

    if (!remoteStats.isDirectory()) {
      await this.fastGet(wrapper, resolvedRemotePath, localPath);
      return;
    }

    await mkdir(localPath, { recursive: true });
    const entries = await this.readdir(wrapper, resolvedRemotePath);

    for (const entry of entries) {
      await this.downloadEntryRecursive(
        wrapper,
        posixPath.join(resolvedRemotePath, entry.filename),
        join(localPath, entry.filename),
      );
    }
  }

  private async deleteEntryRecursive(wrapper: SFTPWrapper, remotePath: string): Promise<void> {
    const entryStats = await this.lstat(wrapper, remotePath);
    if (entryStats.isSymbolicLink()) {
      await this.unlink(wrapper, remotePath);
      return;
    }

    if (!entryStats.isDirectory()) {
      await this.unlink(wrapper, remotePath);
      return;
    }

    const entries = await this.readdir(wrapper, remotePath);
    for (const entry of entries) {
      await this.deleteEntryRecursive(wrapper, posixPath.join(remotePath, entry.filename));
    }

    await this.rmdir(wrapper, remotePath);
  }

  private async mapEntry(
    wrapper: SFTPWrapper,
    parentPath: string,
    entry: FileEntryWithStats,
  ): Promise<SSHSftpEntry> {
    const mappedEntry = mapSftpEntry(parentPath, entry);
    if (!mappedEntry.isSymbolicLink) {
      return mappedEntry;
    }

    try {
      const targetPath = await this.resolveExistingPath(wrapper, mappedEntry.path);
      const targetStats = await this.stat(wrapper, targetPath);

      return {
        ...mappedEntry,
        symlinkTargetPath: targetPath,
        symlinkTargetIsDirectory: targetStats.isDirectory(),
      };
    } catch {
      return {
        ...mappedEntry,
        symlinkTargetPath: null,
        symlinkTargetIsDirectory: null,
      };
    }
  }
}

function normalizeTargetPath(value: string): string {
  return value.trim();
}

function mapSftpEntry(parentPath: string, entry: FileEntryWithStats): SSHSftpEntry {
  return {
    name: entry.filename,
    path: posixPath.join(parentPath, entry.filename),
    isDirectory: entry.attrs.isDirectory(),
    isSymbolicLink: entry.attrs.isSymbolicLink(),
    size: entry.attrs.size ?? 0,
    modifiedAt: typeof entry.attrs.mtime === 'number'
      ? new Date(entry.attrs.mtime * 1000).toISOString()
      : null,
  };
}

function compareSftpEntries(left: SSHSftpEntry, right: SSHSftpEntry): number {
  const leftIsDirectory = left.isDirectory || left.symlinkTargetIsDirectory === true;
  const rightIsDirectory = right.isDirectory || right.symlinkTargetIsDirectory === true;

  if (leftIsDirectory !== rightIsDirectory) {
    return leftIsDirectory ? -1 : 1;
  }

  return left.name.localeCompare(right.name);
}
