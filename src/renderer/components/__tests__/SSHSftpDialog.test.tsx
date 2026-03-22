import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SSHSftpDialog } from '../SSHSftpDialog';

describe('SSHSftpDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads a remote directory and navigates into folders', async () => {
    const user = userEvent.setup();
    vi.mocked(window.electronAPI.listSSHSftpDirectory)
      .mockResolvedValueOnce({
        success: true,
        data: {
          path: '/srv/app',
          entries: [
            {
              name: 'logs',
              path: '/srv/app/logs',
              isDirectory: true,
              isSymbolicLink: false,
              size: 0,
              modifiedAt: '2026-03-22T10:00:00.000Z',
            },
            {
              name: 'release.tar.gz',
              path: '/srv/app/release.tar.gz',
              isDirectory: false,
              isSymbolicLink: false,
              size: 4096,
              modifiedAt: '2026-03-22T10:05:00.000Z',
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          path: '/srv/app/logs',
          entries: [],
        },
      });

    render(
      <SSHSftpDialog
        open={true}
        onOpenChange={() => undefined}
        windowId="win-1"
        paneId="pane-1"
        initialPath="/srv/app"
      />,
    );

    await waitFor(() => {
      expect(window.electronAPI.listSSHSftpDirectory).toHaveBeenCalledWith({
        windowId: 'win-1',
        paneId: 'pane-1',
        path: '/srv/app',
      });
    });

    await user.click(screen.getByRole('button', { name: 'logs' }));

    await waitFor(() => {
      expect(window.electronAPI.listSSHSftpDirectory).toHaveBeenCalledWith({
        windowId: 'win-1',
        paneId: 'pane-1',
        path: '/srv/app/logs',
      });
    });
  });

  it('treats symlinked directories as navigable folders', async () => {
    const user = userEvent.setup();
    vi.mocked(window.electronAPI.listSSHSftpDirectory)
      .mockResolvedValueOnce({
        success: true,
        data: {
          path: '/srv/app',
          entries: [
            {
              name: 'current',
              path: '/srv/app/current',
              isDirectory: false,
              isSymbolicLink: true,
              symlinkTargetPath: '/srv/releases/current',
              symlinkTargetIsDirectory: true,
              size: 0,
              modifiedAt: '2026-03-22T10:00:00.000Z',
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          path: '/srv/releases/current',
          entries: [],
        },
      });

    render(
      <SSHSftpDialog
        open={true}
        onOpenChange={() => undefined}
        windowId="win-1"
        paneId="pane-1"
        initialPath="/srv/app"
      />,
    );

    await waitFor(() => {
      expect(window.electronAPI.listSSHSftpDirectory).toHaveBeenCalledWith({
        windowId: 'win-1',
        paneId: 'pane-1',
        path: '/srv/app',
      });
    });

    await user.click(screen.getByRole('button', { name: 'current' }));

    await waitFor(() => {
      expect(window.electronAPI.listSSHSftpDirectory).toHaveBeenCalledWith({
        windowId: 'win-1',
        paneId: 'pane-1',
        path: '/srv/releases/current',
      });
    });
  });

  it('downloads files and uploads into the current directory', async () => {
    const user = userEvent.setup();
    vi.mocked(window.electronAPI.listSSHSftpDirectory)
      .mockResolvedValueOnce({
        success: true,
        data: {
          path: '/srv/app',
          entries: [
            {
              name: 'release.tar.gz',
              path: '/srv/app/release.tar.gz',
              isDirectory: false,
              isSymbolicLink: false,
              size: 4096,
              modifiedAt: '2026-03-22T10:05:00.000Z',
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          path: '/srv/app',
          entries: [
            {
              name: 'release.tar.gz',
              path: '/srv/app/release.tar.gz',
              isDirectory: false,
              isSymbolicLink: false,
              size: 4096,
              modifiedAt: '2026-03-22T10:05:00.000Z',
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          path: '/srv/app',
          entries: [
            {
              name: 'release.tar.gz',
              path: '/srv/app/release.tar.gz',
              isDirectory: false,
              isSymbolicLink: false,
              size: 4096,
              modifiedAt: '2026-03-22T10:05:00.000Z',
            },
          ],
        },
      });
    vi.mocked(window.electronAPI.downloadSSHSftpFile).mockResolvedValueOnce({
      success: true,
      data: '/tmp/release.tar.gz',
    });
    vi.mocked(window.electronAPI.uploadSSHSftpFiles).mockResolvedValueOnce({
      success: true,
      data: {
        uploadedCount: 1,
      },
    });
    vi.mocked(window.electronAPI.uploadSSHSftpDirectory).mockResolvedValueOnce({
      success: true,
      data: {
        uploadedCount: 3,
      },
    });

    render(
      <SSHSftpDialog
        open={true}
        onOpenChange={() => undefined}
        windowId="win-1"
        paneId="pane-1"
        initialPath="/srv/app"
      />,
    );

    await waitFor(() => {
      expect(window.electronAPI.listSSHSftpDirectory).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole('button', { name: /下载/i }));

    await waitFor(() => {
      expect(window.electronAPI.downloadSSHSftpFile).toHaveBeenCalledWith({
        windowId: 'win-1',
        paneId: 'pane-1',
        remotePath: '/srv/app/release.tar.gz',
        suggestedName: 'release.tar.gz',
      });
    });

    await user.click(screen.getByRole('button', { name: '上传文件' }));

    await waitFor(() => {
      expect(window.electronAPI.uploadSSHSftpFiles).toHaveBeenCalledWith({
        windowId: 'win-1',
        paneId: 'pane-1',
        remotePath: '/srv/app',
      });
    });

    await waitFor(() => {
      expect(window.electronAPI.listSSHSftpDirectory).toHaveBeenCalledTimes(2);
    });

    await user.click(screen.getByRole('button', { name: '上传文件夹' }));

    await waitFor(() => {
      expect(window.electronAPI.uploadSSHSftpDirectory).toHaveBeenCalledWith({
        windowId: 'win-1',
        paneId: 'pane-1',
        remotePath: '/srv/app',
      });
    });

    await waitFor(() => {
      expect(window.electronAPI.listSSHSftpDirectory).toHaveBeenCalledTimes(3);
    });
  });

  it('falls back to the remote home directory when the initial path does not exist', async () => {
    vi.mocked(window.electronAPI.listSSHSftpDirectory)
      .mockResolvedValueOnce({
        success: false,
        error: 'No such file',
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          path: '/home/root',
          entries: [],
        },
      });

    render(
      <SSHSftpDialog
        open={true}
        onOpenChange={() => undefined}
        windowId="win-1"
        paneId="pane-1"
        initialPath="~"
      />,
    );

    await waitFor(() => {
      expect(window.electronAPI.listSSHSftpDirectory).toHaveBeenNthCalledWith(1, {
        windowId: 'win-1',
        paneId: 'pane-1',
        path: '~',
      });
    });

    await waitFor(() => {
      expect(window.electronAPI.listSSHSftpDirectory).toHaveBeenNthCalledWith(2, {
        windowId: 'win-1',
        paneId: 'pane-1',
      });
    });

    expect(await screen.findByDisplayValue('/home/root')).toBeInTheDocument();
  });

  it('creates and deletes remote directories', async () => {
    const user = userEvent.setup();
    vi.mocked(window.electronAPI.listSSHSftpDirectory)
      .mockResolvedValueOnce({
        success: true,
        data: {
          path: '/srv/app',
          entries: [
            {
              name: 'logs',
              path: '/srv/app/logs',
              isDirectory: true,
              isSymbolicLink: false,
              size: 0,
              modifiedAt: '2026-03-22T10:00:00.000Z',
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          path: '/srv/app',
          entries: [
            {
              name: 'logs',
              path: '/srv/app/logs',
              isDirectory: true,
              isSymbolicLink: false,
              size: 0,
              modifiedAt: '2026-03-22T10:00:00.000Z',
            },
            {
              name: 'releases',
              path: '/srv/app/releases',
              isDirectory: true,
              isSymbolicLink: false,
              size: 0,
              modifiedAt: '2026-03-22T10:10:00.000Z',
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          path: '/srv/app',
          entries: [],
        },
      });
    vi.mocked(window.electronAPI.createSSHSftpDirectory).mockResolvedValueOnce({
      success: true,
      data: '/srv/app/releases',
    });
    vi.mocked(window.electronAPI.deleteSSHSftpEntry).mockResolvedValueOnce({
      success: true,
    });

    render(
      <SSHSftpDialog
        open={true}
        onOpenChange={() => undefined}
        windowId="win-1"
        paneId="pane-1"
        initialPath="/srv/app"
      />,
    );

    await waitFor(() => {
      expect(window.electronAPI.listSSHSftpDirectory).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole('button', { name: '新建目录' }));
    await user.type(screen.getByPlaceholderText('输入新目录名称'), 'releases');
    await user.click(screen.getByRole('button', { name: '创建' }));

    await waitFor(() => {
      expect(window.electronAPI.createSSHSftpDirectory).toHaveBeenCalledWith({
        windowId: 'win-1',
        paneId: 'pane-1',
        parentPath: '/srv/app',
        name: 'releases',
      });
    });

    await waitFor(() => {
      expect(window.electronAPI.listSSHSftpDirectory).toHaveBeenCalledTimes(2);
    });

    await user.click(screen.getAllByRole('button', { name: '删除' })[0]);
    await user.click(screen.getAllByRole('button', { name: '删除' }).at(-1)!);

    await waitFor(() => {
      expect(window.electronAPI.deleteSSHSftpEntry).toHaveBeenCalledWith({
        windowId: 'win-1',
        paneId: 'pane-1',
        remotePath: '/srv/app/logs',
      });
    });
  });
});
