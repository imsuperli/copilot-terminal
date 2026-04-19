import React, { useState } from 'react';
import { X, FolderOpen, Check } from 'lucide-react';
import { useI18n } from '../i18n';
import {
  idePopupActionButtonClassName,
  idePopupEmptyStateClassName,
  idePopupIconButtonClassName,
  idePopupPanelClassName,
  idePopupSecondaryButtonClassName,
  idePopupSurfaceClassName,
} from './ui/ide-popup';

interface BatchCreateWindowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (selectedPaths: string[]) => void;
}

interface ScannedFolder {
  name: string;
  path: string;
  selected: boolean;
}

export function BatchCreateWindowDialog({
  open,
  onOpenChange,
  onConfirm,
}: BatchCreateWindowDialogProps) {
  const { t } = useI18n();
  const [folders, setFolders] = useState<ScannedFolder[]>([]);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  const handleSelectFolder = async () => {
    setIsScanning(true);
    try {
      const result = await window.electronAPI.selectAndScanFolder();

      if (result.success && result.data) {
        const { folders: scannedFolders, parentPath: path } = result.data;

        if (scannedFolders && scannedFolders.length > 0) {
          setFolders(scannedFolders.map(f => ({ ...f, selected: true })));
          setParentPath(path);
        } else {
          alert(t('batchCreate.noSubfoldersFound'));
        }
      }
    } catch (error) {
      console.error('Failed to scan folder:', error);
      alert(t('batchCreate.scanFailed'));
    } finally {
      setIsScanning(false);
    }
  };

  const handleToggleFolder = (index: number) => {
    setFolders(prev => prev.map((f, i) =>
      i === index ? { ...f, selected: !f.selected } : f
    ));
  };

  const handleToggleAll = () => {
    const allSelected = folders.every(f => f.selected);
    setFolders(prev => prev.map(f => ({ ...f, selected: !allSelected })));
  };

  const handleConfirm = () => {
    const selectedPaths = folders
      .filter(f => f.selected)
      .map(f => f.path);

    if (selectedPaths.length === 0) {
      alert(t('batchCreate.selectAtLeastOne'));
      return;
    }

    onConfirm(selectedPaths);
    handleClose();
  };

  const handleClose = () => {
    setFolders([]);
    setParentPath(null);
    onOpenChange(false);
  };

  if (!open) return null;

  const selectedCount = folders.filter(f => f.selected).length;
  const primaryButtonClassName = `${idePopupActionButtonClassName('primary')} rounded-lg px-4 py-2 text-sm font-medium`;
  const secondaryButtonClassName = `${idePopupSecondaryButtonClassName} rounded-lg px-4 py-2 text-sm font-medium`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className={`${idePopupSurfaceClassName} flex w-[600px] max-h-[80vh] flex-col rounded-lg`}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[rgb(var(--border))]">
          <h2 className="text-lg font-semibold text-[rgb(var(--foreground))]">
            {t('batchCreate.title')}
          </h2>
          <button
            onClick={handleClose}
            className={`${idePopupIconButtonClassName} p-1 rounded-lg`}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {folders.length === 0 ? (
            /* Empty state */
            <div className={`flex flex-col items-center justify-center py-12 ${idePopupEmptyStateClassName}`}>
              <div className="w-20 h-20 rounded-2xl bg-[rgb(var(--primary))]/10 flex items-center justify-center mb-6">
                <FolderOpen className="h-10 w-10 text-[rgb(var(--primary))]" />
              </div>
              <h3 className="text-xl font-semibold text-[rgb(var(--foreground))] mb-3">
                {t('batchCreate.heading')}
              </h3>
              <p className="text-sm text-[rgb(var(--muted-foreground))] text-center max-w-md mb-8 leading-relaxed">
                {t('batchCreate.description')}
                <br />
                <span className="text-xs">({t('batchCreate.hiddenFolderNote')})</span>
              </p>
              <button
                onClick={handleSelectFolder}
                disabled={isScanning}
                className={`${idePopupActionButtonClassName('primary')} flex items-center gap-2 rounded-lg px-8 py-3 font-medium disabled:opacity-50`}
              >
                <FolderOpen className="h-5 w-5" />
                <span>{isScanning ? t('common.loading') : t('batchCreate.chooseFolder')}</span>
              </button>
            </div>
          ) : (
            /* Folder list */
            <div className="space-y-4">
              {/* Parent path */}
              <div className={`${idePopupPanelClassName} p-4`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-[rgb(var(--muted-foreground))] mb-1">
                      {t('batchCreate.scanPath')}
                    </p>
                    <p className="text-sm font-mono text-[rgb(var(--foreground))] break-all">
                      {parentPath}
                    </p>
                  </div>
                  <button
                    onClick={handleSelectFolder}
                    disabled={isScanning}
                    className={`${idePopupActionButtonClassName('primary')} flex-shrink-0 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50`}
                  >
                    {isScanning ? t('common.loading') : t('batchCreate.reselect')}
                  </button>
                </div>
              </div>

              {/* Folder list header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[rgb(var(--primary))]"></div>
                  <p className="text-sm font-medium text-[rgb(var(--foreground))]">
                    {t('batchCreate.foundFolders', { count: folders.length })}
                  </p>
                  <span className="text-xs text-[rgb(var(--muted-foreground))]">
                    {t('batchCreate.selectedFolders', { count: selectedCount })}
                  </span>
                </div>
                <button
                  onClick={handleToggleAll}
                  className="text-sm font-medium text-[rgb(var(--primary))] hover:underline"
                >
                  {folders.every(f => f.selected) ? t('batchCreate.deselectAll') : t('batchCreate.selectAll')}
                </button>
              </div>

              {/* Folder list */}
              <div className={`${idePopupPanelClassName} max-h-[320px] space-y-1.5 overflow-y-auto rounded-lg p-3`}>
                {folders.map((folder, index) => (
                  <label
                    key={folder.path}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-[rgb(var(--accent))] cursor-pointer transition-all group"
                  >
                    <input
                      type="checkbox"
                      checked={folder.selected}
                      onChange={() => handleToggleFolder(index)}
                      className="w-4 h-4 rounded border-[rgb(var(--border))] text-[rgb(var(--primary))] focus:ring-2 focus:ring-[rgb(var(--primary))]"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[rgb(var(--foreground))] truncate group-hover:text-[rgb(var(--primary))] transition-colors">
                        {folder.name}
                      </p>
                      <p className="text-xs text-[rgb(var(--muted-foreground))] truncate font-mono mt-0.5">
                        {folder.path}
                      </p>
                    </div>
                    {folder.selected && (
                      <Check className="h-4 w-4 text-[rgb(var(--primary))] flex-shrink-0" />
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-[rgb(var(--border))]">
          <button
            onClick={handleClose}
            className={secondaryButtonClassName}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={selectedCount === 0}
            className={`${primaryButtonClassName} disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {t('batchCreate.createWindows', { count: selectedCount })}
          </button>
        </div>
      </div>
    </div>
  );
}
