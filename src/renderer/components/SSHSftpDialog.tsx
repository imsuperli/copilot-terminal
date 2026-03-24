import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  ChevronRight,
  Crosshair,
  Download,
  File,
  Filter,
  Folder,
  FolderPlus,
  FolderUp,
  Info,
  RefreshCw,
  Trash2,
  Upload,
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

const SSH_SFTP_PANEL_WIDTH_STORAGE_KEY = 'ssh-sftp-panel-width';
const SSH_SFTP_PANEL_DEFAULT_WIDTH = 288;
const SSH_SFTP_PANEL_MIN_WIDTH = 240;
const SSH_SFTP_PANEL_MAX_WIDTH = 520;

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
  const [isEditingPath, setIsEditingPath] = useState(false);
  const [followTerminalCwd, setFollowTerminalCwd] = useState(true);
  const [selectedEntryPath, setSelectedEntryPath] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<PanelNotice | null>(null);
  const [panelWidth, setPanelWidth] = useState<number>(() => readStoredPanelWidth());
  const [isResizing, setIsResizing] = useState(false);
  const lastLoadedPathRef = useRef<string | null>(null);
  const noticeIdRef = useRef(0);
  const resizeStartRef = useRef<{ startX: number; startWidth: number } | null>(null);

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
    setSelectedEntryPath(null);
    setIsEditingPath(false);
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
    }, 1000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [notice]);

  useEffect(() => {
    window.localStorage.setItem(SSH_SFTP_PANEL_WIDTH_STORAGE_KEY, String(panelWidth));
  }, [panelWidth]);

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const resizeState = resizeStartRef.current;
      if (!resizeState) {
        return;
      }

      const nextWidth = clampPanelWidth(resizeState.startWidth + (event.clientX - resizeState.startX));
      setPanelWidth(nextWidth);
    };

    const handleMouseUp = () => {
      resizeStartRef.current = null;
      setIsResizing(false);
      document.body.style.removeProperty('cursor');
      document.body.style.removeProperty('user-select');
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.removeProperty('cursor');
      document.body.style.removeProperty('user-select');
    };
  }, [isResizing]);

  const handleManualNavigate = useCallback(async (targetPath: string) => {
    setFollowTerminalCwd(false);
    setSelectedEntryPath(null);
    await loadDirectory(targetPath);
  }, [loadDirectory]);

  const handleSubmitPath = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextPath = pathInput.trim();
    if (!nextPath) {
      return;
    }

    await handleManualNavigate(nextPath);
    setIsEditingPath(false);
  }, [handleManualNavigate, pathInput]);

  const handlePathEditorBlur = useCallback((event: React.FocusEvent<HTMLFormElement>) => {
    const nextFocusedElement = event.relatedTarget as Node | null;
    if (nextFocusedElement && event.currentTarget.contains(nextFocusedElement)) {
      return;
    }

    setPathInput(listing?.path || currentCwd || initialPath || '~');
    setIsEditingPath(false);
  }, [currentCwd, initialPath, listing?.path]);

  const handleNavigateUp = useCallback(async () => {
    const currentPathValue = listing?.path;
    if (!currentPathValue) {
      return;
    }

    setSelectedEntryPath(null);
    await handleManualNavigate(getParentSftpPath(currentPathValue));
  }, [handleManualNavigate, listing?.path]);

  const handleSyncCurrentCwd = useCallback(async () => {
    const nextPath = currentCwd?.trim();
    if (!nextPath) {
      return;
    }

    setFollowTerminalCwd(true);
    setSelectedEntryPath(null);
    await loadDirectory(nextPath);
  }, [currentCwd, loadDirectory]);

  const handleResizeStart = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    resizeStartRef.current = {
      startX: event.clientX,
      startWidth: panelWidth,
    };
    setIsResizing(true);
  }, [panelWidth]);

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

    const entryToDelete = deletingEntry;
    const deletingEntryName = entryToDelete.name;
    const deletingEntryPath = entryToDelete.path;

    setIsDeleting(true);
    setError('');
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
        remotePath: deletingEntryPath,
      });
      if (!response.success) {
        throw new Error(response.error || t('sshSftpDialog.deleteError'));
      }

      setSelectedEntryPath((currentPath) => (currentPath === deletingEntryPath ? null : currentPath));
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
        className="relative flex h-full shrink-0 flex-col border-r border-zinc-800 bg-zinc-950/95 backdrop-blur"
        style={{ width: `${panelWidth}px` }}
      >
        <div
          data-testid="ssh-sftp-resize-handle"
          role="separator"
          aria-orientation="vertical"
          onMouseDown={handleResizeStart}
          className={`absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize ${
            isResizing ? 'bg-blue-500/20' : 'bg-transparent'
          }`}
        />

        <div className="border-b border-zinc-800 px-2 py-1.5">
          <div className="mb-1 flex items-center gap-1">
            {isEditingPath ? (
              <form
                className="flex min-w-0 flex-1 items-center gap-1"
                onSubmit={handleSubmitPath}
                onBlur={handlePathEditorBlur}
              >
                <input
                  autoFocus
                  value={pathInput}
                  onChange={(event) => setPathInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      setPathInput(listing?.path || currentCwd || initialPath || '~');
                      setIsEditingPath(false);
                    }
                  }}
                  className="min-w-0 flex-1 rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 outline-none transition-colors focus:border-blue-500"
                  placeholder="/srv/app"
                  data-testid="ssh-sftp-path-input"
                />
                <button
                  type="submit"
                  aria-label={t('sshSftpDialog.go')}
                  className="flex h-6 w-6 items-center justify-center rounded border border-zinc-800 bg-zinc-900 text-zinc-200 transition-colors hover:bg-zinc-800"
                >
                  <ArrowRight size={13} />
                </button>
                <AppTooltip content={t('sshSftpDialog.hide')}>
                  <button
                    type="button"
                    aria-label={t('sshSftpDialog.hide')}
                    onClick={() => onOpenChange(false)}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
                  >
                    <X size={11} />
                  </button>
                </AppTooltip>
              </form>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setIsEditingPath(true)}
                  className="flex min-w-0 flex-1 items-center gap-0 overflow-x-auto rounded border border-zinc-800 bg-zinc-900/70 px-1 py-0.5 text-left"
                  data-testid="ssh-sftp-breadcrumbs"
                >
                  {pathSegments.map((segment, index) => (
                    <React.Fragment key={segment.path}>
                      {index > 0 && <ChevronRight size={10} className="shrink-0 text-zinc-600" />}
                      <span
                        className="shrink-0 rounded px-1 py-0 text-[11px] leading-tight text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                      >
                        {segment.label}
                      </span>
                    </React.Fragment>
                  ))}
                </button>
                <button
                  type="button"
                  aria-label={t('sshSftpDialog.go')}
                  onClick={() => setIsEditingPath(true)}
                  className="flex h-6 w-6 items-center justify-center rounded border border-zinc-800 bg-zinc-900 text-zinc-200 transition-colors hover:bg-zinc-800"
                >
                  <ArrowRight size={13} />
                </button>
                <AppTooltip content={t('sshSftpDialog.hide')}>
                  <button
                    type="button"
                    aria-label={t('sshSftpDialog.hide')}
                    onClick={() => onOpenChange(false)}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
                  >
                    <X size={11} />
                  </button>
                </AppTooltip>
              </>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-1">
            <IconToolbarButton
              label={t('sshSftpDialog.up')}
              icon={<ArrowUp size={14} />}
              onClick={() => void handleNavigateUp()}
              disabled={isLoading || !listing}
            />
            <IconToolbarButton
              label={t('sshSftpDialog.refresh')}
              icon={<RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />}
              onClick={() => void loadDirectory(listing?.path || currentCwd || initialPath || undefined)}
              disabled={isLoading}
            />
            <IconToolbarButton
              label={t('sshSftpDialog.syncCwd')}
              icon={<Crosshair size={14} />}
              onClick={() => void handleSyncCurrentCwd()}
              disabled={!currentCwd?.trim()}
              active={followTerminalCwd}
            />
            <IconToolbarButton
              label={t('sshSftpDialog.uploadFiles')}
              icon={<Upload size={14} />}
              onClick={() => void handleUploadFiles()}
              disabled={!listing || isUploadingFiles}
            />
            <IconToolbarButton
              label={t('sshSftpDialog.uploadDirectory')}
              icon={<FolderUp size={14} />}
              onClick={() => void handleUploadDirectory()}
              disabled={!listing || isUploadingDirectory}
            />
            <IconToolbarButton
              label={t('sshSftpDialog.newDirectory')}
              icon={<FolderPlus size={14} />}
              onClick={() => setCreatingDirectory((previous) => !previous)}
              disabled={!listing}
              active={creatingDirectory}
            />
          </div>

          {creatingDirectory && (
            <form className="mt-1.5 flex items-center gap-1" onSubmit={handleCreateDirectory}>
              <input
                value={directoryName}
                onChange={(event) => setDirectoryName(event.target.value)}
                className="min-w-0 flex-1 rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 outline-none transition-colors focus:border-blue-500"
                placeholder={t('sshSftpDialog.directoryNamePlaceholder')}
              />
              <button
                type="submit"
                disabled={isCreatingDirectory}
                className="rounded bg-blue-600 px-2 py-1 text-[11px] font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isCreatingDirectory ? t('common.creating') : t('common.create')}
              </button>
            </form>
          )}

          <div className="mt-1.5 flex items-center gap-2 rounded border border-zinc-800 bg-zinc-900 px-2 py-1">
            <Filter size={12} className="shrink-0 text-zinc-500" />
            <input
              value={filterText}
              onChange={(event) => setFilterText(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-xs text-zinc-100 outline-none placeholder:text-zinc-500"
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
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {notice.tone === 'progress' ? (
                    <RefreshCw size={14} className="shrink-0 animate-spin" />
                  ) : notice.tone === 'success' ? (
                    <CheckCircle2 size={14} className="shrink-0" />
                  ) : (
                    <Info size={14} className="shrink-0" />
                  )}
                  <span className="truncate">{notice.message}</span>
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
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-current/70 transition-colors hover:bg-black/10 hover:text-current"
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

        <div className="min-h-0 flex-1 overflow-y-auto px-1 py-1">
          {isLoading && !listing && (
            <PanelEmptyState label={t('common.loading')} />
          )}

          {!isLoading && listing && filteredEntries.length === 0 && (
            <PanelEmptyState label={filterText.trim() ? t('sshSftpDialog.noMatch') : t('sshSftpDialog.empty')} />
          )}

          <div className="space-y-px">
            {filteredEntries.map((entry) => {
              const isDirectory = isDirectoryEntry(entry);
              const isDownloading = downloadingPath === entry.path;
              const isSelected = selectedEntryPath === entry.path;

              return (
                <div
                  key={entry.path}
                  className={`group relative flex items-center gap-1.5 rounded border px-1.5 py-px transition-colors ${
                    isSelected
                      ? 'border-blue-500/40 bg-blue-500/10'
                      : 'border-transparent hover:border-zinc-800 hover:bg-zinc-900/80'
                  }`}
                >
                  <button
                    type="button"
                    aria-label={entry.name}
                    onClick={() => {
                      if (isDirectory) {
                        setSelectedEntryPath(null);
                        void handleManualNavigate(entry.symlinkTargetPath || entry.path);
                        return;
                      }

                      setSelectedEntryPath(entry.path);
                    }}
                    className={`flex min-w-0 flex-1 items-center gap-2 text-left ${
                      isDirectory ? 'pr-16' : 'pr-12'
                    }`}
                    title={entry.path}
                  >
                    {isDirectory ? (
                      <Folder size={14} className="shrink-0 text-blue-400" />
                    ) : (
                      <File size={14} className="shrink-0 text-zinc-500" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-zinc-100">
                      {entry.name}
                    </span>
                  </button>

                  <div className={`absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5 transition-opacity ${
                    isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
                  }`}>
                    {isDirectory ? (
                      <>
                        <InlineActionButton
                          label={t('sshSftpDialog.open')}
                          icon={<Folder size={13} />}
                          onClick={() => void handleManualNavigate(entry.symlinkTargetPath || entry.path)}
                        />
                        <InlineActionButton
                          label={isDownloading ? t('common.loading') : t('sshSftpDialog.downloadDirectory')}
                          icon={<Download size={13} />}
                          onClick={() => void handleDownloadDirectory(entry)}
                          disabled={isDownloading}
                        />
                      </>
                    ) : (
                      <InlineActionButton
                        label={isDownloading ? t('common.loading') : t('sshSftpDialog.download')}
                        icon={isDownloading ? <RefreshCw size={13} className="animate-spin" /> : <Download size={13} />}
                        onClick={() => void handleDownloadFile(entry)}
                        disabled={isDownloading}
                      />
                    )}

                    <button
                      type="button"
                      aria-label={t('common.delete')}
                      onClick={() => setDeletingEntry(entry)}
                      className="flex h-5 w-5 items-center justify-center rounded text-red-300 transition-colors hover:bg-red-500/10 hover:text-red-200"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </aside>

      {deletingEntry && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !isDeleting) {
              setDeletingEntry(null);
            }
          }}
        >
          <div
            style={{
              background: '#18181b',
              padding: '24px',
              borderRadius: '8px',
              maxWidth: '480px',
              width: '100%',
              border: '1px solid #27272a',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'start', gap: '16px' }}>
              <div style={{ color: '#ef4444', flexShrink: 0, marginTop: '2px' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ color: '#f4f4f5', marginBottom: '8px', fontSize: '18px', fontWeight: 600 }}>
                  {t('sshSftpDialog.deleteTitle')}
                </h3>
                <p style={{
                  color: '#a1a1aa',
                  marginBottom: '24px',
                  fontSize: '14px',
                  wordBreak: 'break-all',
                  overflowWrap: 'break-word'
                }}>
                  {t('sshSftpDialog.deleteDescription', { path: deletingEntry.path })}
                </p>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setDeletingEntry(null)}
                    disabled={isDeleting}
                    style={{
                      padding: '8px 16px',
                      background: '#27272a',
                      color: '#d4d4d8',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: isDeleting ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      fontWeight: 500,
                      opacity: isDeleting ? 0.5 : 1
                    }}
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={() => void handleDeleteEntry()}
                    disabled={isDeleting}
                    style={{
                      padding: '8px 16px',
                      background: '#dc2626',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: isDeleting ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      fontWeight: 500,
                      opacity: isDeleting ? 0.7 : 1
                    }}
                  >
                    {isDeleting ? t('common.loading') : t('common.delete')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function IconToolbarButton({
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
    <AppTooltip content={label}>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        disabled={disabled}
        className={`flex h-7 w-7 items-center justify-center rounded border transition-colors ${
          active
            ? 'border-blue-500/40 bg-blue-500/10 text-blue-200'
            : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100'
        } disabled:cursor-not-allowed disabled:opacity-50`}
      >
        {icon}
      </button>
    </AppTooltip>
  );
}

function InlineActionButton({
  label,
  icon,
  onClick,
  disabled = false,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <AppTooltip content={label}>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        disabled={disabled}
        className="flex h-5 w-5 items-center justify-center rounded text-blue-300 transition-colors hover:bg-blue-500/10 hover:text-blue-200 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {icon}
      </button>
    </AppTooltip>
  );
}

function PanelEmptyState({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center px-4 py-10 text-center text-sm text-zinc-500">
      {label}
    </div>
  );
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

function clampPanelWidth(width: number): number {
  const viewportLimit = Math.max(SSH_SFTP_PANEL_MIN_WIDTH, Math.floor(window.innerWidth * 0.45));
  return Math.min(Math.max(Math.round(width), SSH_SFTP_PANEL_MIN_WIDTH), Math.min(SSH_SFTP_PANEL_MAX_WIDTH, viewportLimit));
}

function readStoredPanelWidth(): number {
  const storedValue = Number.parseInt(window.localStorage.getItem(SSH_SFTP_PANEL_WIDTH_STORAGE_KEY) || '', 10);
  if (Number.isFinite(storedValue)) {
    return clampPanelWidth(storedValue);
  }

  return clampPanelWidth(SSH_SFTP_PANEL_DEFAULT_WIDTH);
}
