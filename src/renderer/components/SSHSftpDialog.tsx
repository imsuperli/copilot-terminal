import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Download,
  Folder,
  FolderPlus,
  FolderUp,
  HardDriveDownload,
  HardDriveUpload,
  HelpCircle,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import type { SSHSftpDirectoryListing, SSHSftpEntry } from '../../shared/types/ssh';
import { useI18n } from '../i18n';
import { Button } from './ui/Button';
import { ConfirmDialog } from './ConfirmDialog';
import { Dialog } from './ui/Dialog';

interface SSHSftpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  windowId: string | null;
  paneId: string | null;
  initialPath?: string | null;
}

export function SSHSftpDialog({
  open,
  onOpenChange,
  windowId,
  paneId,
  initialPath,
}: SSHSftpDialogProps) {
  const { t } = useI18n();
  const [listing, setListing] = useState<SSHSftpDirectoryListing | null>(null);
  const [pathInput, setPathInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const [isUploadingDirectory, setIsUploadingDirectory] = useState(false);
  const [downloadingPath, setDownloadingPath] = useState<string | null>(null);
  const [creatingDirectory, setCreatingDirectory] = useState(false);
  const [directoryName, setDirectoryName] = useState('');
  const [isCreatingDirectory, setIsCreatingDirectory] = useState(false);
  const [deletingEntry, setDeletingEntry] = useState<SSHSftpEntry | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [error, setError] = useState('');
  const isDirectoryEntry = useCallback((entry: SSHSftpEntry) => (
    entry.isDirectory || entry.symlinkTargetIsDirectory === true
  ), []);

  const loadDirectory = useCallback(async (targetPath?: string) => {
    if (!open || !windowId || !paneId) {
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await window.electronAPI.listSSHSftpDirectory({
        windowId,
        paneId,
        ...(targetPath ? { path: targetPath } : {}),
      });
      if (!response.success || !response.data) {
        throw new Error(response.error || t('sshSftpDialog.loadError'));
      }

      setListing(response.data);
      setPathInput(response.data.path);
    } catch (loadError) {
      const errorMessage = (loadError as Error).message || t('sshSftpDialog.loadError');

      if (targetPath && shouldFallbackToHomeDirectory(errorMessage)) {
        try {
          const fallbackResponse = await window.electronAPI.listSSHSftpDirectory({
            windowId,
            paneId,
          });

          if (fallbackResponse.success && fallbackResponse.data) {
            setListing(fallbackResponse.data);
            setPathInput(fallbackResponse.data.path);
            setError('');
            return;
          }
        } catch {
          // Keep the original error message when the fallback also fails.
        }
      }

      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [open, paneId, t, windowId]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setListing(null);
    setPathInput(initialPath?.trim() || '');
    setDirectoryName('');
    setCreatingDirectory(false);
    setDeletingEntry(null);
    setShowHelp(false);
    void loadDirectory(initialPath?.trim() || undefined);
  }, [initialPath, loadDirectory, open]);

  const handleNavigate = useCallback(async (targetPath: string) => {
    await loadDirectory(targetPath);
  }, [loadDirectory]);

  const handleSubmitPath = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextPath = pathInput.trim();
    if (!nextPath) {
      return;
    }

    await loadDirectory(nextPath);
  }, [loadDirectory, pathInput]);

  const handleNavigateUp = useCallback(async () => {
    const currentPath = listing?.path;
    if (!currentPath) {
      return;
    }

    const nextPath = getParentSftpPath(currentPath);
    await loadDirectory(nextPath);
  }, [listing?.path, loadDirectory]);

  const handleUploadFiles = useCallback(async () => {
    if (!windowId || !paneId || !listing) {
      return;
    }

    setIsUploadingFiles(true);
    setError('');

    try {
      const response = await window.electronAPI.uploadSSHSftpFiles({
        windowId,
        paneId,
        remotePath: listing.path,
      });
      if (!response.success) {
        throw new Error(response.error || t('sshSftpDialog.uploadError'));
      }

      if ((response.data?.uploadedCount ?? 0) > 0) {
        await loadDirectory(listing.path);
      }
    } catch (uploadError) {
      setError((uploadError as Error).message || t('sshSftpDialog.uploadError'));
    } finally {
      setIsUploadingFiles(false);
    }
  }, [listing, loadDirectory, paneId, t, windowId]);

  const handleUploadDirectory = useCallback(async () => {
    if (!windowId || !paneId || !listing) {
      return;
    }

    setIsUploadingDirectory(true);
    setError('');

    try {
      const response = await window.electronAPI.uploadSSHSftpDirectory({
        windowId,
        paneId,
        remotePath: listing.path,
      });
      if (!response.success) {
        throw new Error(response.error || t('sshSftpDialog.uploadDirectoryError'));
      }

      if ((response.data?.uploadedCount ?? 0) > 0) {
        await loadDirectory(listing.path);
      }
    } catch (uploadError) {
      setError((uploadError as Error).message || t('sshSftpDialog.uploadDirectoryError'));
    } finally {
      setIsUploadingDirectory(false);
    }
  }, [listing, loadDirectory, paneId, t, windowId]);

  const handleDownloadFile = useCallback(async (entry: SSHSftpEntry) => {
    if (!windowId || !paneId || isDirectoryEntry(entry)) {
      return;
    }

    setDownloadingPath(entry.path);
    setError('');

    try {
      const response = await window.electronAPI.downloadSSHSftpFile({
        windowId,
        paneId,
        remotePath: entry.path,
        suggestedName: entry.name,
      });
      if (!response.success) {
        throw new Error(response.error || t('sshSftpDialog.downloadError'));
      }
    } catch (downloadError) {
      setError((downloadError as Error).message || t('sshSftpDialog.downloadError'));
    } finally {
      setDownloadingPath(null);
    }
  }, [isDirectoryEntry, paneId, t, windowId]);

  const handleDownloadDirectory = useCallback(async (entry: SSHSftpEntry) => {
    if (!windowId || !paneId || !isDirectoryEntry(entry)) {
      return;
    }

    setDownloadingPath(entry.path);
    setError('');

    try {
      const response = await window.electronAPI.downloadSSHSftpDirectory({
        windowId,
        paneId,
        remotePath: entry.path,
        suggestedName: entry.name,
      });
      if (!response.success) {
        throw new Error(response.error || t('sshSftpDialog.downloadDirectoryError'));
      }
    } catch (downloadError) {
      setError((downloadError as Error).message || t('sshSftpDialog.downloadDirectoryError'));
    } finally {
      setDownloadingPath(null);
    }
  }, [isDirectoryEntry, paneId, t, windowId]);

  const handleCreateDirectory = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!windowId || !paneId || !listing) {
      return;
    }

    const trimmedName = directoryName.trim();
    if (!trimmedName) {
      setError(t('sshSftpDialog.directoryNameRequired'));
      return;
    }

    setIsCreatingDirectory(true);
    setError('');

    try {
      const response = await window.electronAPI.createSSHSftpDirectory({
        windowId,
        paneId,
        parentPath: listing.path,
        name: trimmedName,
      });
      if (!response.success) {
        throw new Error(response.error || t('sshSftpDialog.createDirectoryError'));
      }

      setDirectoryName('');
      setCreatingDirectory(false);
      await loadDirectory(listing.path);
    } catch (createError) {
      setError((createError as Error).message || t('sshSftpDialog.createDirectoryError'));
    } finally {
      setIsCreatingDirectory(false);
    }
  }, [directoryName, listing, loadDirectory, paneId, t, windowId]);

  const handleDeleteEntry = useCallback(async () => {
    if (!windowId || !paneId || !listing || !deletingEntry) {
      return;
    }

    setIsDeleting(true);
    setError('');

    try {
      const response = await window.electronAPI.deleteSSHSftpEntry({
        windowId,
        paneId,
        remotePath: deletingEntry.path,
      });
      if (!response.success) {
        throw new Error(response.error || t('sshSftpDialog.deleteError'));
      }

      setDeletingEntry(null);
      await loadDirectory(listing.path);
    } catch (deleteError) {
      setError((deleteError as Error).message || t('sshSftpDialog.deleteError'));
    } finally {
      setIsDeleting(false);
    }
  }, [deletingEntry, listing, loadDirectory, paneId, t, windowId]);

  const pathSegments = useMemo(() => {
    const currentPath = listing?.path ?? pathInput.trim();
    if (!currentPath) {
      return [];
    }

    if (currentPath === '/') {
      return [{ label: '/', path: '/' }];
    }

    const segments = currentPath.split('/').filter(Boolean);
    let accumulatedPath = '';

    return [
      { label: '/', path: '/' },
      ...segments.map((segment) => {
        accumulatedPath = `${accumulatedPath}/${segment}`;
        return {
          label: segment,
          path: accumulatedPath,
        };
      }),
    ];
  }, [listing?.path, pathInput]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('sshSftpDialog.title')}
      contentClassName="max-w-[1100px]"
      headerActions={(
        <button
          type="button"
          aria-label={t('sshSftpDialog.helpAriaLabel')}
          onClick={() => setShowHelp((current) => !current)}
          className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-status-running ${
            showHelp
              ? 'border-status-running/60 bg-status-running/10 text-blue-200'
              : 'border-border-subtle bg-bg-app/70 text-text-secondary hover:bg-bg-card-hover hover:text-text-primary'
          }`}
        >
          <HelpCircle size={16} />
        </button>
      )}
    >
      <div className="space-y-4">
        {showHelp && (
          <div className="rounded-lg border border-border-subtle bg-bg-elevated/40 px-4 py-3 text-sm leading-6 text-text-secondary">
            <p>{t('sshSftpDialog.description')}</p>
            <p className="mt-2">{t('sshSftpDialog.scopeHint')}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {pathSegments.map((segment) => (
            <button
              key={segment.path}
              type="button"
              onClick={() => void handleNavigate(segment.path)}
              className="rounded border border-border-subtle px-2 py-1 text-text-secondary hover:bg-bg-card-hover hover:text-text-primary"
            >
              {segment.label}
            </button>
          ))}
        </div>

        <form className="flex flex-wrap items-center gap-2" onSubmit={handleSubmitPath}>
          <label className="text-sm text-text-secondary" htmlFor="ssh-sftp-path">
            {t('sshSftpDialog.path')}
          </label>
          <input
            id="ssh-sftp-path"
            value={pathInput}
            onChange={(event) => setPathInput(event.target.value)}
            className="min-w-[280px] flex-1 rounded-md border border-border-subtle bg-bg-card px-3 py-2 text-sm text-text-primary outline-none focus:border-status-running"
            placeholder="/srv/app"
          />
          <Button type="submit" variant="secondary">
            {t('sshSftpDialog.go')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void handleNavigateUp()}
            disabled={isLoading || !listing}
            className="inline-flex items-center gap-2"
          >
            <FolderUp size={14} />
            {t('sshSftpDialog.up')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void loadDirectory(listing?.path || initialPath || undefined)}
            disabled={isLoading}
            className="inline-flex items-center gap-2"
          >
            <RefreshCw size={14} />
            {t('sshSftpDialog.refresh')}
          </Button>
          <Button
            type="button"
            onClick={() => void handleUploadFiles()}
            disabled={!listing || isUploadingFiles}
            className="inline-flex items-center gap-2"
          >
            <HardDriveUpload size={14} />
            {isUploadingFiles ? t('common.loading') : t('sshSftpDialog.uploadFiles')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void handleUploadDirectory()}
            disabled={!listing || isUploadingDirectory}
            className="inline-flex items-center gap-2"
          >
            <HardDriveDownload size={14} />
            {isUploadingDirectory ? t('common.loading') : t('sshSftpDialog.uploadDirectory')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setCreatingDirectory((previous) => !previous)}
            disabled={!listing}
            className="inline-flex items-center gap-2"
          >
            <FolderPlus size={14} />
            {t('sshSftpDialog.newDirectory')}
          </Button>
        </form>

        {creatingDirectory && (
          <form className="flex flex-wrap items-center gap-2 rounded-lg border border-border-subtle bg-bg-elevated/40 px-4 py-3" onSubmit={handleCreateDirectory}>
            <input
              value={directoryName}
              onChange={(event) => setDirectoryName(event.target.value)}
              className="min-w-[240px] flex-1 rounded-md border border-border-subtle bg-bg-card px-3 py-2 text-sm text-text-primary outline-none focus:border-status-running"
              placeholder={t('sshSftpDialog.directoryNamePlaceholder')}
            />
            <Button type="submit" disabled={isCreatingDirectory}>
              {isCreatingDirectory ? t('common.creating') : t('common.create')}
            </Button>
            <Button type="button" variant="ghost" onClick={() => {
              setCreatingDirectory(false);
              setDirectoryName('');
            }}>
              {t('common.cancel')}
            </Button>
          </form>
        )}

        {error && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="overflow-hidden rounded-lg border border-border-subtle">
          <div className="grid grid-cols-[minmax(0,1.5fr)_120px_170px_100px_220px] gap-3 border-b border-border-subtle bg-bg-card-hover px-4 py-3 text-xs font-medium uppercase tracking-wide text-text-secondary">
            <span>{t('sshSftpDialog.name')}</span>
            <span>{t('sshSftpDialog.type')}</span>
            <span>{t('sshSftpDialog.modifiedAt')}</span>
            <span className="text-right">{t('sshSftpDialog.size')}</span>
            <span className="text-right">{t('sshSftpDialog.actions')}</span>
          </div>

          <div className="max-h-[460px] overflow-auto bg-bg-card">
            {isLoading && !listing && (
              <div className="px-4 py-6 text-sm text-text-secondary">
                {t('common.loading')}
              </div>
            )}

            {!isLoading && listing && listing.entries.length === 0 && (
              <div className="px-4 py-6 text-sm text-text-secondary">
                {t('sshSftpDialog.empty')}
              </div>
            )}

            {listing?.entries.map((entry) => (
              <div
                key={entry.path}
                className="grid grid-cols-[minmax(0,1.5fr)_120px_170px_100px_220px] gap-3 border-b border-border-subtle/60 px-4 py-3 text-sm text-text-primary last:border-b-0"
              >
                <div className="flex min-w-0 items-center gap-2">
                  {isDirectoryEntry(entry) ? (
                    <Folder size={16} className="shrink-0 text-status-running" />
                  ) : (
                    <Download size={16} className="shrink-0 text-text-secondary" />
                  )}
                  <button
                    type="button"
                    onClick={() => void (
                      isDirectoryEntry(entry)
                        ? handleNavigate(entry.symlinkTargetPath || entry.path)
                        : handleDownloadFile(entry)
                    )}
                    className="truncate text-left hover:text-status-running"
                    title={entry.path}
                  >
                    {entry.name}
                  </button>
                </div>
                <span className="text-text-secondary">
                  {isDirectoryEntry(entry)
                    ? t('common.folder')
                    : entry.isSymbolicLink
                      ? t('sshSftpDialog.symlink')
                      : t('sshSftpDialog.file')}
                </span>
                <span className="text-text-secondary">
                  {formatModifiedAt(entry.modifiedAt)}
                </span>
                <span className="text-right text-text-secondary">
                  {isDirectoryEntry(entry) ? '-' : formatFileSize(entry.size)}
                </span>
                <div className="flex items-center justify-end gap-3 text-xs">
                  {isDirectoryEntry(entry) ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleNavigate(entry.symlinkTargetPath || entry.path)}
                        className="text-status-running hover:opacity-80"
                      >
                        {t('sshSftpDialog.open')}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDownloadDirectory(entry)}
                        disabled={downloadingPath === entry.path}
                        className="text-status-running hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {downloadingPath === entry.path ? t('common.loading') : t('sshSftpDialog.downloadDirectory')}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleDownloadFile(entry)}
                      disabled={downloadingPath === entry.path}
                      className="text-status-running hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {downloadingPath === entry.path ? t('common.loading') : t('sshSftpDialog.download')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDeletingEntry(entry)}
                    className="inline-flex items-center gap-1 text-red-300 hover:text-red-200"
                  >
                    <Trash2 size={12} />
                    {t('common.delete')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <ConfirmDialog
          open={Boolean(deletingEntry)}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              setDeletingEntry(null);
            }
          }}
          title={t('sshSftpDialog.deleteTitle')}
          description={t('sshSftpDialog.deleteDescription', {
            path: deletingEntry?.path ?? '',
          })}
          confirmText={isDeleting ? t('common.loading') : t('common.delete')}
          onConfirm={() => {
            void handleDeleteEntry();
          }}
          variant="danger"
        />
      </div>
    </Dialog>
  );
}

function formatFileSize(size: number): string {
  if (!Number.isFinite(size) || size < 1024) {
    return `${size || 0} B`;
  }

  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = size / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatModifiedAt(value: string | null): string {
  if (!value) {
    return '-';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function getParentSftpPath(value: string): string {
  if (value === '/' || !value) {
    return '/';
  }

  const segments = value.split('/').filter(Boolean);
  if (segments.length <= 1) {
    return '/';
  }

  return `/${segments.slice(0, -1).join('/')}`;
}

function shouldFallbackToHomeDirectory(message: string): boolean {
  return message.trim().toLowerCase().includes('no such file');
}
