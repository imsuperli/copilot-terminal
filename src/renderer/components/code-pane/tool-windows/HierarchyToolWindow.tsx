import React from 'react';
import {
  ChevronDown,
  ChevronRight,
  GitBranch,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
import type { CodePaneHierarchyItem } from '../../../../shared/types/electron-api';
import { useI18n } from '../../../i18n';
import {
  IdePopupShell,
  idePopupBadgeClassName,
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
} from '../../ui/ide-popup';

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
  panelClassName?: string;
  bodyClassName?: string;
  closeOnDoubleClick?: boolean;
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
  panelClassName,
  bodyClassName,
  closeOnDoubleClick = false,
}: HierarchyToolWindowProps) {
  const { t } = useI18n();

  return (
    <IdePopupShell className={panelClassName ?? 'flex h-full min-h-0 flex-col'}>
      <div className={idePopupHeaderClassName}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <GitBranch size={12} className="shrink-0 text-sky-300" />
            <div className={idePopupHeaderMetaClassName}>{t('codePane.hierarchyTab')}</div>
          </div>
          <div className="mt-1 min-w-0">
            <div className={idePopupTitleClassName}>{root?.item.name ?? t('codePane.hierarchyEmpty')}</div>
            <div className={idePopupSubtitleClassName}>{getModeLabel(mode, t)}</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onRefresh}
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
          {HIERARCHY_MODE_ORDER.map((entryMode) => (
            <button
              key={entryMode}
              type="button"
              onClick={() => {
                onSelectMode(entryMode);
              }}
              className={idePopupToggleButtonClassName(entryMode === mode)}
            >
              {getModeLabel(entryMode, t)}
            </button>
          ))}
        </div>
      </div>

      <div className={bodyClassName ?? `${idePopupBodyClassName} ${idePopupScrollAreaClassName} px-2 py-2`}>
        {isLoading ? (
          <div className="flex items-center gap-2 px-2 py-4 text-xs text-zinc-400">
            <Loader2 size={12} className="animate-spin" />
            {t('codePane.hierarchyLoading')}
          </div>
        ) : error ? (
          <div className="px-2 py-4 text-xs text-red-300">{error}</div>
        ) : root ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => {
                onOpenItem(root.item);
              }}
              className="w-full rounded-md border border-zinc-700/80 bg-zinc-900/45 px-3 py-2 text-left transition-colors hover:border-zinc-500 hover:bg-zinc-800/80"
            >
              <div className="text-sm font-semibold text-zinc-100">{root.item.name}</div>
              {root.item.detail ? (
                <div className="mt-1 truncate text-[11px] text-zinc-400">{root.item.detail}</div>
              ) : null}
            </button>

            <div className="space-y-0.5">
              {root.children.length > 0 ? (
                root.children.map((node) => (
                  <HierarchyNodeRow
                    key={node.key}
                    node={node}
                    depth={0}
                    onToggleNode={onToggleNode}
                    onOpenItem={onOpenItem}
                    onClose={onClose}
                    closeOnDoubleClick={closeOnDoubleClick}
                  />
                ))
              ) : (
                <div className="mx-2 rounded-md border border-dashed border-zinc-700 bg-zinc-950/40 px-3 py-4 text-xs text-zinc-500">
                  {t('codePane.hierarchyEmpty')}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="mx-2 rounded-md border border-dashed border-zinc-700 bg-zinc-950/40 px-3 py-4 text-xs text-zinc-500">
            {t('codePane.hierarchyEmpty')}
          </div>
        )}
      </div>
    </IdePopupShell>
  );
}

interface HierarchyNodeRowProps {
  node: HierarchyTreeNode;
  depth: number;
  onToggleNode: (nodeKey: string) => void;
  onOpenItem: (item: CodePaneHierarchyItem) => void;
  onClose: () => void;
  closeOnDoubleClick: boolean;
}

function HierarchyNodeRow({ node, depth, onToggleNode, onOpenItem, onClose, closeOnDoubleClick }: HierarchyNodeRowProps) {
  return (
    <div>
      <div
        className="flex items-center gap-1"
        style={{ paddingLeft: `${depth * 14}px` }}
      >
        {node.isExpandable || node.children.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              onToggleNode(node.key);
            }}
            className="flex h-6 w-5 shrink-0 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-zinc-800/80 hover:text-zinc-200"
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
          <div className="h-6 w-5 shrink-0" />
        )}

        <button
          type="button"
          onClick={() => {
            onOpenItem(node.item);
          }}
          onDoubleClick={() => {
            if (!closeOnDoubleClick) {
              return;
            }
            onOpenItem(node.item);
            onClose();
          }}
          className={idePopupRowClassName(false)}
        >
          <span className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-sky-400/60 bg-sky-500/10 text-[9px] font-semibold uppercase leading-none text-sky-300">
            h
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] leading-5 text-zinc-100">{node.item.name}</div>
            <div className="mt-0.5 flex items-center gap-2 text-[10px] text-zinc-500">
              {node.item.detail ? (
                <span className="truncate">{node.item.detail}</span>
              ) : null}
              {node.item.relationRanges?.length ? (
                <span className={`rounded border px-1.5 py-0.5 text-[9px] ${idePopupBadgeClassName('sky')}`}>
                  {node.item.relationRanges.length}
                </span>
              ) : null}
            </div>
          </div>
        </button>
      </div>

      {node.error ? (
        <div
          className="px-2 pb-1 text-[10px] text-red-300"
          style={{ paddingLeft: `${depth * 14 + 28}px` }}
        >
          {node.error}
        </div>
      ) : null}

      {node.isExpanded && node.children.length > 0 ? (
        <div className="space-y-0.5">
          {node.children.map((child) => (
            <HierarchyNodeRow
              key={child.key}
              node={child}
              depth={depth + 1}
              onToggleNode={onToggleNode}
              onOpenItem={onOpenItem}
              onClose={onClose}
              closeOnDoubleClick={closeOnDoubleClick}
            />
          ))}
        </div>
      ) : null}
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
