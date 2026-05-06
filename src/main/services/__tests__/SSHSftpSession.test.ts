import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SSHSftpSession } from '../ssh/SSHSftpSession';

function createSftpWrapper() {
  return {
    realpath: vi.fn(),
    readdir: vi.fn(),
    stat: vi.fn(),
    lstat: vi.fn(),
    fastGet: vi.fn(),
    fastPut: vi.fn(),
    mkdir: vi.fn(),
    rmdir: vi.fn(),
    unlink: vi.fn(),
  };
}

describe('SSHSftpSession', () => {
  const tempPaths: string[] = [];

  afterEach(async () => {
    while (tempPaths.length > 0) {
      const tempPath = tempPaths.pop();
      if (tempPath) {
        await fs.remove(tempPath);
      }
    }
  });

  it('expands the home directory for ~ without issuing realpath(~)', async () => {
    const wrapper = createSftpWrapper();
    wrapper.realpath.mockImplementation((targetPath: string, callback: (error: Error | null, absolutePath?: string) => void) => {
      if (targetPath === '.') {
        callback(null, '/home/root');
        return;
      }

      callback(new Error(`unexpected realpath(${targetPath})`));
    });
    wrapper.readdir.mockImplementation((targetPath: string, callback: (error: Error | null, list?: any[]) => void) => {
      callback(null, []);
    });

    const session = new SSHSftpSession({
      getWrapper: async () => wrapper as any,
    });

    await expect(session.listDirectory('~')).resolves.toEqual({
      path: '/home/root',
      entries: [],
    });

    expect(wrapper.realpath).toHaveBeenCalledWith('.', expect.any(Function));
    expect(wrapper.realpath).not.toHaveBeenCalledWith('~', expect.any(Function));
    expect(wrapper.readdir).toHaveBeenCalledWith('/home/root', expect.any(Function));
  });

  it('resolves ~/ paths against the remote home directory', async () => {
    const wrapper = createSftpWrapper();
    wrapper.realpath.mockImplementation((targetPath: string, callback: (error: Error | null, absolutePath?: string) => void) => {
      if (targetPath === '.') {
        callback(null, '/home/root');
        return;
      }

      callback(null, targetPath);
    });
    wrapper.readdir.mockImplementation((targetPath: string, callback: (error: Error | null, list?: any[]) => void) => {
      callback(null, []);
    });

    const session = new SSHSftpSession({
      getWrapper: async () => wrapper as any,
    });

    await session.listDirectory('~/projects/demo');

    expect(wrapper.readdir).toHaveBeenCalledWith('/home/root/projects/demo', expect.any(Function));
    expect(wrapper.realpath).not.toHaveBeenCalledWith('~/projects/demo', expect.any(Function));
  });

  it('resolves relative paths from the SFTP current directory', async () => {
    const wrapper = createSftpWrapper();
    wrapper.realpath.mockImplementation((targetPath: string, callback: (error: Error | null, absolutePath?: string) => void) => {
      if (targetPath === '.') {
        callback(null, '/srv/app');
        return;
      }

      callback(null, targetPath);
    });
    wrapper.readdir.mockImplementation((targetPath: string, callback: (error: Error | null, list?: any[]) => void) => {
      callback(null, []);
    });

    const session = new SSHSftpSession({
      getWrapper: async () => wrapper as any,
    });

    await session.listDirectory('logs');

    expect(wrapper.realpath).toHaveBeenCalledWith('/srv/app/logs', expect.any(Function));
    expect(wrapper.readdir).toHaveBeenCalledWith('/srv/app/logs', expect.any(Function));
  });

  it('falls back to the SFTP current directory when the requested path no longer exists', async () => {
    const wrapper = createSftpWrapper();
    wrapper.realpath.mockImplementation((targetPath: string, callback: (error: Error | null, absolutePath?: string) => void) => {
      if (targetPath === '.') {
        callback(null, '/srv/app');
        return;
      }

      callback(Object.assign(new Error('No such file'), { code: 2 }));
    });
    wrapper.readdir.mockImplementation((targetPath: string, callback: (error: Error | null, list?: any[]) => void) => {
      if (targetPath !== '/srv/app') {
        callback(Object.assign(new Error('No such file'), { code: 2 }));
        return;
      }

      callback(null, []);
    });

    const session = new SSHSftpSession({
      getWrapper: async () => wrapper as any,
    });

    await expect(session.listDirectory('~/de/de/win/de/co/de/co')).resolves.toEqual({
      path: '/srv/app',
      entries: [],
    });

    expect(wrapper.readdir).toHaveBeenCalledWith('/srv/app', expect.any(Function));
  });

  it('resolves delete targets before unlinking remote entries', async () => {
    const wrapper = createSftpWrapper();
    wrapper.realpath.mockImplementation((targetPath: string, callback: (error: Error | null, absolutePath?: string) => void) => {
      if (targetPath === '.') {
        callback(null, '/srv/app');
        return;
      }

      callback(null, targetPath);
    });
    wrapper.lstat.mockImplementation((_targetPath: string, callback: (error: Error | null, stats?: any) => void) => {
      callback(null, {
        isSymbolicLink: () => false,
        isDirectory: () => false,
      });
    });
    wrapper.unlink.mockImplementation((_targetPath: string, callback: (error: Error | null) => void) => {
      callback(null);
    });

    const session = new SSHSftpSession({
      getWrapper: async () => wrapper as any,
    });

    await session.deleteEntry('logs');

    expect(wrapper.realpath).toHaveBeenCalledWith('/srv/app/logs', expect.any(Function));
    expect(wrapper.unlink).toHaveBeenCalledWith('/srv/app/logs', expect.any(Function));
  });

  it('normalizes uploaded file names to NFC before sending them to the remote path', async () => {
    const wrapper = createSftpWrapper();
    wrapper.realpath.mockImplementation((targetPath: string, callback: (error: Error | null, absolutePath?: string) => void) => {
      if (targetPath === '.') {
        callback(null, '/srv/app');
        return;
      }

      callback(null, targetPath);
    });
    wrapper.fastPut.mockImplementation((_localPath: string, _remotePath: string, callback: (error: Error | null) => void) => {
      callback(null);
    });

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'synapse-sftp-upload-'));
    tempPaths.push(tempDir);
    const localFilePath = path.join(tempDir, 'e\u0301-中文.txt');
    await fs.writeFile(localFilePath, 'test');

    const session = new SSHSftpSession({
      getWrapper: async () => wrapper as any,
    });

    await session.uploadFiles('/srv/app', [localFilePath]);

    expect(wrapper.fastPut).toHaveBeenCalledWith(
      localFilePath,
      '/srv/app/é-中文.txt',
      expect.any(Function),
    );
  });

  it('normalizes newly created remote directory names to NFC', async () => {
    const wrapper = createSftpWrapper();
    wrapper.realpath.mockImplementation((targetPath: string, callback: (error: Error | null, absolutePath?: string) => void) => {
      if (targetPath === '.') {
        callback(null, '/srv/app');
        return;
      }

      callback(null, targetPath);
    });
    wrapper.mkdir.mockImplementation((_targetPath: string, callback: (error: Error | null) => void) => {
      callback(null);
    });

    const session = new SSHSftpSession({
      getWrapper: async () => wrapper as any,
    });

    await expect(session.createDirectory('/srv/app', 'e\u0301-资料')).resolves.toBe('/srv/app/é-资料');
    expect(wrapper.mkdir).toHaveBeenCalledWith('/srv/app/é-资料', expect.any(Function));
  });
});
