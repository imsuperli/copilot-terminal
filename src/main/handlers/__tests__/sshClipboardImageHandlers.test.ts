import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerSSHClipboardImageHandlers } from '../sshClipboardImageHandlers';
import type { HandlerContext } from '../HandlerContext';
import type { Workspace } from '../../types/workspace';
import { WindowStatus } from '../../../shared/types/window';

const {
  mockIpcHandle,
  mockClipboardReadImage,
  mockClipboardWriteText,
  mockFsWriteFile,
  mockFsUnlink,
} = vi.hoisted(() => ({
  mockIpcHandle: vi.fn(),
  mockClipboardReadImage: vi.fn(),
  mockClipboardWriteText: vi.fn(),
  mockFsWriteFile: vi.fn(),
  mockFsUnlink: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: mockIpcHandle,
  },
  clipboard: {
    readImage: mockClipboardReadImage,
    writeText: mockClipboardWriteText,
  },
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    promises: {
      writeFile: mockFsWriteFile,
      unlink: mockFsUnlink,
    },
  };
});

function getRegisteredHandler(channel: string) {
  const call = mockIpcHandle.mock.calls.find(([name]) => name === channel);
  expect(call, `IPC handler ${channel} should be registered`).toBeTruthy();
  return call?.[1] as (event: unknown, payload?: unknown) => Promise<unknown>;
}

function createWorkspace(overrides?: Partial<Workspace>): Workspace {
  return {
    version: '3.0',
    groups: [],
    lastSavedAt: '2026-04-29T00:00:00.000Z',
    windows: [
      {
        id: 'win-ssh',
        name: 'SSH',
        activePaneId: 'pane-ssh',
        createdAt: '2026-04-29T00:00:00.000Z',
        lastActiveAt: '2026-04-29T00:00:00.000Z',
        layout: {
          type: 'pane',
          id: 'pane-ssh',
          pane: {
            id: 'pane-ssh',
            cwd: '/srv/app',
            command: '',
            status: WindowStatus.WaitingForInput,
            pid: 1001,
            backend: 'ssh',
            ssh: {
              profileId: 'profile-1',
              remoteCwd: '/srv/app',
            },
          },
        },
      },
    ],
    settings: {
      notificationsEnabled: true,
      theme: 'dark',
      autoSave: true,
      autoSaveInterval: 5,
      ides: [],
      features: {
        sshEnabled: true,
      },
      sshClipboardImage: {
        enabled: true,
        uploadLocation: 'current-working-directory',
        customUploadDirectory: '',
        copyRemotePathAfterUpload: true,
        maxUploadBytes: 20 * 1024 * 1024,
      },
    },
    ...overrides,
  };
}

function createClipboardImage({
  empty = false,
  png = Buffer.from('png'),
  width = 100,
  height = 80,
}: {
  empty?: boolean;
  png?: Buffer;
  width?: number;
  height?: number;
}) {
  return {
    isEmpty: vi.fn().mockReturnValue(empty),
    toPNG: vi.fn().mockReturnValue(png),
    getSize: vi.fn().mockReturnValue({ width, height }),
  };
}

