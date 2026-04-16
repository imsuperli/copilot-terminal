import React from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
import type { CodePaneDocumentSymbol, CodePaneRange } from '../../../../shared/types/electron-api';
import { useI18n } from '../../../i18n';

interface OutlineTreeNode {
  id: string;
  symbol: CodePaneDocumentSymbol;
  children: OutlineTreeNode[];
}

interface OutlineToolWindowProps {
  fileLabel: string | null;
  symbols: CodePaneDocumentSymbol[];
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
  onRefresh: () => void | Promise<void>;
  onOpenSymbol: (range: CodePaneRange) => void | Promise<void>;
  panelClassName?: string;
  bodyClassName?: string;
  closeOnDoubleClick?: boolean;
}

export function OutlineToolWindow({
  fileLabel,
  symbols,
  isLoading,
  error,
  onClose,
  onRefresh,
  onOpenSymbol,
  panelClassName,
  bodyClassName,
  closeOnDoubleClick = false,
}: OutlineToolWindowProps) {
  const { t } = useI18n();
  const tree = React.useMemo(() => buildOutlineTree(symbols), [symbols]);

  return (
    <div className={panelClassName ?? 'flex h-full min-h-0 flex-col border-t border-zinc-800 bg-zinc-950/90'}>
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-400">
            <FileCode2 size={12} />
            {t('codePane.fileStructureTab')}
          </div>
          <div className="truncate text-xs text-zinc-500">
            {fileLabel ?? t('codePane.fileStructureEmpty')}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void onRefresh();
            }}
            className="rounded bg-zinc-800 p-1 text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-50"
            aria-label={t('codePane.refresh')}
          >
            <RefreshCw size={12} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-zinc-800 p-1 text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-50"
            aria-label={t('codePane.bottomPanelClose')}
          >
            <X size={12} />
          </button>
        </div>
      </div>

      <div className={bodyClassName ?? 'min-h-0 flex-1 overflow-auto px-3 py-3'}>
        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Loader2 size={12} className="animate-spin" />
            {t('codePane.fileStructureLoading')}
          </div>
        ) : error ? (
          <div className="text-xs text-red-300">{error}</div>
        ) : tree.length > 0 ? (
          <div className="space-y-1">
            {tree.map((node) => (
              <OutlineNodeRow
                key={node.id}
                node={node}
                depth={0}
                onOpenSymbol={onOpenSymbol}
                onClose={onClose}
                closeOnDoubleClick={closeOnDoubleClick}
              />
            ))}
          </div>
        ) : (
          <div className="rounded border border-dashed border-zinc-800 bg-zinc-950/60 px-3 py-4 text-xs text-zinc-500">
            {t('codePane.fileStructureEmpty')}
          </div>
        )}
      </div>
    </div>
  );
}

function OutlineNodeRow({
  node,
  depth,
  onOpenSymbol,
  onClose,
  closeOnDoubleClick,
}: {
  node: OutlineTreeNode;
  depth: number;
  onOpenSymbol: (range: CodePaneRange) => void | Promise<void>;
  onClose: () => void;
  closeOnDoubleClick: boolean;
}) {
  const [isExpanded, setIsExpanded] = React.useState(true);
  const hasChildren = node.children.length > 0;
  const kindLabel = getSymbolKindLabel(node.symbol.kind);

  return (
    <div>
      <div
        className="flex items-center gap-2 rounded px-1.5 py-1 transition-colors hover:bg-zinc-900/70"
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => {
              setIsExpanded((currentValue) => !currentValue);
            }}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : (
          <div className="h-5 w-5 shrink-0" />
        )}
        <button
          type="button"
          onClick={() => {
            void onOpenSymbol(node.symbol.selectionRange);
          }}
          onDoubleClick={() => {
            if (!closeOnDoubleClick) {
              return;
            }
            void onOpenSymbol(node.symbol.selectionRange);
            onClose();
          }}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex items-center gap-2">
            <span className="truncate text-xs font-medium text-zinc-100">{node.symbol.name}</span>
            <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.08em] text-zinc-400">
              {kindLabel}
            </span>
          </div>
          {node.symbol.detail && (
            <div className="mt-0.5 truncate text-[10px] text-zinc-500">{node.symbol.detail}</div>
          )}
        </button>
      </div>
      {hasChildren && isExpanded && (
        <div className="space-y-1">
          {node.children.map((child) => (
            <OutlineNodeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              onOpenSymbol={onOpenSymbol}
              onClose={onClose}
              closeOnDoubleClick={closeOnDoubleClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function buildOutlineTree(symbols: CodePaneDocumentSymbol[]): OutlineTreeNode[] {
  return symbols.map((symbol, index) => createOutlineNode(symbol, `outline-${index}`));
}

function createOutlineNode(symbol: CodePaneDocumentSymbol, id: string): OutlineTreeNode {
  return {
    id,
    symbol,
    children: (symbol.children ?? []).map((child, index) => createOutlineNode(child, `${id}-${index}`)),
  };
}

function getSymbolKindLabel(kind: number): string {
  switch (kind) {
    case 5:
      return 'class';
    case 6:
      return 'method';
    case 7:
      return 'property';
    case 8:
      return 'field';
    case 9:
      return 'constructor';
    case 10:
      return 'enum';
    case 11:
      return 'interface';
    case 12:
      return 'function';
    case 13:
      return 'variable';
    case 23:
      return 'struct';
    case 24:
      return 'event';
    default:
      return 'symbol';
  }
}
