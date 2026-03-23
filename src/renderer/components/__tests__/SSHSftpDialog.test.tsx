import { render, screen, waitFor, within } from '@testing-library/react';
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

    const logsRow = screen.getByRole('button', { name: 'logs' }).closest('.group');
    expect(logsRow).not.toBeNull();

    await user.click(within(logsRow as HTMLElement).getByRole('button', { name: '删除' }));
    await user.click(screen.getAllByRole('button', { name: '删除' }).at(-1)!);

    await waitFor(() => {
      expect(window.electronAPI.deleteSSHSftpEntry).toHaveBeenCalledWith({
        windowId: 'win-1',
        paneId: 'pane-1',
        remotePath: '/srv/app/logs',
      });
    });
  });

  it('keeps help copy collapsed until the help button is clicked', async () => {
    const user = userEvent.setup();

    render(
      <SSHSftpDialog
        open={true}
        onOpenChange={() => undefined}
        windowId="win-1"
        paneId="pane-1"
        initialPath="/srv/app"
      />,
    );

    expect(screen.queryByText('浏览当前 SSH 会话的远程目录，并在本地与远程之间传输文件。')).not.toBeInTheDocument();
    expect(screen.queryByText('SFTP 面板复用当前 SSH 连接，不会影响本地终端或现有分屏布局。')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '显示 SSH 文件传输说明' }));

    expect(screen.getByText('浏览当前 SSH 会话的远程目录，并在本地与远程之间传输文件。')).toBeInTheDocument();
    expect(screen.getByText('SFTP 面板复用当前 SSH 连接，不会影响本地终端或现有分屏布局。')).toBeInTheDocument();
  });

  it('keeps server metrics out of the docked file panel', async () => {
    vi.mocked(window.electronAPI.listSSHSftpDirectory).mockResolvedValueOnce({
      success: true,
      data: {
        path: '/srv/app',
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

    expect(window.electronAPI.getSSHSessionMetrics).not.toHaveBeenCalled();
    expect(screen.queryByText('prod-host')).not.toBeInTheDocument();
  });

  it('follows the current ssh cwd while cwd sync is enabled', async () => {
    vi.mocked(window.electronAPI.listSSHSftpDirectory)
      .mockResolvedValueOnce({
        success: true,
        data: {
          path: '/srv/app',
          entries: [],
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          path: '/srv/app/releases',
          entries: [],
        },
      });

    const { rerender } = render(
      <SSHSftpDialog
        open={true}
        onOpenChange={() => undefined}
        windowId="win-1"
        paneId="pane-1"
        initialPath="/srv/app"
        currentCwd="/srv/app"
      />,
    );

    await waitFor(() => {
      expect(window.electronAPI.listSSHSftpDirectory).toHaveBeenNthCalledWith(1, {
        windowId: 'win-1',
        paneId: 'pane-1',
        path: '/srv/app',
      });
    });

    rerender(
      <SSHSftpDialog
        open={true}
        onOpenChange={() => undefined}
        windowId="win-1"
        paneId="pane-1"
        initialPath="/srv/app"
        currentCwd="/srv/app/releases"
      />,
    );

    await waitFor(() => {
      expect(window.electronAPI.listSSHSftpDirectory).toHaveBeenNthCalledWith(2, {
        windowId: 'win-1',
        paneId: 'pane-1',
        path: '/srv/app/releases',
      });
    });
  });
});