describe('registerSSHClipboardImageHandlers', () => {
  beforeEach(() => {
    mockIpcHandle.mockReset();
    mockClipboardReadImage.mockReset();
    mockClipboardWriteText.mockReset();
    mockFsWriteFile.mockReset().mockResolvedValue(undefined);
    mockFsUnlink.mockReset().mockResolvedValue(undefined);
  });

  it('returns handled false for non-ssh panes', async () => {
    const workspace = createWorkspace({
      windows: [
        {
          id: 'win-local',
          name: 'Local',
          activePaneId: 'pane-local',
          createdAt: '2026-04-29T00:00:00.000Z',
          lastActiveAt: '2026-04-29T00:00:00.000Z',
          layout: {
            type: 'pane',
            id: 'pane-local',
            pane: {
              id: 'pane-local',
              cwd: '/tmp',
              command: 'bash',
              status: WindowStatus.Running,
              pid: 1002,
              backend: 'local',
            },
          },
        },
      ],
    });

    const ctx = {
      processManager: {},
      workspaceManager: null,
      getCurrentWorkspace: () => workspace,
      setCurrentWorkspace: vi.fn(),
    } as unknown as HandlerContext;

    registerSSHClipboardImageHandlers(ctx);
    const handler = getRegisteredHandler('try-paste-ssh-clipboard-image');

    const response = await handler({}, { windowId: 'win-local', paneId: 'pane-local' });

    expect(response).toEqual({
      success: true,
      data: {
        handled: false,
      },
    });
  });

  it('returns handled false when clipboard does not contain an image', async () => {
    const workspace = createWorkspace();
    mockClipboardReadImage.mockReturnValue(createClipboardImage({ empty: true }));

    const ctx = {
      processManager: {},
      workspaceManager: null,
      getCurrentWorkspace: () => workspace,
      setCurrentWorkspace: vi.fn(),
    } as unknown as HandlerContext;

    registerSSHClipboardImageHandlers(ctx);
    const handler = getRegisteredHandler('try-paste-ssh-clipboard-image');

    const response = await handler({}, { windowId: 'win-ssh', paneId: 'pane-ssh' });

    expect(response).toEqual({
      success: true,
      data: {
        handled: false,
      },
    });
    expect(mockFsWriteFile).not.toHaveBeenCalled();
  });

  it('uploads clipboard image to current cwd and copies remote path', async () => {
    const workspace = createWorkspace();
    mockClipboardReadImage.mockReturnValue(createClipboardImage({ empty: false }));
    const processManager = {
      uploadSSHSftpFiles: vi.fn().mockResolvedValue(1),
      execSSHCommand: vi.fn(),
    };

    const ctx = {
      processManager,
      workspaceManager: null,
      getCurrentWorkspace: () => workspace,
      setCurrentWorkspace: vi.fn(),
    } as unknown as HandlerContext;

    registerSSHClipboardImageHandlers(ctx);
    const handler = getRegisteredHandler('try-paste-ssh-clipboard-image');

    const response = await handler({}, { windowId: 'win-ssh', paneId: 'pane-ssh' }) as {
      success: boolean;
      data: { handled: boolean; remotePath: string; width: number; height: number };
    };

    expect(response.success).toBe(true);
    expect(response.data.handled).toBe(true);
    expect(response.data.remotePath).toMatch(/^\/srv\/app\/copilot-clipboard-\d{8}-\d{6}\.png$/);
    expect(response.data.width).toBe(100);
    expect(response.data.height).toBe(80);
    expect(processManager.uploadSSHSftpFiles).toHaveBeenCalledWith(
      'win-ssh',
      'pane-ssh',
      '/srv/app',
      [expect.stringMatching(/copilot-clipboard-\d{8}-\d{6}\.png$/)],
    );
    expect(mockClipboardWriteText).toHaveBeenCalledWith(response.data.remotePath);
  });

  it('falls back to home directory when current cwd upload fails once', async () => {
    const workspace = createWorkspace();
    mockClipboardReadImage.mockReturnValue(createClipboardImage({ empty: false }));
    const processManager = {
      uploadSSHSftpFiles: vi.fn()
        .mockRejectedValueOnce(new Error('permission denied'))
        .mockResolvedValueOnce(1),
      execSSHCommand: vi.fn(),
    };

    const ctx = {
      processManager,
      workspaceManager: null,
      getCurrentWorkspace: () => workspace,
      setCurrentWorkspace: vi.fn(),
    } as unknown as HandlerContext;

    registerSSHClipboardImageHandlers(ctx);
    const handler = getRegisteredHandler('try-paste-ssh-clipboard-image');

    const response = await handler({}, { windowId: 'win-ssh', paneId: 'pane-ssh' }) as {
      success: boolean;
      data: { handled: boolean; remotePath: string };
    };

    expect(response.success).toBe(true);
    expect(processManager.uploadSSHSftpFiles).toHaveBeenNthCalledWith(
      1,
      'win-ssh',
      'pane-ssh',
      '/srv/app',
      [expect.any(String)],
    );
    expect(processManager.uploadSSHSftpFiles).toHaveBeenNthCalledWith(
      2,
      'win-ssh',
      'pane-ssh',
      '~',
      [expect.any(String)],
    );
    expect(response.data.remotePath).toMatch(/^~\/copilot-clipboard-\d{8}-\d{6}\.png$/);
  });

  it('falls back to /tmp when current cwd and home directory both fail', async () => {
    const workspace = createWorkspace();
    mockClipboardReadImage.mockReturnValue(createClipboardImage({ empty: false }));
    const processManager = {
      uploadSSHSftpFiles: vi.fn()
        .mockRejectedValueOnce(new Error('permission denied'))
        .mockRejectedValueOnce(new Error('home denied'))
        .mockResolvedValueOnce(1),
      execSSHCommand: vi.fn(),
    };

    const ctx = {
      processManager,
      workspaceManager: null,
      getCurrentWorkspace: () => workspace,
      setCurrentWorkspace: vi.fn(),
    } as unknown as HandlerContext;

    registerSSHClipboardImageHandlers(ctx);
    const handler = getRegisteredHandler('try-paste-ssh-clipboard-image');

    const response = await handler({}, { windowId: 'win-ssh', paneId: 'pane-ssh' }) as {
      success: boolean;
      data: { handled: boolean; remotePath: string };
    };

    expect(response.success).toBe(true);
    expect(processManager.uploadSSHSftpFiles).toHaveBeenNthCalledWith(
      1,
      'win-ssh',
      'pane-ssh',
      '/srv/app',
      [expect.any(String)],
    );
    expect(processManager.uploadSSHSftpFiles).toHaveBeenNthCalledWith(
      2,
      'win-ssh',
      'pane-ssh',
      '~',
      [expect.any(String)],
    );
    expect(processManager.uploadSSHSftpFiles).toHaveBeenNthCalledWith(
      3,
      'win-ssh',
      'pane-ssh',
      '/tmp',
      [expect.any(String)],
    );
    expect(response.data.remotePath).toMatch(/^\/tmp\/copilot-clipboard-\d{8}-\d{6}\.png$/);
  });

  it('does not overwrite clipboard when copyRemotePathAfterUpload is disabled', async () => {
    const workspace = createWorkspace({
      settings: {
        ...createWorkspace().settings,
        sshClipboardImage: {
          enabled: true,
          uploadLocation: 'current-working-directory',
          customUploadDirectory: '',
          copyRemotePathAfterUpload: false,
          maxUploadBytes: 20 * 1024 * 1024,
        },
      },
    });
    mockClipboardReadImage.mockReturnValue(createClipboardImage({ empty: false }));
    const processManager = {
      uploadSSHSftpFiles: vi.fn().mockResolvedValue(1),
      execSSHCommand: vi.fn(),
    };

    const ctx = {
      processManager,
      workspaceManager: null,
      getCurrentWorkspace: () => workspace,
      setCurrentWorkspace: vi.fn(),
    } as unknown as HandlerContext;

    registerSSHClipboardImageHandlers(ctx);
    const handler = getRegisteredHandler('try-paste-ssh-clipboard-image');

    const response = await handler({}, { windowId: 'win-ssh', paneId: 'pane-ssh' }) as {
      success: boolean;
      data: { handled: boolean };
    };

    expect(response.success).toBe(true);
    expect(response.data.handled).toBe(true);
    expect(mockClipboardWriteText).not.toHaveBeenCalled();
  });

  it('returns an explicit error when the clipboard image exceeds the upload size limit', async () => {
    const workspace = createWorkspace({
      settings: {
        ...createWorkspace().settings,
        sshClipboardImage: {
          enabled: true,
          uploadLocation: 'current-working-directory',
          customUploadDirectory: '',
          copyRemotePathAfterUpload: true,
          maxUploadBytes: 1024,
        },
      },
    });
    mockClipboardReadImage.mockReturnValue(createClipboardImage({
      empty: false,
      png: Buffer.alloc(2048, 1),
    }));
    const processManager = {
      uploadSSHSftpFiles: vi.fn(),
      execSSHCommand: vi.fn(),
    };

    const ctx = {
      processManager,
      workspaceManager: null,
      getCurrentWorkspace: () => workspace,
      setCurrentWorkspace: vi.fn(),
    } as unknown as HandlerContext;

    registerSSHClipboardImageHandlers(ctx);
    const handler = getRegisteredHandler('try-paste-ssh-clipboard-image');

    const response = await handler({}, { windowId: 'win-ssh', paneId: 'pane-ssh' }) as {
      success: boolean;
      error?: string;
    };

    expect(response.success).toBe(false);
    expect(response.error).toContain('图片已识别，但超过 SSH 图片上传大小限制');
    expect(processManager.uploadSSHSftpFiles).not.toHaveBeenCalled();
    expect(mockFsWriteFile).not.toHaveBeenCalled();
  });
});
