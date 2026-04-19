import React from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
import type { CodePaneDocumentSymbol, CodePaneRange } from '../../../../shared/types/electron-api';
import { useI18n } from '../../../i18n';
import {
  IdePopupShell,
  idePopupBadgeClassName,
  idePopupBodyClassName,
  idePopupIconButtonClassName,
  idePopupRowClassName,
  idePopupScrollAreaClassName,
} from '../../ui/ide-popup';

interface OutlineTreeNode {
  id: string;
  symbol: CodePaneDocumentSymbol;
  children: OutlineTreeNode[];
}

interface OutlineVisibleRow {
  node: OutlineTreeNode;
  depth: number;
}

interface OutlineFilterState {
  inherited: boolean;
  anonymous: boolean;
  lambdas: boolean;
}

type WindowedListSlice<T> = {
  items: T[];
  offsetTop: number;
  totalHeight: number;
  isWindowed: boolean;
};

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

const DEFAULT_FILTERS: OutlineFilterState = {
  inherited: false,
  anonymous: false,
  lambdas: false,
};

const OUTLINE_ROW_HEIGHT = 32;
const OUTLINE_ROW_OVERSCAN = 10;
const OUTLINE_WINDOWING_THRESHOLD = 120;

function getWindowedListSlice<T>({
  items,
  scrollTop,
  viewportHeight,
  rowHeight,
  overscan,
  threshold,
}: {
  items: T[];
  scrollTop: number;
  viewportHeight: number;
  rowHeight: number;
  overscan: number;
  threshold: number;
}): WindowedListSlice<T> {
  const totalHeight = items.length * rowHeight;

  if (items.length <= threshold || viewportHeight <= 0) {
    return {
      items,
      offsetTop: 0,
      totalHeight,
      isWindowed: false,
    };
  }

  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(
    items.length,
    Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan,
  );

  return {
    items: items.slice(startIndex, endIndex),
    offsetTop: startIndex * rowHeight,
    totalHeight,
    isWindowed: true,
  };
}

