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
import {
  IdePopupShell,
  idePopupBodyClassName,
  idePopupHeaderClassName,
  idePopupHeaderMetaClassName,
  idePopupIconButtonClassName,
  idePopupRowClassName,
  idePopupScrollAreaClassName,
  idePopupSectionClassName,
  idePopupSubtitleClassName,
  idePopupTitleClassName,
  idePopupToggleButtonClassName,
  idePopupToggleIndicatorClassName,
} from '../../ui/ide-popup';

interface OutlineTreeNode {
  id: string;
  symbol: CodePaneDocumentSymbol;
  children: OutlineTreeNode[];
}

interface OutlineFilterState {
  inherited: boolean;
  anonymous: boolean;
  lambdas: boolean;
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

const DEFAULT_FILTERS: OutlineFilterState = {
  inherited: true,
  anonymous: true,
  lambdas: true,
};

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
  const [filters, setFilters] = React.useState(DEFAULT_FILTERS);
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);
  const filteredTree = React.useMemo(() => filterOutlineTree(tree, filters), [filters, tree]);
  const visibleNodeIds = React.useMemo(() => collectVisibleNodeIds(filteredTree), [filteredTree]);

  React.useEffect(() => {
    if (visibleNodeIds.length === 0) {
      setSelectedNodeId(null);
      return;
    }

    setSelectedNodeId((currentValue) => (
      currentValue && visibleNodeIds.includes(currentValue) ? currentValue : visibleNodeIds[0]
    ));
  }, [visibleNodeIds]);

  return (
    <IdePopupShell className={panelClassName ?? 'flex h-full min-h-0 flex-col'}>
      <div className={idePopupHeaderClassName}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <FileCode2 size={12} className="shrink-0 text-sky-300" />
            <div className={idePopupHeaderMetaClassName}>{t('codePane.fileStructureTab')}</div>
          </div>
          <div className="mt-1 min-w-0">
            <div className={idePopupTitleClassName}>{fileLabel ?? t('codePane.fileStructureEmpty')}</div>
            <div className={idePopupSubtitleClassName}>
              {visibleNodeIds.length > 0
                ? t('codePane.fileStructureCount', { count: visibleNodeIds.length })
                : t('codePane.fileStructureHint')}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              void onRefresh();
            }}
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

      <div className={`${idePopupSectionClassName} px-3 py-2`}>
        <div className="flex flex-wrap items-center gap-2">
          <FilterToggle
            active={filters.inherited}
            label={t('codePane.fileStructureFilterInherited')}
            onClick={() => {
              setFilters((currentValue) => ({
                ...currentValue,
                inherited: !currentValue.inherited,
              }));
            }}
          />
          <FilterToggle
            active={filters.anonymous}
            label={t('codePane.fileStructureFilterAnonymous')}
            onClick={() => {
              setFilters((currentValue) => ({
                ...currentValue,
                anonymous: !currentValue.anonymous,
              }));
            }}
          />
          <FilterToggle
            active={filters.lambdas}
            label={t('codePane.fileStructureFilterLambdas')}
            onClick={() => {
              setFilters((currentValue) => ({
                ...currentValue,
                lambdas: !currentValue.lambdas,
              }));
            }}
          />
        </div>
      </div>

      <div className={bodyClassName ?? `${idePopupBodyClassName} ${idePopupScrollAreaClassName} px-2 py-2`}>
        {isLoading ? (
          <div className="flex items-center gap-2 px-2 py-4 text-xs text-zinc-400">
            <Loader2 size={12} className="animate-spin" />
            {t('codePane.fileStructureLoading')}
          </div>
        ) : error ? (
          <div className="px-2 py-4 text-xs text-red-300">{error}</div>
        ) : filteredTree.length > 0 ? (
          <div className="space-y-0.5">
            {filteredTree.map((node) => (
              <OutlineNodeRow
                key={node.id}
                node={node}
                depth={0}
                onOpenSymbol={onOpenSymbol}
                onClose={onClose}
                closeOnDoubleClick={closeOnDoubleClick}
                selectedNodeId={selectedNodeId}
                onSelectNode={setSelectedNodeId}
              />
            ))}
          </div>
        ) : (
          <div className="mx-2 rounded-md border border-dashed border-zinc-700 bg-zinc-950/40 px-3 py-4 text-xs text-zinc-500">
            {t('codePane.fileStructureEmpty')}
          </div>
        )}
      </div>
    </IdePopupShell>
  );
}

