import React, { useState } from 'react';
import { X, FolderOpen, Check } from 'lucide-react';

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
          alert('未找到子文件夹');
        }
      }
    } catch (error) {
      console.error('Failed to scan folder:', error);
      alert('扫描文件夹失败');
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
      alert('请至少选择一个文件夹');
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-[rgb(var(--background))] rounded-lg shadow-xl w-[600px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[rgb(var(--border))]">
          <h2 className="text-lg font-semibold text-[rgb(var(--foreground))]">
            批量添加终端窗口
          </h2>
          <button
            onClick={handleClose}
            className="p-1 rounded-lg hover:bg-[rgb(var(--accent))] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {folders.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-20 h-20 rounded-2xl bg-[rgb(var(--primary))]/10 flex items-center justify-center mb-6">
                <FolderOpen className="h-10 w-10 text-[rgb(var(--primary))]" />
              </div>
              <h3 className="text-xl font-semibold text-[rgb(var(--foreground))] mb-3">
                批量创建终端窗口
              </h3>
              <p className="text-sm text-[rgb(var(--muted-foreground))] text-center max-w-md mb-8 leading-relaxed">
                选择一个父文件夹，系统将自动扫描其中的所有一级子文件夹
                <br />
                <span className="text-xs">(不包括以 . 开头的隐藏文件夹)</span>
              </p>
              <button
                onClick={handleSelectFolder}
                disabled={isScanning}
                className="flex items-center gap-2 px-8 py-3 rounded-lg bg-[rgb(var(--primary))] text-[rgb(var(--primary-foreground))] font-medium hover:opacity-90 transition-all disabled:opacity-50 shadow-lg shadow-[rgb(var(--primary))]/20"
              >
                <FolderOpen className="h-5 w-5" />
                <span>{isScanning ? '扫描中...' : '选择文件夹'}</span>
              </button>
            </div>
          ) : (
            /* Folder list */
            <div className="space-y-4">
              {/* Parent path */}
              <div className="p-4 rounded-lg bg-[rgb(var(--accent))]/50 border border-[rgb(var(--border))]">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-[rgb(var(--muted-foreground))] mb-1">
                      扫描路径
                    </p>
                    <p className="text-sm font-mono text-[rgb(var(--foreground))] break-all">
                      {parentPath}
                    </p>
                  </div>
                  <button
                    onClick={handleSelectFolder}
                    disabled={isScanning}
                    className="flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-md bg-[rgb(var(--primary))] text-[rgb(var(--primary-foreground))] hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {isScanning ? '扫描中...' : '重新选择'}
                  </button>
                </div>
              </div>

              {/* Folder list header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[rgb(var(--primary))]"></div>
                  <p className="text-sm font-medium text-[rgb(var(--foreground))]">
                    找到 {folders.length} 个文件夹
                  </p>
                  <span className="text-xs text-[rgb(var(--muted-foreground))]">
                    已选择 {selectedCount} 个
                  </span>
                </div>
                <button
                  onClick={handleToggleAll}
                  className="text-sm font-medium text-[rgb(var(--primary))] hover:underline"
                >
                  {folders.every(f => f.selected) ? '取消全选' : '全选'}
                </button>
              </div>

              {/* Folder list */}
              <div className="max-h-[320px] overflow-y-auto space-y-1.5 border border-[rgb(var(--border))] rounded-lg p-3 bg-[rgb(var(--accent))]/20">
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
            className="px-4 py-2 rounded-lg text-sm font-medium text-[rgb(var(--foreground))] hover:bg-[rgb(var(--accent))] transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={selectedCount === 0}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-[rgb(var(--primary))] text-[rgb(var(--primary-foreground))] hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            创建 {selectedCount} 个窗口
          </button>
        </div>
      </div>
    </div>
  );
}
