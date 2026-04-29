import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join, posix as posixPath } from 'path';
import { clipboard, ipcMain } from 'electron';
import type {
  TryPasteSSHClipboardImageConfig,
  TryPasteSSHClipboardImageResult,
} from '../../shared/types/electron-api';
import type { Pane, Window, LayoutNode } from '../../shared/types/window';
import type { Settings, Workspace, SSHClipboardImageUploadLocation } from '../types/workspace';
import { HandlerContext } from './HandlerContext';
import { errorResponse, successResponse } from './HandlerResponse';

const DEFAULT_MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const DEFAULT_TEMP_REMOTE_CACHE_DIR = '~/.cache/copilot-terminal/images';

export function registerSSHClipboardImageHandlers(ctx: HandlerContext) {
  ipcMain.handle('try-paste-ssh-clipboard-image', async (_event, config: TryPasteSSHClipboardImageConfig) => {
    try {
      const workspace = await ensureWorkspaceLoaded(ctx);
      const pane = findPaneInWorkspace(workspace.windows, config.windowId, config.paneId);
      if (!pane || pane.backend !== 'ssh') {
        return successResponse<TryPasteSSHClipboardImageResult>({ handled: false });
      }

      if (!ctx.processManager) {
        throw new Error('SSH session services are not initialized');
      }

      const settings = workspace.settings;
      const imageSettings = settings.sshClipboardImage;
      if (imageSettings?.enabled === false) {
        return successResponse<TryPasteSSHClipboardImageResult>({ handled: false });
      }

      const image = clipboard.readImage();
      if (image.isEmpty()) {
        return successResponse<TryPasteSSHClipboardImageResult>({ handled: false });
      }

      const pngBuffer = image.toPNG();
      const maxUploadBytes = imageSettings?.maxUploadBytes ?? DEFAULT_MAX_UPLOAD_BYTES;
      if (pngBuffer.byteLength > maxUploadBytes) {
        throw new Error(`图片已识别，但超过 SSH 图片上传大小限制：当前 ${(pngBuffer.byteLength / 1024 / 1024).toFixed(1)} MB，限制 ${(maxUploadBytes / 1024 / 1024).toFixed(1)} MB`);
      }

      const fileName = buildClipboardImageFileName();
      const localPath = join(tmpdir(), fileName);
      await fs.writeFile(localPath, pngBuffer);

      try {
        const targetDirectories = await resolveCandidateDirectories(ctx, config, pane, settings);
        if (targetDirectories.length === 0) {
          throw new Error('未能解析可用的远端上传目录');
        }

        let uploadedRemotePath: string | null = null;
        let lastError: Error | null = null;

        for (const directory of targetDirectories) {
          try {
            await ensureRemoteDirectoryIfNeeded(ctx, config, directory, imageSettings?.uploadLocation ?? 'current-working-directory');
            await ctx.processManager.uploadSSHSftpFiles(config.windowId, config.paneId, directory, [localPath]);
            uploadedRemotePath = joinRemotePath(directory, fileName);
            break;
          } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
          }
        }

        if (!uploadedRemotePath) {
          throw lastError ?? new Error('图片上传失败');
        }

        if (imageSettings?.copyRemotePathAfterUpload !== false) {
          clipboard.writeText(uploadedRemotePath);
        }

        const size = image.getSize();
        return successResponse<TryPasteSSHClipboardImageResult>({
          handled: true,
          remotePath: uploadedRemotePath,
          width: size.width,
          height: size.height,
        });
      } finally {
        await fs.unlink(localPath).catch(() => {});
      }
    } catch (error) {
      return errorResponse(error);
    }
  });
}

async function ensureWorkspaceLoaded(ctx: HandlerContext): Promise<Workspace> {
  const existingWorkspace = ctx.getCurrentWorkspace();
  if (existingWorkspace) {
    return existingWorkspace;
  }

  if (!ctx.workspaceManager) {
    throw new Error('Workspace not loaded');
  }

  const workspace = await ctx.workspaceManager.loadWorkspace();
  ctx.setCurrentWorkspace(workspace);
  return workspace;
}

function buildClipboardImageFileName(): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const min = String(now.getUTCMinutes()).padStart(2, '0');
  const ss = String(now.getUTCSeconds()).padStart(2, '0');
  return `copilot-clipboard-${yyyy}${mm}${dd}-${hh}${min}${ss}.png`;
}

async function resolveCandidateDirectories(
  ctx: HandlerContext,
  config: TryPasteSSHClipboardImageConfig,
  pane: Pane,
  settings: Settings,
): Promise<string[]> {
  const imageSettings = settings.sshClipboardImage;
  const uploadLocation = imageSettings?.uploadLocation ?? 'current-working-directory';

  switch (uploadLocation) {
    case 'temporary-directory':
      return [DEFAULT_TEMP_REMOTE_CACHE_DIR, '/tmp'];
    case 'custom-directory': {
      const custom = imageSettings?.customUploadDirectory?.trim();
      if (!custom) {
        throw new Error('未配置自定义远端目录');
      }
      return [custom];
    }
    case 'current-working-directory':
    default: {
      const runtimeCwd = config.runtimeCwd?.trim() || pane.cwd?.trim();
      const remoteCwd = pane.ssh?.remoteCwd?.trim();
      return dedupeDirectories([
        runtimeCwd,
        remoteCwd,
        '~',
        '/tmp',
      ]);
    }
  }
}

async function ensureRemoteDirectoryIfNeeded(
  ctx: HandlerContext,
  config: TryPasteSSHClipboardImageConfig,
  directory: string,
  uploadLocation: SSHClipboardImageUploadLocation,
): Promise<void> {
  if (!ctx.processManager) {
    throw new Error('SSH session services are not initialized');
  }

  if (uploadLocation === 'custom-directory' || directory === DEFAULT_TEMP_REMOTE_CACHE_DIR) {
    const shellTarget = toShellDirectoryExpression(directory);
    await ctx.processManager.execSSHCommand(
      config.windowId,
      config.paneId,
      `mkdir -p ${shellTarget}`,
    );
  }
}

function findPaneInWorkspace(windows: Window[], windowId: string, paneId: string): Pane | null {
  const window = windows.find((entry) => entry.id === windowId);
  if (!window) {
    return null;
  }

  return findPaneInLayout(window.layout, paneId);
}

function findPaneInLayout(layout: LayoutNode, paneId: string): Pane | null {
  if (layout.type === 'pane') {
    return layout.pane.id === paneId ? layout.pane : null;
  }

  for (const child of layout.children) {
    const found = findPaneInLayout(child, paneId);
    if (found) {
      return found;
    }
  }

  return null;
}

function dedupeDirectories(directories: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const directory of directories) {
    const normalized = directory?.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function joinRemotePath(directory: string, fileName: string): string {
  if (directory === '~') {
    return `~/${fileName}`;
  }

  if (directory.endsWith('/')) {
    return `${directory}${fileName}`;
  }

  return posixPath.join(directory, fileName);
}

function escapeSingleQuotedShell(value: string): string {
  return value.replace(/'/g, `'\\''`);
}

function toShellDirectoryExpression(directory: string): string {
  if (directory === '~') {
    return '~';
  }

  if (directory.startsWith('~/')) {
    const relative = directory.slice(2).split('/').map((segment) => `'${escapeSingleQuotedShell(segment)}'`).join('/');
    return `~/${relative}`;
  }

  return `'${escapeSingleQuotedShell(directory)}'`;
}