export const OutlineToolWindow = React.memo(function OutlineToolWindow({
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
  const listScrollRef = React.useRef<HTMLDivElement | null>(null);
  const [listScrollTop, setListScrollTop] = React.useState(0);
  const [listViewportHeight, setListViewportHeight] = React.useState(0);
  const pendingListScrollTopRef = React.useRef<number | null>(null);
  const listScrollAnimationFrameRef = React.useRef<number | null>(null);
  const tree = React.useMemo(() => buildOutlineTree(symbols), [symbols]);
  const [filters, setFilters] = React.useState(DEFAULT_FILTERS);
  const [collapsedNodeIds, setCollapsedNodeIds] = React.useState<Set<string>>(() => new Set());
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);
  const filteredTree = React.useMemo(() => filterOutlineTree(tree, filters), [filters, tree]);
  const visibleRows = React.useMemo(
    () => flattenOutlineTree(filteredTree, collapsedNodeIds),
    [collapsedNodeIds, filteredTree],
  );
  const visibleNodeIds = React.useMemo(
    () => visibleRows.map((row) => row.node.id),
    [visibleRows],
  );
  const visibleNodeIdSet = React.useMemo(
    () => new Set(visibleNodeIds),
    [visibleNodeIds],
  );
  const visibleRowSlice = React.useMemo(() => getWindowedListSlice({
    items: visibleRows,
    scrollTop: listScrollTop,
    viewportHeight: listViewportHeight,
    rowHeight: OUTLINE_ROW_HEIGHT,
    overscan: OUTLINE_ROW_OVERSCAN,
    threshold: OUTLINE_WINDOWING_THRESHOLD,
  }), [listScrollTop, listViewportHeight, visibleRows]);

  const scheduleListScrollTopUpdate = React.useCallback((nextScrollTop: number) => {
    pendingListScrollTopRef.current = nextScrollTop;
    if (listScrollAnimationFrameRef.current !== null) {
      return;
    }

    listScrollAnimationFrameRef.current = window.requestAnimationFrame(() => {
      listScrollAnimationFrameRef.current = null;
      const pendingScrollTop = pendingListScrollTopRef.current;
      pendingListScrollTopRef.current = null;
      if (pendingScrollTop !== null) {
        setListScrollTop((currentScrollTop) => (
          currentScrollTop === pendingScrollTop ? currentScrollTop : pendingScrollTop
        ));
      }
    });
  }, []);

  React.useEffect(() => {
    const container = listScrollRef.current;
    if (!container) {
      return;
    }

    const syncViewport = () => {
      setListViewportHeight(container.clientHeight);
      setListScrollTop(container.scrollTop);
    };

    syncViewport();

    const resizeObserver = new ResizeObserver(() => {
      syncViewport();
    });
    resizeObserver.observe(container);
    return () => {
      if (listScrollAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(listScrollAnimationFrameRef.current);
        listScrollAnimationFrameRef.current = null;
      }
      resizeObserver.disconnect();
    };
  }, []);

  React.useEffect(() => {
    setCollapsedNodeIds(new Set());
  }, [symbols]);

  React.useEffect(() => {
    if (visibleNodeIds.length === 0) {
      setSelectedNodeId(null);
      return;
    }

    setSelectedNodeId((currentValue) => (
      currentValue && visibleNodeIdSet.has(currentValue) ? currentValue : visibleNodeIds[0]
    ));
  }, [visibleNodeIdSet, visibleNodeIds]);

  const handleRefresh = React.useCallback(() => {
    void onRefresh();
  }, [onRefresh]);

  const handleToggleInherited = React.useCallback(() => {
    setFilters((currentValue) => ({
      ...currentValue,
      inherited: !currentValue.inherited,
    }));
  }, []);

  const handleToggleAnonymous = React.useCallback(() => {
    setFilters((currentValue) => ({
      ...currentValue,
      anonymous: !currentValue.anonymous,
    }));
  }, []);

  const handleToggleLambdas = React.useCallback(() => {
    setFilters((currentValue) => ({
      ...currentValue,
      lambdas: !currentValue.lambdas,
    }));
  }, []);

  const handleToggleNodeExpanded = React.useCallback((nodeId: string) => {
    setCollapsedNodeIds((currentValue) => {
      const nextValue = new Set(currentValue);
      if (nextValue.has(nodeId)) {
        nextValue.delete(nodeId);
      } else {
        nextValue.add(nodeId);
      }
      return nextValue;
    });
  }, []);

  return (
    <IdePopupShell className={panelClassName ?? 'flex h-full min-h-0 flex-col'}>
      <div className="grid grid-cols-[60px_minmax(0,1fr)_60px] items-center border-b border-zinc-800/90 bg-[linear-gradient(180deg,rgba(46,49,56,0.96)_0%,rgba(35,38,44,0.92)_100%)] px-3 py-2.5">
        <div aria-hidden="true" />
        <div className="min-w-0 truncate text-center text-sm font-semibold leading-5 text-zinc-100">
          {fileLabel ?? t('codePane.fileStructureEmpty')}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleRefresh}
            className={idePopupIconButtonClassName}
            aria-label={t('codePane.refresh')}
          >
            <RefreshCw size={13} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className={idePopupIconButtonClassName}
            aria-label={t('codePane.bottomPanelClose')}
          >
            <X size={13} />
          </button>
        </div>
      </div>

      <div className="border-b border-zinc-800/80 bg-zinc-950/30 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <FilterToggle
            active={filters.inherited}
            label={t('codePane.fileStructureFilterInherited')}
            onClick={handleToggleInherited}
          />
          <FilterToggle
            active={filters.anonymous}
            label={t('codePane.fileStructureFilterAnonymous')}
            onClick={handleToggleAnonymous}
          />
          <FilterToggle
            active={filters.lambdas}
            label={t('codePane.fileStructureFilterLambdas')}
            onClick={handleToggleLambdas}
          />
        </div>
      </div>

      <div
        ref={listScrollRef}
        className={bodyClassName ?? `${idePopupBodyClassName} ${idePopupScrollAreaClassName} px-2 py-2`}
        onScroll={(event) => {
          scheduleListScrollTopUpdate(event.currentTarget.scrollTop);
        }}
      >
        {isLoading ? (
          <div className="flex items-center gap-2 px-2 py-4 text-xs text-zinc-400">
            <Loader2 size={12} className="animate-spin" />
            {t('codePane.fileStructureLoading')}
          </div>
        ) : error ? (
          <div className="px-2 py-4 text-xs text-red-300">{error}</div>
        ) : visibleRows.length > 0 ? (
          visibleRowSlice.isWindowed ? (
            <div style={{ height: `${visibleRowSlice.totalHeight}px`, position: 'relative' }}>
              <div className="space-y-0.5" style={{ transform: `translateY(${visibleRowSlice.offsetTop}px)` }}>
                {visibleRowSlice.items.map((row) => (
                  <OutlineNodeRow
                    key={row.node.id}
                    node={row.node}
                    depth={row.depth}
                    isExpanded={!collapsedNodeIds.has(row.node.id)}
                    isSelected={selectedNodeId === row.node.id}
                    onToggleExpanded={handleToggleNodeExpanded}
                    onOpenSymbol={onOpenSymbol}
                    onClose={onClose}
                    closeOnDoubleClick={closeOnDoubleClick}
                    onSelectNode={setSelectedNodeId}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-0.5">
              {visibleRows.map((row) => (
                <OutlineNodeRow
                  key={row.node.id}
                  node={row.node}
                  depth={row.depth}
                  isExpanded={!collapsedNodeIds.has(row.node.id)}
                  isSelected={selectedNodeId === row.node.id}
                  onToggleExpanded={handleToggleNodeExpanded}
                  onOpenSymbol={onOpenSymbol}
                  onClose={onClose}
                  closeOnDoubleClick={closeOnDoubleClick}
                  onSelectNode={setSelectedNodeId}
                />
              ))}
            </div>
          )
        ) : (
          <div className="mx-2 rounded-lg border border-dashed border-zinc-700/80 bg-zinc-950/35 px-3 py-4 text-xs text-zinc-500">
            {t('codePane.fileStructureEmpty')}
          </div>
        )}
      </div>
    </IdePopupShell>
  );
});

const FilterToggle = React.memo(function FilterToggle({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[11px] transition-colors ${
        active
          ? 'border-sky-500/70 bg-transparent text-sky-200'
          : 'border-zinc-700/80 bg-transparent text-zinc-300 hover:border-zinc-500 hover:text-zinc-100'
      }`}
    >
      <span
        className={`flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border ${
          active
            ? 'border-sky-500/80 text-sky-300'
            : 'border-zinc-600 text-transparent'
        }`}
        aria-hidden="true"
      >
        <Check size={9} strokeWidth={2.6} />
      </span>
      <span>{label}</span>
    </button>
  );
});

interface OutlineNodeRowProps {
  node: OutlineTreeNode;
  depth: number;
  isExpanded: boolean;
  isSelected: boolean;
  onToggleExpanded: (nodeId: string) => void;
  onOpenSymbol: (range: CodePaneRange) => void | Promise<void>;
  onClose: () => void;
  closeOnDoubleClick: boolean;
  onSelectNode: (nodeId: string) => void;
}

const OutlineNodeRow = React.memo(function OutlineNodeRow({
  node,
  depth,
  isExpanded,
  isSelected,
  onToggleExpanded,
  onOpenSymbol,
  onClose,
  closeOnDoubleClick,
  onSelectNode,
}: OutlineNodeRowProps) {
  const hasChildren = node.children.length > 0;
  const kind = getSymbolKindPresentation(node.symbol.kind);

  return (
    <div
      className="flex items-center gap-1"
      style={{ paddingLeft: `${depth * 12}px` }}
    >
      {hasChildren ? (
        <button
          type="button"
          onClick={() => {
            onToggleExpanded(node.id);
          }}
          className="flex h-6 w-5 shrink-0 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-zinc-800/70 hover:text-zinc-200"
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
        >
          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
      ) : (
        <div className="h-6 w-5 shrink-0" />
      )}
      <button
        type="button"
        onClick={() => {
          onSelectNode(node.id);
          void onOpenSymbol(node.symbol.selectionRange);
        }}
        onDoubleClick={() => {
          onSelectNode(node.id);
          if (!closeOnDoubleClick) {
            return;
          }
          void onOpenSymbol(node.symbol.selectionRange);
          onClose();
        }}
        className={idePopupRowClassName(isSelected)}
      >
        <OutlineKindBadge kind={kind.shortLabel} tone={kind.tone} />
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] leading-5 text-inherit">{node.symbol.name}</div>
            {node.symbol.detail ? (
              <div className="truncate text-[10px] leading-4 text-zinc-500">{node.symbol.detail}</div>
            ) : null}
          </div>
          <span className="shrink-0 rounded-md border border-zinc-700/80 bg-zinc-950/45 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-zinc-500">
            {kind.label}
          </span>
        </div>
      </button>
    </div>
  );
});

function flattenOutlineTree(nodes: OutlineTreeNode[], collapsedNodeIds: Set<string>): OutlineVisibleRow[] {
  const rows: OutlineVisibleRow[] = [];

  const walk = (currentNodes: OutlineTreeNode[], depth: number) => {
    currentNodes.forEach((node) => {
      rows.push({
        node,
        depth,
      });

      if (node.children.length > 0 && !collapsedNodeIds.has(node.id)) {
        walk(node.children, depth + 1);
      }
    });
  };

  walk(nodes, 0);
  return rows;
}

function OutlineKindBadge({
  kind,
  tone,
}: {
  kind: string;
  tone: 'red' | 'amber' | 'sky' | 'emerald' | 'violet' | 'zinc';
}) {
  const toneClassName = {
    red: idePopupBadgeClassName('red'),
    amber: idePopupBadgeClassName('amber'),
    sky: idePopupBadgeClassName('sky'),
    emerald: idePopupBadgeClassName('emerald'),
    violet: idePopupBadgeClassName('violet'),
    zinc: idePopupBadgeClassName('zinc'),
  }[tone];

  return (
    <span
      className={`inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full border px-1 text-[9px] font-semibold uppercase leading-none ${toneClassName}`}
      aria-hidden="true"
    >
      {kind}
    </span>
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

function filterOutlineTree(tree: OutlineTreeNode[], filters: OutlineFilterState): OutlineTreeNode[] {
  const nextTree: OutlineTreeNode[] = [];

  tree.forEach((node) => {
    const filteredChildren = filterOutlineTree(node.children, filters);
    const isVisible = matchesOutlineFilters(node.symbol, filters);

    if (!isVisible && filteredChildren.length === 0) {
      return;
    }

    nextTree.push({
      ...node,
      children: filteredChildren,
    });
  });

  return nextTree;
}

function matchesOutlineFilters(symbol: CodePaneDocumentSymbol, filters: OutlineFilterState): boolean {
  if (!filters.inherited && !filters.anonymous && !filters.lambdas) {
    return true;
  }

  return (
    (filters.inherited && isInheritedSymbol(symbol))
    || (filters.anonymous && isAnonymousClassSymbol(symbol))
    || (filters.lambdas && isLambdaSymbol(symbol))
  );
}

function isInheritedSymbol(symbol: CodePaneDocumentSymbol): boolean {
  const detail = (symbol.detail ?? '').toLowerCase();
  return detail.includes('inherited') || detail.includes('override') || detail.includes('super.');
}

function isAnonymousClassSymbol(symbol: CodePaneDocumentSymbol): boolean {
  const name = symbol.name.toLowerCase();
  const detail = (symbol.detail ?? '').toLowerCase();
  return name.includes('anonymous') || name.includes('<anonymous>') || detail.includes('anonymous');
}

function isLambdaSymbol(symbol: CodePaneDocumentSymbol): boolean {
  const name = symbol.name.toLowerCase();
  const detail = (symbol.detail ?? '').toLowerCase();

  if (symbol.kind === 12) {
    return name.includes('lambda') || name.includes('=>') || detail.includes('lambda');
  }

  return name.includes('<lambda>') || detail.includes('=>');
}

function getSymbolKindPresentation(kind: number): {
  label: string;
  shortLabel: string;
  tone: 'red' | 'amber' | 'sky' | 'emerald' | 'violet' | 'zinc';
} {
  switch (kind) {
    case 5:
      return { label: 'class', shortLabel: 'c', tone: 'sky' };
    case 6:
      return { label: 'method', shortLabel: 'm', tone: 'red' };
    case 7:
      return { label: 'property', shortLabel: 'p', tone: 'emerald' };
    case 8:
      return { label: 'field', shortLabel: 'f', tone: 'amber' };
    case 9:
      return { label: 'constructor', shortLabel: 'c', tone: 'violet' };
    case 10:
      return { label: 'enum', shortLabel: 'e', tone: 'amber' };
    case 11:
      return { label: 'interface', shortLabel: 'i', tone: 'emerald' };
    case 12:
      return { label: 'function', shortLabel: 'f', tone: 'red' };
    case 13:
      return { label: 'variable', shortLabel: 'v', tone: 'amber' };
    case 23:
      return { label: 'struct', shortLabel: 's', tone: 'violet' };
    case 24:
      return { label: 'event', shortLabel: 'e', tone: 'sky' };
    default:
      return { label: 'symbol', shortLabel: 's', tone: 'zinc' };
  }
}
