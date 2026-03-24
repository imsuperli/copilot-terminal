import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SSHSftpDialog } from '../SSHSftpDialog';

describe('SSHSftpDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
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

  it('switches breadcrumbs into a path input and navigates on submit', async () => {
    const user = userEvent.setup();
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
      expect(window.electronAPI.listSSHSftpDirectory).toHaveBeenNthCalledWith(1, {
        windowId: 'win-1',
        paneId: 'pane-1',
        path: '/srv/app',
      });
    });

    await user.click(screen.getByTestId('ssh-sftp-breadcrumbs'));
    const pathInput = screen.getByTestId('ssh-sftp-path-input');
    await user.clear(pathInput);
    await user.type(pathInput, '/srv/app/releases');
    await user.click(screen.getByRole('button', { name: '进入' }));

    await waitFor(() => {
      expect(window.electronAPI.listSSHSftpDirectory).toHaveBeenNthCalledWith(2, {
        windowId: 'win-1',
        paneId: 'pane-1',
        path: '/srv/app/releases',
      });
    });

    expect(screen.getByTestId('ssh-sftp-breadcrumbs')).toBeInTheDocument();
  });

  it('restores breadcrumbs when path editing loses focus', async () => {
    const user = userEvent.setup();
    vi.mocked(window.electronAPI.listSSHSftpDirectory).mockResolvedValueOnce({
      success: true,
      data: {
        path: '/srv/app',
        entries: [],
      },
    });

    render(
      <div>
        <SSHSftpDialog
          open={true}
          onOpenChange={() => undefined}
          windowId="win-1"
          paneId="pane-1"
          initialPath="/srv/app"
        />
        <button type="button">outside</button>
      </div>,
    );

    await waitFor(() => {
      expect(window.electronAPI.listSSHSftpDirectory).toHaveBeenCalledWith({
        windowId: 'win-1',
        paneId: 'pane-1',
        path: '/srv/app',
      });
    });

    await user.click(screen.getByTestId('ssh-sftp-breadcrumbs'));
    const pathInput = screen.getByTestId('ssh-sftp-path-input');
    await user.clear(pathInput);
    await user.type(pathInput, '/tmp/should-not-apply');
    await user.click(screen.getByRole('button', { name: 'outside' }));

    expect(screen.getByTestId('ssh-sftp-breadcrumbs')).toBeInTheDocument();
    expect(window.electronAPI.listSSHSftpDirectory).toHaveBeenCalledTimes(1);
  });

  it('uses a narrower default width and supports drag resizing', async () => {
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

    const panel = await screen.findByTestId('ssh-sftp-panel');
    const resizeHandle = screen.getByTestId('ssh-sftp-resize-handle');

    expect(panel).toHaveStyle({ width: '288px' });

    fireEvent.mouseDown(resizeHandle, { clientX: 288 });
    fireEvent.mouseMove(window, { clientX: 360 });
    fireEvent.mouseUp(window);

    expect(panel).toHaveStyle({ width: '360px' });
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

  it('shows only entry names in the file list', async () => {
    vi.mocked(window.electronAPI.listSSHSftpDirectory).mockResolvedValueOnce({
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

    const entryButton = screen.getByRole('button', { name: 'release.tar.gz' });

    expect(within(entryButton).getByText('release.tar.gz')).toBeInTheDocument();
    expect(within(entryButton).queryByText(new Date('2026-03-22T10:05:00.000Z').toLocaleString())).not.toBeInTheDocument();
    expect(within(entryButton).queryByText('4.0 KB')).not.toBeInTheDocument();
    expect(within(entryButton).queryByText('文件')).not.toBeInTheDocument();
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

    await user.click(screen.getByRole('button', { name: 'release.tar.gz' }));
    expect(window.electronAPI.downloadSSHSftpFile).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '下载' }));

    await waitFor(() => {
      expect(window.electronAPI.downloadSSHSftpFile).toHaveBeenCalledWith({
        windowId: 'win-1',
        paneId: 'pane-1',
        remotePath: '/srv/app/release.tar.gz',
        suggestedName: 'release.tar.gz',
      });
    });

    expect(await screen.findByText('release.tar.gz 下载完成。')).toBeInTheDocument();
    expect(screen.getByText('/tmp/release.tar.gz')).toBeInTheDocument();

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

    const breadcrumbs = await screen.findByTestId('ssh-sftp-breadcrumbs');
    expect(breadcrumbs).toHaveTextContent('home');
    expect(breadcrumbs).toHaveTextContent('root');
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

    expect(await screen.findByText('logs 已删除。')).toBeInTheDocument();
  });

  it('does not render inline help affordances in the docked panel', async () => {
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

    expect(screen.queryByText('浏览当前 SSH 会话的远程目录，并在本地与远程之间传输文件。')).not.toBeInTheDocument();
    expect(screen.queryByText('SFTP 面板复用当前 SSH 连接，不会影响本地终端或现有分屏布局。')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '显示 SSH 文件传输说明' })).not.toBeInTheDocument();
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
