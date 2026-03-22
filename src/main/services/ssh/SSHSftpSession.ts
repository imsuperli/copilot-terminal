import { basename, posix as posixPath } from 'path';
import type { FileEntryWithStats, SFTPWrapper } from 'ssh2';
import type { SSHSftpDirectoryListing, SSHSftpEntry } from '../../../shared/types/ssh';

export interface SSHSftpSessionOptions {
  getWrapper: () => Promise<SFTPWrapper>;
}

export class SSHSftpSession {
  private readonly getWrapper: () => Promise<SFTPWrapper>;

  constructor(options: SSHSftpSessionOptions) {
    this.getWrapper = options.getWrapper;
  }

  async listDirectory(targetPath?: string): Promise<SSHSftpDirectoryListing> {
    const wrapper = await this.getWrapper();
    const resolvedPath = await this.realpath(wrapper, targetPath ?? '.');
    const entries = await this.readdir(wrapper, resolvedPath);

    return {
      path: resolvedPath,
      entries: entries
        .map((entry) => mapSftpEntry(resolvedPath, entry))
        .sort(compareSftpEntries),
    };
  }

  async downloadFile(remotePath: string, localPath: string): Promise<void> {
    const wrapper = await this.getWrapper();
    const resolvedRemotePath = await this.realpath(wrapper, remotePath);
    await new Promise<void>((resolve, reject) => {
      wrapper.fastGet(resolvedRemotePath, localPath, (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  async uploadFiles(remotePath: string, localPaths: string[]): Promise<number> {
    if (localPaths.length === 0) {
      return 0;
    }

    const wrapper = await this.getWrapper();
    const resolvedRemotePath = await this.realpath(wrapper, remotePath);

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
  if (left.isDirectory !== right.isDirectory) {
    return left.isDirectory ? -1 : 1;
  }

  return left.name.localeCompare(right.name);
}
