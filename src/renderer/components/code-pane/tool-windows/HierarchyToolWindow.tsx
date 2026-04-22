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
  idePopupCardClassName,
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

export const HierarchyToolWindow = React.memo(function HierarchyToolWindow({
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
          <div className="flex items-center gap-2 px-2 py-4 text-xs text-[rgb(var(--muted-foreground))]">
            <Loader2 size={12} className="animate-spin" />
            {t('codePane.hierarchyLoading')}
          </div>
        ) : error ? (
          <div className="px-2 py-4 text-xs text-[rgb(var(--error))]">{error}</div>
        ) : root ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => {
                onOpenItem(root.item);
              }}
              className={`w-full text-left transition-colors hover:border-[rgb(var(--ring))] hover:bg-[rgb(var(--accent))] ${idePopupCardClassName}`}
            >
              <div className="text-sm font-semibold text-[rgb(var(--foreground))]">{root.item.name}</div>
              {root.item.detail ? (
                <div className="mt-1 truncate text-[11px] text-[rgb(var(--muted-foreground))]">{root.item.detail}</div>
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
                <div className="mx-2 rounded-lg border border-dashed border-[rgb(var(--border))] bg-[var(--appearance-pane-chrome-background)] px-3 py-4 text-xs text-[rgb(var(--muted-foreground))]">
                  {t('codePane.hierarchyEmpty')}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="mx-2 rounded-lg border border-dashed border-[rgb(var(--border))] bg-[var(--appearance-pane-chrome-background)] px-3 py-4 text-xs text-[rgb(var(--muted-foreground))]">
            {t('codePane.hierarchyEmpty')}
          </div>
        )}
      </div>
    </IdePopupShell>
  );
});

interface HierarchyNodeRowProps {
  node: HierarchyTreeNode;
  depth: number;
  onToggleNode: (nodeKey: string) => void;
  onOpenItem: (item: CodePaneHierarchyItem) => void;
  onClose: () => void;
  closeOnDoubleClick: boolean;
}

const HierarchyNodeRow = React.memo(function HierarchyNodeRow({
  node,
  depth,
  onToggleNode,
  onOpenItem,
  onClose,
  closeOnDoubleClick,
}: HierarchyNodeRowProps) {
  return (
    <div>
      <div
        className="flex items-center gap-1"
        style={{ paddingLeft: `${depth * 12}px` }}
      >
        {node.isExpandable || node.children.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              onToggleNode(node.key);
            }}
            className="flex h-6 w-5 shrink-0 items-center justify-center rounded text-[rgb(var(--muted-foreground))] transition-colors hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--foreground))]"
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
          <span className={`inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full border px-1 text-[9px] font-semibold uppercase leading-none ${idePopupBadgeClassName('sky')}`}>
            h
          </span>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] leading-5 text-[rgb(var(--foreground))]">{node.item.name}</div>
              {node.item.detail ? (
                <div className="truncate text-[10px] leading-4 text-[rgb(var(--muted-foreground))]">{node.item.detail}</div>
              ) : null}
            </div>
            {node.item.relationRanges?.length ? (
              <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] ${idePopupBadgeClassName('sky')}`}>
                {node.item.relationRanges.length}
              </span>
            ) : (
              <span className="shrink-0 rounded-md border border-[rgb(var(--border))] bg-[var(--appearance-pane-chrome-background)] px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-[rgb(var(--muted-foreground))]">
                hierarchy
              </span>
            )}
          </div>
        </button>
      </div>

      {node.error ? (
        <div
          className="px-2 pb-1 text-[10px] text-[rgb(var(--error))]"
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
});

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
