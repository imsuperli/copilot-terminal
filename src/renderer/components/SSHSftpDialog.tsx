import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  Download,
  Filter,
  Folder,
  FolderPlus,
  FolderUp,
  HardDriveDownload,
  HardDriveUpload,
  HelpCircle,
  Info,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import type { SSHSftpDirectoryListing, SSHSftpEntry } from '../../shared/types/ssh';
import { useI18n } from '../i18n';
import { ConfirmDialog } from './ConfirmDialog';
import { AppTooltip } from './ui/AppTooltip';

interface SSHSftpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  windowId: string | null;
  paneId: string | null;
  initialPath?: string | null;
  currentCwd?: string | null;
}

type PanelNotice = {
  id: number;
  tone: 'progress' | 'success' | 'info';
  message: string;
  detail?: string;
};

export function SSHSftpDialog({
  open,
  onOpenChange,
  windowId,
  paneId,
  initialPath,
  currentCwd,
}: SSHSftpDialogProps) {
  const { t } = useI18n();
  const [listing, setListing] = useState<SSHSftpDirectoryListing | null>(null);
  const [pathInput, setPathInput] = useState('');
  const [filterText, setFilterText] = useState('');
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
  const [followTerminalCwd, setFollowTerminalCwd] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<PanelNotice | null>(null);
  const lastLoadedPathRef = useRef<string | null>(null);
  const noticeIdRef = useRef(0);

  const isDirectoryEntry = useCallback((entry: SSHSftpEntry) => (
    entry.isDirectory || entry.symlinkTargetIsDirectory === true
  ), []);

  const showNotice = useCallback((nextNotice: Omit<PanelNotice, 'id'>) => {
    noticeIdRef.current += 1;
    setNotice({
      id: noticeIdRef.current,
      ...nextNotice,
    });
  }, []);

  const loadDirectory = useCallback(async (targetPath?: string) => {
    if (!open || !windowId || !paneId) {
      return;
    }

    setIsLoading(true);
    setError('');
    lastLoadedPathRef.current = targetPath?.trim() || lastLoadedPathRef.current;

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
      lastLoadedPathRef.current = response.data.path;
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
            lastLoadedPathRef.current = fallbackResponse.data.path;
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

    const nextPath = currentCwd?.trim() || initialPath?.trim() || '';
    setListing(null);
    setPathInput(nextPath);
    setFilterText('');
    setDirectoryName('');
    setCreatingDirectory(false);
    setDeletingEntry(null);
    setShowHelp(false);
    setFollowTerminalCwd(true);
    setNotice(null);
    lastLoadedPathRef.current = nextPath || null;
    void loadDirectory(nextPath || undefined);
  }, [initialPath, loadDirectory, open, paneId, windowId]);

  useEffect(() => {
    if (!open || !followTerminalCwd) {
      return;
    }

    const nextCwd = currentCwd?.trim();
    if (!nextCwd || nextCwd === lastLoadedPathRef.current) {
      return;
    }

    void loadDirectory(nextCwd);
  }, [currentCwd, followTerminalCwd, loadDirectory, open]);

  useEffect(() => {
    if (!notice || notice.tone === 'progress') {
      return;
    }

    const currentNoticeId = notice.id;
    const timer = window.setTimeout(() => {
      setNotice((activeNotice) => (activeNotice?.id === currentNoticeId ? null : activeNotice));
    }, 5000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [notice]);

  const handleManualNavigate = useCallback(async (targetPath: string) => {
    setFollowTerminalCwd(false);
    await loadDirectory(targetPath);
  }, [loadDirectory]);

  const handleSubmitPath = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextPath = pathInput.trim();
    if (!nextPath) {
      return;
    }

    await handleManualNavigate(nextPath);
  }, [handleManualNavigate, pathInput]);

  const handleNavigateUp = useCallback(async () => {
    const currentPathValue = listing?.path;
    if (!currentPathValue) {
      return;
    }

    await handleManualNavigate(getParentSftpPath(currentPathValue));
  }, [handleManualNavigate, listing?.path]);

  const handleSyncCurrentCwd = useCallback(async () => {
    const nextPath = currentCwd?.trim();
    if (!nextPath) {
      return;
    }

    setFollowTerminalCwd(true);
    await loadDirectory(nextPath);
  }, [currentCwd, loadDirectory]);

  const handleUploadFiles = useCallback(async () => {
    if (!windowId || !paneId || !listing) {
      return;
    }

    setIsUploadingFiles(true);
    setError('');
    showNotice({
      tone: 'progress',
      message: t('sshSftpDialog.notice.uploadingFiles'),
    });

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
        showNotice({
          tone: 'success',
          message: t('sshSftpDialog.notice.uploadedFiles', {
            count: String(response.data?.uploadedCount ?? 0),
          }),
        });
      } else {
        setNotice(null);
      }
    } catch (uploadError) {
      setError((uploadError as Error).message || t('sshSftpDialog.uploadError'));
      setNotice(null);
    } finally {
      setIsUploadingFiles(false);
    }
  }, [listing, loadDirectory, paneId, showNotice, t, windowId]);

  const handleUploadDirectory = useCallback(async () => {
    if (!windowId || !paneId || !listing) {
      return;
    }

    setIsUploadingDirectory(true);
    setError('');
    showNotice({
      tone: 'progress',
      message: t('sshSftpDialog.notice.uploadingDirectory'),
    });

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
        showNotice({
          tone: 'success',
          message: t('sshSftpDialog.notice.uploadedDirectory', {
            count: String(response.data?.uploadedCount ?? 0),
          }),
        });
      } else {
        setNotice(null);
      }
    } catch (uploadError) {
      setError((uploadError as Error).message || t('sshSftpDialog.uploadDirectoryError'));
      setNotice(null);
    } finally {
      setIsUploadingDirectory(false);
    }
  }, [listing, loadDirectory, paneId, showNotice, t, windowId]);

  const handleDownloadFile = useCallback(async (entry: SSHSftpEntry) => {
    if (!windowId || !paneId || isDirectoryEntry(entry)) {
      return;
    }

    setDownloadingPath(entry.path);
    setError('');
    showNotice({
      tone: 'progress',
      message: t('sshSftpDialog.notice.downloadingFile', {
        name: entry.name,
      }),
    });

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

      if (response.data) {
        showNotice({
          tone: 'success',
          message: t('sshSftpDialog.notice.downloadedFile', {
            name: entry.name,
          }),
          detail: response.data,
        });
      } else {
        showNotice({
          tone: 'info',
          message: t('sshSftpDialog.notice.downloadCancelled', {
            name: entry.name,
          }),
        });
      }
    } catch (downloadError) {
      setError((downloadError as Error).message || t('sshSftpDialog.downloadError'));
      setNotice(null);
    } finally {
      setDownloadingPath(null);
    }
  }, [isDirectoryEntry, paneId, showNotice, t, windowId]);

  const handleDownloadDirectory = useCallback(async (entry: SSHSftpEntry) => {
    if (!windowId || !paneId || !isDirectoryEntry(entry)) {
      return;
    }

    setDownloadingPath(entry.path);
    setError('');
    showNotice({
      tone: 'progress',
      message: t('sshSftpDialog.notice.downloadingDirectory', {
        name: entry.name,
      }),
    });

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

      if (response.data) {
        showNotice({
          tone: 'success',
          message: t('sshSftpDialog.notice.downloadedDirectory', {
            name: entry.name,
          }),
          detail: response.data,
        });
      } else {
        showNotice({
          tone: 'info',
          message: t('sshSftpDialog.notice.downloadCancelled', {
            name: entry.name,
          }),
        });
      }
    } catch (downloadError) {
      setError((downloadError as Error).message || t('sshSftpDialog.downloadDirectoryError'));
      setNotice(null);
    } finally {
      setDownloadingPath(null);
    }
  }, [isDirectoryEntry, paneId, showNotice, t, windowId]);

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
    showNotice({
      tone: 'progress',
      message: t('sshSftpDialog.notice.creatingDirectory', {
        name: trimmedName,
      }),
    });

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
      showNotice({
        tone: 'success',
        message: t('sshSftpDialog.notice.createdDirectory', {
          name: trimmedName,
        }),
      });
    } catch (createError) {
      setError((createError as Error).message || t('sshSftpDialog.createDirectoryError'));
      setNotice(null);
    } finally {
      setIsCreatingDirectory(false);
    }
  }, [directoryName, listing, loadDirectory, paneId, showNotice, t, windowId]);

  const handleDeleteEntry = useCallback(async () => {
    if (!windowId || !paneId || !listing || !deletingEntry) {
      return;
    }

    setIsDeleting(true);
    setError('');
    const deletingEntryName = deletingEntry.name;
    showNotice({
      tone: 'progress',
      message: t('sshSftpDialog.notice.deletingEntry', {
        name: deletingEntryName,
      }),
    });

    try {
      const response = await window.electronAPI.deleteSSHSftpEntry({
        windowId,
        paneId,
        remotePath: deletingEntry.path,
      });
      if (!response.success) {
        throw new Error(response.error || t('sshSftpDialog.deleteError'));
      }

      setListing((currentListing) => {
        if (!currentListing) {
          return currentListing;
        }

        return {
          ...currentListing,
          entries: currentListing.entries.filter((entry) => entry.path !== deletingEntry.path),
        };
      });
      setDeletingEntry(null);
      await loadDirectory(listing.path);
      showNotice({
        tone: 'success',
        message: t('sshSftpDialog.notice.deletedEntry', {
          name: deletingEntryName,
        }),
      });
    } catch (deleteError) {
      setError((deleteError as Error).message || t('sshSftpDialog.deleteError'));
      setNotice(null);
    } finally {
      setIsDeleting(false);
    }
  }, [deletingEntry, listing, loadDirectory, paneId, showNotice, t, windowId]);

  const pathSegments = useMemo(() => {
    const currentPathValue = listing?.path ?? pathInput.trim();
    if (!currentPathValue) {
      return [];
    }

    if (currentPathValue === '/') {
      return [{ label: '/', path: '/' }];
    }

    const segments = currentPathValue.split('/').filter(Boolean);
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

  const filteredEntries = useMemo(() => {
    const entries = listing?.entries ?? [];
    const query = filterText.trim().toLowerCase();

    if (!query) {
      return entries;
    }

    return entries.filter((entry) => (
      entry.name.toLowerCase().includes(query)
      || entry.path.toLowerCase().includes(query)
    ));
  }, [filterText, listing?.entries]);

  if (!open) {
    return null;
  }

  return (
    <>
      <aside
        data-testid="ssh-sftp-panel"
        className="flex h-full w-[clamp(320px,28vw,420px)] shrink-0 flex-col border-r border-zinc-800 bg-zinc-950/95 backdrop-blur"
      >
        <div className="border-b border-zinc-800 px-3 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                {t('sshSftpDialog.title')}
              </div>
              <div className="mt-1 truncate text-sm font-medium text-zinc-100">
                {listing?.path || currentCwd || initialPath || '~'}
              </div>
            </div>

            <div className="flex items-center gap-1">
              <AppTooltip content={t('sshSftpDialog.helpAriaLabel')}>
                <button
                  type="button"
                  aria-label={t('sshSftpDialog.helpAriaLabel')}
                  onClick={() => setShowHelp((current) => !current)}
                  className={`flex h-8 w-8 items-center justify-center rounded-md border transition-colors ${
                    showHelp
                      ? 'border-blue-500/40 bg-blue-500/10 text-blue-200'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
                  }`}
                >
                  <HelpCircle size={15} />
                </button>
              </AppTooltip>

              <AppTooltip content={t('sshSftpDialog.hide')}>
                <button
                  type="button"
                  aria-label={t('sshSftpDialog.hide')}
                  onClick={() => onOpenChange(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                >
                  <X size={15} />
                </button>
              </AppTooltip>
            </div>
          </div>

          {showHelp && (
            <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-3 text-xs leading-5 text-zinc-400">
              <p>{t('sshSftpDialog.description')}</p>
              <p className="mt-2">{t('sshSftpDialog.scopeHint')}</p>
            </div>
          )}
        </div>

        <div className="border-b border-zinc-800 px-3 py-3">
          <div className="mb-2 flex items-center gap-1 overflow-x-auto pb-1">
            {pathSegments.map((segment, index) => (
              <React.Fragment key={segment.path}>
                {index > 0 && <ChevronRight size={12} className="shrink-0 text-zinc-600" />}
                <button
                  type="button"
                  onClick={() => void handleManualNavigate(segment.path)}
                  className="shrink-0 rounded-md px-2 py-1 text-xs text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                >
                  {segment.label}
                </button>
              </React.Fragment>
            ))}
          </div>

          <form className="flex items-center gap-2" onSubmit={handleSubmitPath}>
            <input
              value={pathInput}
              onChange={(event) => setPathInput(event.target.value)}
              className="min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none transition-colors focus:border-blue-500"
              placeholder="/srv/app"
            />
            <button
              type="submit"
              className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-800"
            >
              {t('sshSftpDialog.go')}
            </button>
          </form>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <ToolbarButton
              label={t('sshSftpDialog.up')}
              icon={<FolderUp size={14} />}
              onClick={() => void handleNavigateUp()}
              disabled={isLoading || !listing}
            />
            <ToolbarButton
              label={t('sshSftpDialog.refresh')}
              icon={<RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />}
              onClick={() => void loadDirectory(listing?.path || currentCwd || initialPath || undefined)}
              disabled={isLoading}
            />
            <ToolbarButton
              label={t('sshSftpDialog.syncCwd')}
              icon={<Folder size={14} />}
              onClick={() => void handleSyncCurrentCwd()}
              disabled={!currentCwd?.trim()}
              active={followTerminalCwd}
            />
            <ToolbarButton
              label={t('sshSftpDialog.uploadFiles')}
              icon={<HardDriveUpload size={14} />}
              onClick={() => void handleUploadFiles()}
              disabled={!listing || isUploadingFiles}
            />
            <ToolbarButton
              label={t('sshSftpDialog.uploadDirectory')}
              icon={<HardDriveDownload size={14} />}
              onClick={() => void handleUploadDirectory()}
              disabled={!listing || isUploadingDirectory}
            />
            <ToolbarButton
              label={t('sshSftpDialog.newDirectory')}
              icon={<FolderPlus size={14} />}
              onClick={() => setCreatingDirectory((previous) => !previous)}
              disabled={!listing}
              active={creatingDirectory}
            />
          </div>

          {creatingDirectory && (
            <form className="mt-3 flex items-center gap-2" onSubmit={handleCreateDirectory}>
              <input
                value={directoryName}
                onChange={(event) => setDirectoryName(event.target.value)}
                className="min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none transition-colors focus:border-blue-500"
                placeholder={t('sshSftpDialog.directoryNamePlaceholder')}
              />
              <button
                type="submit"
                disabled={isCreatingDirectory}
                className="rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isCreatingDirectory ? t('common.creating') : t('common.create')}
              </button>
            </form>
          )}

          <div className="mt-3 flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2">
            <Filter size={14} className="shrink-0 text-zinc-500" />
            <input
              value={filterText}
              onChange={(event) => setFilterText(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
              placeholder={t('sshSftpDialog.filterPlaceholder')}
            />
          </div>
        </div>

        {error && (
          <div className="mx-3 mt-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        {notice && (
          <div className={`mx-3 mt-3 rounded-md border px-3 py-2 text-sm ${
            notice.tone === 'progress'
              ? 'border-blue-500/30 bg-blue-500/10 text-blue-100'
              : notice.tone === 'success'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
                : 'border-zinc-700 bg-zinc-900 text-zinc-200'
          }`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {notice.tone === 'progress' ? (
                    <RefreshCw size={14} className="shrink-0 animate-spin" />
                  ) : notice.tone === 'success' ? (
                    <CheckCircle2 size={14} className="shrink-0" />
                  ) : (
                    <Info size={14} className="shrink-0" />
                  )}
                  <span>{notice.message}</span>
                </div>
                {notice.detail && (
                  <div className="mt-1 truncate font-mono text-[11px] text-current/80">
                    {notice.detail}
                  </div>
                )}
              </div>

              <button
                type="button"
                aria-label={t('common.close')}
                onClick={() => setNotice(null)}
                className="flex h-6 w-6 items-center justify-center rounded-md text-current/70 transition-colors hover:bg-black/10 hover:text-current"
              >
                <X size={13} />
              </button>
            </div>

            {notice.tone === 'progress' && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-full animate-pulse rounded-full bg-current/70" />
              </div>
            )}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {isLoading && !listing && (
            <PanelEmptyState label={t('common.loading')} />
          )}

          {!isLoading && listing && filteredEntries.length === 0 && (
            <PanelEmptyState label={filterText.trim() ? t('sshSftpDialog.noMatch') : t('sshSftpDialog.empty')} />
          )}

          <div className="space-y-1">
            {filteredEntries.map((entry) => {
              const isDirectory = isDirectoryEntry(entry);
              const isDownloading = downloadingPath === entry.path;

              return (
                <div
                  key={entry.path}
                  className="group flex items-center gap-2 rounded-lg border border-transparent px-2 py-2 transition-colors hover:border-zinc-800 hover:bg-zinc-900/80"
                >
                  <button
                    type="button"
                    aria-label={entry.name}
                    onClick={() => void (
                      isDirectory
                        ? handleManualNavigate(entry.symlinkTargetPath || entry.path)
                        : handleDownloadFile(entry)
                    )}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    title={entry.path}
                  >
                    {isDirectory ? (
                      <Folder size={16} className="shrink-0 text-blue-400" />
                    ) : (
                      <Download size={16} className="shrink-0 text-zinc-500" />
                    )}

                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-zinc-100">
                        {entry.name}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zinc-500">
                        <span>
                          {isDirectory
                            ? t('common.folder')
                            : entry.isSymbolicLink
                              ? t('sshSftpDialog.symlink')
                              : t('sshSftpDialog.file')}
                        </span>
                        <span>{formatModifiedAt(entry.modifiedAt)}</span>
                        {!isDirectory && <span>{formatFileSize(entry.size)}</span>}
                      </div>
                    </div>
                  </button>

                  <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    {isDirectory ? (
                      <>
                        <InlineActionButton
                          label={t('sshSftpDialog.open')}
                          onClick={() => void handleManualNavigate(entry.symlinkTargetPath || entry.path)}
                        />
                        <InlineActionButton
                          label={isDownloading ? t('common.loading') : t('sshSftpDialog.downloadDirectory')}
                          onClick={() => void handleDownloadDirectory(entry)}
                          disabled={isDownloading}
                        />
                      </>
                    ) : (
                      <InlineActionButton
                        label={isDownloading ? t('common.loading') : t('sshSftpDialog.download')}
                        onClick={() => void handleDownloadFile(entry)}
                        disabled={isDownloading}
                      />
                    )}

                    <button
                      type="button"
                      aria-label={t('common.delete')}
                      onClick={() => setDeletingEntry(entry)}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-red-300 transition-colors hover:bg-red-500/10 hover:text-red-200"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </aside>

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
    </>
  );
}

function ToolbarButton({
  label,
  icon,
  onClick,
  disabled = false,
  active = false,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'border-blue-500/40 bg-blue-500/10 text-blue-200'
          : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100'
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function InlineActionButton({
  label,
  onClick,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-md px-2 py-1 text-xs font-medium text-blue-300 transition-colors hover:bg-blue-500/10 hover:text-blue-200 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {label}
    </button>
  );
}

function PanelEmptyState({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center px-4 py-10 text-center text-sm text-zinc-500">
      {label}
    </div>
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
