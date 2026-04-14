import React from 'react';
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
import type { CodePaneHierarchyItem } from '../../../../shared/types/electron-api';
import { useI18n } from '../../../i18n';

export type HierarchyMode = 'call-incoming' | 'call-outgoing' | 'type-parents' | 'type-children';

export interface HierarchyTreeNode {
  key: string;
  item: CodePaneHierarchyItem;
  children: HierarchyTreeNode[];
  isExpanded: boolean;
  isLoading: boolean;
  isExpandable: boolean;
  error: string | null;
}

interface HierarchyToolWindowProps {
  mode: HierarchyMode;
  root: HierarchyTreeNode | null;
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
  onRefresh: () => void;
  onSelectMode: (mode: HierarchyMode) => void;
  onToggleNode: (nodeKey: string) => void;
  onOpenItem: (item: CodePaneHierarchyItem) => void;
}

export function HierarchyToolWindow({
  mode,
  root,
  isLoading,
  error,
  onClose,
  onRefresh,
  onSelectMode,
  onToggleNode,
  onOpenItem,
}: HierarchyToolWindowProps) {
  const { t } = useI18n();

  return (
    <div className="flex h-72 shrink-0 flex-col border-t border-zinc-800 bg-zinc-950/90">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-400">
            {t('codePane.hierarchyTab')}
          </div>
          <div className="text-xs text-zinc-500">
            {root?.item.name ?? t('codePane.hierarchyEmpty')}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
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

      <div className="flex gap-2 border-b border-zinc-800 px-3 py-2">
        {HIERARCHY_MODE_ORDER.map((entryMode) => {
          const isActive = entryMode === mode;
          return (
            <button
              key={entryMode}
              type="button"
              onClick={() => {
                onSelectMode(entryMode);
              }}
              className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                isActive
                  ? 'bg-sky-500/20 text-sky-100'
                  : 'bg-zinc-900/80 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
              }`}
            >
              {getModeLabel(entryMode, t)}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Loader2 size={12} className="animate-spin" />
            {t('codePane.hierarchyLoading')}
          </div>
        ) : error ? (
          <div className="text-xs text-red-300">{error}</div>
        ) : root ? (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => {
                onOpenItem(root.item);
              }}
              className="w-full rounded border border-zinc-800 bg-zinc-900/60 px-3 py-3 text-left transition-colors hover:border-zinc-700 hover:bg-zinc-900"
            >
              <div className="text-sm font-medium text-zinc-100">{root.item.name}</div>
              {root.item.detail && (
                <div className="mt-1 text-[11px] text-zinc-500">{root.item.detail}</div>
              )}
            </button>

            <div className="space-y-1">
              {root.children.length > 0 ? (
                root.children.map((node) => (
                  <HierarchyNodeRow
                    key={node.key}
                    node={node}
                    depth={0}
                    onToggleNode={onToggleNode}
                    onOpenItem={onOpenItem}
                  />
                ))
              ) : (
                <div className="rounded border border-dashed border-zinc-800 bg-zinc-950/60 px-3 py-4 text-xs text-zinc-500">
                  {t('codePane.hierarchyEmpty')}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded border border-dashed border-zinc-800 bg-zinc-950/60 px-3 py-4 text-xs text-zinc-500">
            {t('codePane.hierarchyEmpty')}
          </div>
        )}
      </div>
    </div>
  );
}

interface HierarchyNodeRowProps {
  node: HierarchyTreeNode;
  depth: number;
  onToggleNode: (nodeKey: string) => void;
  onOpenItem: (item: CodePaneHierarchyItem) => void;
}

function HierarchyNodeRow({ node, depth, onToggleNode, onOpenItem }: HierarchyNodeRowProps) {
  return (
    <div>
      <div
        className="flex items-center gap-2 rounded px-1.5 py-1 transition-colors hover:bg-zinc-900/70"
        style={{ paddingLeft: `${depth * 18 + 6}px` }}
      >
        {node.isExpandable || node.children.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              onToggleNode(node.key);
            }}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
            aria-label={node.isExpanded ? 'Collapse' : 'Expand'}
          >
            {node.isLoading ? (
              <Loader2 size={11} className="animate-spin" />
            ) : node.isExpanded ? (
              <ChevronDown size={12} />
            ) : (
              <ChevronRight size={12} />
            )}
          </button>
        ) : (
          <div className="h-5 w-5 shrink-0" />
        )}

        <button
          type="button"
          onClick={() => {
            onOpenItem(node.item);
          }}
          className="min-w-0 flex-1 text-left"
        >
          <div className="truncate text-xs font-medium text-zinc-100">{node.item.name}</div>
          <div className="mt-0.5 flex items-center gap-2 text-[10px] text-zinc-500">
            {node.item.detail && (
              <span className="truncate">{node.item.detail}</span>
            )}
            {node.item.relationRanges?.length ? (
              <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] text-zinc-300">
                {node.item.relationRanges.length}
              </span>
            ) : null}
          </div>
        </button>
      </div>

      {node.error && (
        <div
          className="px-2 pb-1 text-[10px] text-red-300"
          style={{ paddingLeft: `${depth * 18 + 34}px` }}
        >
          {node.error}
        </div>
      )}

      {node.isExpanded && node.children.length > 0 && (
        <div className="space-y-1">
          {node.children.map((child) => (
            <HierarchyNodeRow
              key={child.key}
              node={child}
              depth={depth + 1}
              onToggleNode={onToggleNode}
              onOpenItem={onOpenItem}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const HIERARCHY_MODE_ORDER: HierarchyMode[] = [
  'call-incoming',
  'call-outgoing',
  'type-parents',
  'type-children',
];

function getModeLabel(mode: HierarchyMode, t: ReturnType<typeof useI18n>['t']): string {
  switch (mode) {
    case 'call-incoming':
      return t('codePane.hierarchyIncoming');
    case 'call-outgoing':
      return t('codePane.hierarchyOutgoing');
    case 'type-parents':
      return t('codePane.hierarchyParents');
    case 'type-children':
    default:
      return t('codePane.hierarchyChildren');
  }
}