function FilterToggle({
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
      className={idePopupToggleButtonClassName(active)}
      aria-label={label}
    >
      <span className={idePopupToggleIndicatorClassName(active)}>{active ? '•' : ' '}</span>
      <span>{label}</span>
    </button>
  );
}

function OutlineNodeRow({
  node,
  depth,
  onOpenSymbol,
  onClose,
  closeOnDoubleClick,
  selectedNodeId,
  onSelectNode,
}: {
  node: OutlineTreeNode;
  depth: number;
  onOpenSymbol: (range: CodePaneRange) => void | Promise<void>;
  onClose: () => void;
  closeOnDoubleClick: boolean;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}) {
  const [isExpanded, setIsExpanded] = React.useState(true);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedNodeId === node.id;
  const kind = getSymbolKindPresentation(node.symbol.kind);

  return (
    <div>
      <div
        className="flex items-center gap-1"
        style={{ paddingLeft: `${depth * 14}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => {
              setIsExpanded((currentValue) => !currentValue);
            }}
            className="flex h-6 w-5 shrink-0 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-zinc-800/80 hover:text-zinc-200"
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
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-[12px] leading-5 text-inherit">{node.symbol.name}</span>
              {node.symbol.detail ? (
                <span className="truncate text-[11px] text-zinc-400/90">{node.symbol.detail}</span>
              ) : (
                <span className="rounded border border-zinc-700/80 bg-zinc-950/55 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-zinc-500">
                  {kind.label}
                </span>
              )}
            </div>
          </div>
        </button>
      </div>
      {hasChildren && isExpanded && (
        <div className="space-y-0.5">
          {node.children.map((child) => (
            <OutlineNodeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              onOpenSymbol={onOpenSymbol}
              onClose={onClose}
              closeOnDoubleClick={closeOnDoubleClick}
              selectedNodeId={selectedNodeId}
              onSelectNode={onSelectNode}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function OutlineKindBadge({
  kind,
  tone,
}: {
  kind: string;
  tone: 'red' | 'amber' | 'sky' | 'emerald' | 'violet' | 'zinc';
}) {
  const toneClassName = {
    red: 'border-red-400/60 bg-red-500/10 text-red-300',
    amber: 'border-amber-400/60 bg-amber-500/10 text-amber-300',
    sky: 'border-sky-400/60 bg-sky-500/10 text-sky-300',
    emerald: 'border-emerald-400/60 bg-emerald-500/10 text-emerald-300',
    violet: 'border-violet-400/60 bg-violet-500/10 text-violet-300',
    zinc: 'border-zinc-500/70 bg-zinc-500/10 text-zinc-300',
  }[tone];

  return (
    <span
      className={`inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border text-[9px] font-semibold uppercase leading-none ${toneClassName}`}
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

function collectVisibleNodeIds(nodes: OutlineTreeNode[]): string[] {
  const ids: string[] = [];

  nodes.forEach((node) => {
    ids.push(node.id);
    ids.push(...collectVisibleNodeIds(node.children));
  });

  return ids;
}

function matchesOutlineFilters(symbol: CodePaneDocumentSymbol, filters: OutlineFilterState): boolean {
  if (!filters.inherited && isInheritedSymbol(symbol)) {
    return false;
  }

  if (!filters.anonymous && isAnonymousClassSymbol(symbol)) {
    return false;
  }

  if (!filters.lambdas && isLambdaSymbol(symbol)) {
    return false;
  }

  return true;
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
