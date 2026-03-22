import { describe, expect, it, vi } from 'vitest';
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
});
