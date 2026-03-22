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
  });
});
