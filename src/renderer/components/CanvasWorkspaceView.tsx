import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Link2, MonitorSmartphone, Save, StickyNote } from 'lucide-react';
import { AppLanguage } from '../../shared/i18n';
import {
  CanvasActivityEvent,
  CanvasBlock,
  CanvasNoteBlock,
  CanvasWindowBlock,
  CanvasWorkspace,
} from '../../shared/types/canvas';
import type { SSHProfile } from '../../shared/types/ssh';
import { getWindowKind } from '../../shared/utils/terminalCapabilities';
import { formatRelativeTime, useI18n } from '../i18n';
import { useWindowStore } from '../stores/windowStore';
import { getAllPanes, getAggregatedStatus } from '../utils/layoutHelpers';
import { getStatusLabelKey } from '../utils/statusHelpers';
import {
  arrangeCanvasBlocks,
  type CanvasArrangeMode,
  type CanvasRect,
  type CanvasResizeDirection,
  clampZoom,
  DEFAULT_NOTE_BLOCK_SIZE,
  DEFAULT_WINDOW_BLOCK_SIZE,
  fitViewportToBlocks,
  getIntersectingCanvasBlockIds,
  getWorldPointFromClient,
  moveCanvasBlocks,
  normalizeCanvasRect,
  resizeCanvasBlock,
} from '../utils/canvasWorkspace';
import { createTemplateFromWorkspace, createDefaultCanvasTemplates, instantiateCanvasWorkspaceFromTemplate } from '../utils/canvasTemplates';
import { createCanvasWindowDraft } from '../utils/canvasWindowFactory';
import { getCurrentWindowWorkingDirectory } from '../utils/windowWorkingDirectory';
import { CanvasArrangeToolbar } from './CanvasArrangeToolbar';
import { CanvasBlockChrome } from './CanvasBlockChrome';
import { CanvasCreateBlockDialog } from './CanvasCreateBlockDialog';
import { CanvasMinimap } from './CanvasMinimap';
import { CanvasWindowPickerDialog } from './CanvasWindowPickerDialog';
import { Dialog } from './ui/Dialog';
import {
  idePopupActionButtonClassName,
  idePopupCardClassName,
  idePopupInputClassName,
  idePopupSecondaryButtonClassName,
} from './ui/ide-popup';

interface CanvasWorkspaceViewProps {
  canvasWorkspace: CanvasWorkspace;
  sshProfiles?: SSHProfile[];
  onOpenWindow?: (windowId: string) => void;
  renderLiveWindow?: (windowId: string, options: { isActive: boolean }) => React.ReactNode;
  onExitWorkspace?: () => void | Promise<void>;
}

type DragState =
  | {
      type: 'pan';
      startClientX: number;
      startClientY: number;
      initialViewport: CanvasWorkspace['viewport'];
    }
  | {
      type: 'move';
      startClientX: number;
      startClientY: number;
      blockIds: string[];
      initialPositions: Record<string, { x: number; y: number }>;
    }
  | {
      type: 'resize';
      startClientX: number;
      startClientY: number;
      blockId: string;
      direction: CanvasResizeDirection;
      initialBlock: CanvasBlock;
    }
  | {
      type: 'select';
      startWorldX: number;
      startWorldY: number;
      currentWorldX: number;
      currentWorldY: number;
      baseSelection: string[];
      additive: boolean;
    }
  | null;

function createCanvasBlockId(prefix: 'note' | 'window'): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function countLinkedWindowBlocks(blocks: CanvasBlock[], windowId: string): number {
  return blocks.filter((block) => block.type === 'window' && block.windowId === windowId).length;
}

export const CanvasWorkspaceView: React.FC<CanvasWorkspaceViewProps> = ({
  canvasWorkspace,
  sshProfiles = [],
  onOpenWindow,
  renderLiveWindow,
  onExitWorkspace,
}) => {
  const { t, language } = useI18n();
  const windows = useWindowStore((state) => state.windows);
  const updateCanvasWorkspace = useWindowStore((state) => state.updateCanvasWorkspace);
  const removeCanvasWorkspace = useWindowStore((state) => state.removeCanvasWorkspace);
  const addWindow = useWindowStore((state) => state.addWindow);
  const canvasWorkspaceTemplates = useWindowStore((state) => state.canvasWorkspaceTemplates);
  const setCanvasWorkspaceTemplates = useWindowStore((state) => state.setCanvasWorkspaceTemplates);
  const upsertCanvasWorkspaceTemplate = useWindowStore((state) => state.upsertCanvasWorkspaceTemplate);
  const removeCanvasWorkspaceTemplate = useWindowStore((state) => state.removeCanvasWorkspaceTemplate);
  const canvasActivity = useWindowStore((state) => state.canvasActivity);
  const appendCanvasActivity = useWindowStore((state) => state.appendCanvasActivity);
  const clearCanvasActivity = useWindowStore((state) => state.clearCanvasActivity);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<DragState>(null);
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([]);
  const [lastArrangeMode, setLastArrangeMode] = useState<CanvasArrangeMode | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [relinkingBlockId, setRelinkingBlockId] = useState<string | null>(null);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [draftBlockTitle, setDraftBlockTitle] = useState('');
  const [workspaceRenameOpen, setWorkspaceRenameOpen] = useState(false);
  const [workspaceDeleteOpen, setWorkspaceDeleteOpen] = useState(false);
  const [workspaceNameDraft, setWorkspaceNameDraft] = useState(canvasWorkspace.name);
  const [canvasSize, setCanvasSize] = useState({
    w: typeof window === 'undefined' ? 1280 : window.innerWidth,
    h: typeof window === 'undefined' ? 720 : window.innerHeight,
  });

  const windowsById = useMemo(
    () => new Map(windows.map((windowItem) => [windowItem.id, windowItem] as const)),
    [windows],
  );
  const workspaceActivity = useMemo(
    () => canvasActivity
      .filter((item) => item.workspaceId === canvasWorkspace.id)
      .slice()
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp)),
    [canvasActivity, canvasWorkspace.id],
  );
  const resolvedTemplates = useMemo(
    () => canvasWorkspaceTemplates.length > 0 ? canvasWorkspaceTemplates : createDefaultCanvasTemplates(),
    [canvasWorkspaceTemplates],
  );

  const availableWindows = useMemo(() => {
    const linkedWindowIds = new Set(
      canvasWorkspace.blocks
        .filter((block): block is CanvasWindowBlock => block.type === 'window')
        .map((block) => block.windowId),
    );

    return windows.filter((windowItem) => !windowItem.archived && !linkedWindowIds.has(windowItem.id));
  }, [canvasWorkspace.blocks, windows]);

  const relinkAvailableWindows = useMemo(() => {
    const relinkingBlock = relinkingBlockId
      ? canvasWorkspace.blocks.find((block): block is CanvasWindowBlock => block.id === relinkingBlockId && block.type === 'window') ?? null
      : null;

    const linkedWindowIds = new Set(
      canvasWorkspace.blocks
        .filter((block): block is CanvasWindowBlock => block.type === 'window')
        .filter((block) => block.id !== relinkingBlock?.id)
        .map((block) => block.windowId),
    );

    return windows.filter((windowItem) => !windowItem.archived && !linkedWindowIds.has(windowItem.id));
  }, [canvasWorkspace.blocks, relinkingBlockId, windows]);

  useEffect(() => {
    const existingIds = new Set(canvasWorkspace.blocks.map((block) => block.id));
    setSelectedBlockIds((previous) => previous.filter((blockId) => existingIds.has(blockId)));
  }, [canvasWorkspace.blocks]);

  useEffect(() => {
    if (canvasWorkspaceTemplates.length === 0) {
      setCanvasWorkspaceTemplates(createDefaultCanvasTemplates());
    }
  }, [canvasWorkspaceTemplates.length, setCanvasWorkspaceTemplates]);

  useEffect(() => {
    setWorkspaceNameDraft(canvasWorkspace.name);
  }, [canvasWorkspace.name]);

  useEffect(() => {
    if (editingBlockId && !canvasWorkspace.blocks.some((block) => block.id === editingBlockId)) {
      setEditingBlockId(null);
      setDraftBlockTitle('');
    }

    if (relinkingBlockId && !canvasWorkspace.blocks.some((block) => block.id === relinkingBlockId)) {
      setRelinkingBlockId(null);
    }
  }, [canvasWorkspace.blocks, editingBlockId, relinkingBlockId]);

  useEffect(() => {
    const node = canvasRef.current;
    if (!node) {
      return;
    }

    const syncSize = () => {
      const rect = node.getBoundingClientRect();
      setCanvasSize({ w: rect.width, h: rect.height });
    };

    syncSize();
    const observer = new ResizeObserver(syncSize);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const persistWorkspace = useCallback((
    compute: (current: CanvasWorkspace) => Partial<CanvasWorkspace> | null,
  ): CanvasWorkspace | null => {
    const current = useWindowStore.getState().getCanvasWorkspaceById(canvasWorkspace.id);
    if (!current) {
      return null;
    }

    const updates = compute(current);
    if (!updates) {
      return null;
    }

    updateCanvasWorkspace(canvasWorkspace.id, updates);
    return { ...current, ...updates };
  }, [canvasWorkspace.id, updateCanvasWorkspace]);

  const createCanvasEvent = useCallback((
    type: CanvasActivityEvent['type'],
    title: string,
    message?: string,
    extras?: Partial<Omit<CanvasActivityEvent, 'id' | 'workspaceId' | 'timestamp' | 'type' | 'title' | 'message'>>,
  ) => {
    appendCanvasActivity({
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `canvas-activity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      workspaceId: canvasWorkspace.id,
      timestamp: new Date().toISOString(),
      type,
      title,
      message,
      ...extras,
    });
  }, [appendCanvasActivity, canvasWorkspace.id]);

  const updateViewport = useCallback((tx: number, ty: number, zoom: number) => {
    persistWorkspace(() => ({
      viewport: {
        tx,
        ty,
        zoom: clampZoom(zoom),
      },
    }));
  }, [persistWorkspace]);

  const clearSelection = useCallback(() => {
    setSelectedBlockIds([]);
  }, []);

  const bringBlocksToFront = useCallback((blockIds: string[]): CanvasBlock[] => {
    if (blockIds.length === 0) {
      return [];
    }

    let nextBlocks: CanvasBlock[] = [];
    persistWorkspace((current) => {
      const ids = new Set(blockIds);
      let nextZIndex = current.nextZIndex;
      nextBlocks = current.blocks.map((block) => {
        if (!ids.has(block.id)) {
          return block;
        }

        const elevated = {
          ...block,
          zIndex: nextZIndex,
        };
        nextZIndex += 1;
        return elevated;
      });

      return {
        blocks: nextBlocks,
        nextZIndex,
      };
    });

    return nextBlocks;
  }, [persistWorkspace]);

  const createNoteAtWorld = useCallback((x: number, y: number) => {
    let createdBlockId: string | null = null;

    persistWorkspace((current) => {
      const nextBlock: CanvasNoteBlock = {
        id: createCanvasBlockId('note'),
        type: 'note',
        x,
        y,
        width: DEFAULT_NOTE_BLOCK_SIZE.width,
        height: DEFAULT_NOTE_BLOCK_SIZE.height,
        zIndex: current.nextZIndex,
        label: t('canvas.defaultNoteTitle'),
        content: '',
      };
      createdBlockId = nextBlock.id;

      return {
        blocks: [...current.blocks, nextBlock],
        nextZIndex: current.nextZIndex + 1,
      };
    });

    if (createdBlockId) {
      setSelectedBlockIds([createdBlockId]);
      createCanvasEvent('note-added', t('canvas.addNote'), undefined, {
        blockId: createdBlockId,
      });
    }
  }, [createCanvasEvent, persistWorkspace, t]);

  const createNoteAtClient = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    const point = getWorldPointFromClient(clientX, clientY, rect, canvasWorkspace.viewport);
    createNoteAtWorld(point.x, point.y);
  }, [canvasWorkspace.viewport, createNoteAtWorld]);

  const addWindowBlock = useCallback((windowId: string) => {
    const linkedWindow = windowsById.get(windowId);
    if (!linkedWindow) {
      return;
    }

    let createdBlockId: string | null = null;

    persistWorkspace((current) => {
      const offsetIndex = current.blocks.filter((block) => block.type === 'window').length;
      const nextBlock: CanvasWindowBlock = {
        id: createCanvasBlockId('window'),
        type: 'window',
        windowId,
        x: 80 + offsetIndex * 28,
        y: 80 + offsetIndex * 24,
        width: DEFAULT_WINDOW_BLOCK_SIZE.width,
        height: DEFAULT_WINDOW_BLOCK_SIZE.height,
        zIndex: current.nextZIndex,
        label: linkedWindow.name,
      };
      createdBlockId = nextBlock.id;

      return {
        blocks: [...current.blocks, nextBlock],
        nextZIndex: current.nextZIndex + 1,
      };
    });

    if (createdBlockId) {
      setSelectedBlockIds([createdBlockId]);
      createCanvasEvent('window-added', linkedWindow.name, undefined, {
        windowId,
        blockId: createdBlockId,
      });
    }
  }, [createCanvasEvent, persistWorkspace, windowsById]);

  const addWindowBlockFromWindow = useCallback((windowItem: typeof windows[number]) => {
    let createdBlockId: string | null = null;

    persistWorkspace((current) => {
      const offsetIndex = current.blocks.filter((block) => block.type === 'window').length;
      const nextBlock: CanvasWindowBlock = {
        id: createCanvasBlockId('window'),
        type: 'window',
        windowId: windowItem.id,
        x: 80 + offsetIndex * 28,
        y: 80 + offsetIndex * 24,
        width: DEFAULT_WINDOW_BLOCK_SIZE.width,
        height: DEFAULT_WINDOW_BLOCK_SIZE.height,
        zIndex: current.nextZIndex,
        label: windowItem.name,
      };
      createdBlockId = nextBlock.id;

      return {
        blocks: [...current.blocks, nextBlock],
        nextZIndex: current.nextZIndex + 1,
      };
    });

    if (createdBlockId) {
      setSelectedBlockIds([createdBlockId]);
      createCanvasEvent('window-added', windowItem.name, undefined, {
        windowId: windowItem.id,
        blockId: createdBlockId,
      });
    }
  }, [createCanvasEvent, persistWorkspace, windows]);

  const updateSingleBlock = useCallback((
    blockId: string,
    updates: Partial<Pick<CanvasBlock, 'x' | 'y' | 'width' | 'height' | 'label'>> & { content?: string },
  ) => {
    persistWorkspace((current) => ({
      blocks: current.blocks.map((block) => {
        if (block.id !== blockId) {
          return block;
        }

        if (block.type === 'window') {
          const nextBlock: CanvasWindowBlock = {
            ...block,
            x: updates.x ?? block.x,
            y: updates.y ?? block.y,
            width: updates.width ?? block.width,
            height: updates.height ?? block.height,
            label: updates.label ?? block.label,
            windowId: block.windowId,
          };
          return nextBlock;
        }

        const nextBlock: CanvasNoteBlock = {
          ...block,
          x: updates.x ?? block.x,
          y: updates.y ?? block.y,
          width: updates.width ?? block.width,
          height: updates.height ?? block.height,
          label: updates.label ?? block.label,
          content: typeof updates.content === 'string' ? updates.content : block.content,
        };
        return nextBlock;
      }),
    }));
  }, [persistWorkspace]);

  const startEditingBlockTitle = useCallback((block: CanvasBlock, fallbackTitle: string) => {
    setEditingBlockId(block.id);
    setDraftBlockTitle(block.label ?? fallbackTitle);
  }, []);

  const commitBlockTitle = useCallback((block: CanvasBlock, fallbackTitle: string) => {
    const nextLabel = draftBlockTitle.trim();
    const normalizedFallback = fallbackTitle.trim();

    updateSingleBlock(block.id, {
      label: nextLabel && nextLabel !== normalizedFallback ? nextLabel : '',
    });
    setEditingBlockId(null);
    setDraftBlockTitle('');
  }, [draftBlockTitle, updateSingleBlock]);

  const cancelBlockTitleEdit = useCallback(() => {
    setEditingBlockId(null);
    setDraftBlockTitle('');
  }, []);

  const relinkWindowBlock = useCallback((blockId: string, windowId: string) => {
    const linkedWindow = windowsById.get(windowId);

    persistWorkspace((current) => ({
      blocks: current.blocks.map((block) => {
        if (block.id !== blockId || block.type !== 'window') {
          return block;
        }

        return {
          ...block,
          windowId,
          label: linkedWindow?.name ?? block.label,
        };
      }),
    }));
    setRelinkingBlockId(null);
    if (linkedWindow) {
      createCanvasEvent('window-added', linkedWindow.name, t('canvas.activityRelinkedWindow'), {
        windowId,
        blockId,
      });
    }
  }, [createCanvasEvent, persistWorkspace, windowsById]);

  const toggleWindowDisplayMode = useCallback((blockId: string, displayMode: 'summary' | 'live') => {
    const targetBlock = canvasWorkspace.blocks.find((block) => block.id === blockId);
    const targetWindowId = targetBlock && targetBlock.type === 'window'
      ? targetBlock.windowId
      : undefined;

    persistWorkspace((current) => ({
      blocks: current.blocks.map((block) => {
        if (block.id !== blockId || block.type !== 'window') {
          if (
            displayMode === 'live'
            && block.type === 'window'
            && targetWindowId === block.windowId
          ) {
            return {
              ...block,
              displayMode: 'summary',
            };
          }

          return block;
        }

        return {
          ...block,
          displayMode,
        };
      }),
    }));
    const block = canvasWorkspace.blocks.find((item) => item.id === blockId);
    if (block?.type === 'window') {
      createCanvasEvent(
        displayMode === 'live' ? 'window-live-opened' : 'window-live-closed',
        block.label || windowsById.get(block.windowId)?.name || t('canvas.unnamedWindow'),
        undefined,
        {
          windowId: block.windowId,
          blockId,
        },
      );
    }
  }, [canvasWorkspace.blocks, createCanvasEvent, persistWorkspace, t, windowsById]);

  const deleteBlocks = useCallback((blockIds: string[]) => {
    if (blockIds.length === 0) {
      return;
    }

    const ids = new Set(blockIds);
    persistWorkspace((current) => ({
      blocks: current.blocks.filter((block) => !ids.has(block.id)),
    }));
    setSelectedBlockIds((previous) => previous.filter((blockId) => !ids.has(blockId)));
  }, [persistWorkspace]);

  const arrangeCanvas = useCallback((mode: CanvasArrangeMode) => {
    persistWorkspace((current) => ({
      blocks: arrangeCanvasBlocks(current.blocks, mode),
    }));
    setLastArrangeMode(mode);
  }, [persistWorkspace]);

  const fitToContent = useCallback(() => {
    const nextViewport = fitViewportToBlocks(canvasWorkspace.blocks, canvasSize);
    updateViewport(nextViewport.tx, nextViewport.ty, nextViewport.zoom);
  }, [canvasSize, canvasWorkspace.blocks, updateViewport]);

  const handleWorkspaceRenameSave = useCallback(() => {
    const nextName = workspaceNameDraft.trim();
    updateCanvasWorkspace(canvasWorkspace.id, {
      name: nextName || canvasWorkspace.name,
    });
    if (nextName && nextName !== canvasWorkspace.name) {
      createCanvasEvent('workspace-renamed', nextName);
    }
    setWorkspaceRenameOpen(false);
  }, [canvasWorkspace.id, canvasWorkspace.name, createCanvasEvent, updateCanvasWorkspace, workspaceNameDraft]);

  const handleWorkspaceDelete = useCallback(async () => {
    removeCanvasWorkspace(canvasWorkspace.id);
    setWorkspaceDeleteOpen(false);
    await onExitWorkspace?.();
  }, [canvasWorkspace.id, onExitWorkspace, removeCanvasWorkspace]);

  const handleCreateWindowBlock = useCallback((payload: {
    kind: 'local' | 'ssh' | 'code' | 'browser' | 'chat';
    name?: string;
    workingDirectory?: string;
    command?: string;
    url?: string;
    linkedPaneId?: string;
    sshProfileId?: string;
  }) => {
    const sshProfile = payload.sshProfileId
      ? sshProfiles.find((profile) => profile.id === payload.sshProfileId)
      : undefined;
    const draftWindow = createCanvasWindowDraft(payload.kind, {
      name: payload.name,
      workingDirectory: payload.workingDirectory || canvasWorkspace.workingDirectory,
      command: payload.command,
      url: payload.url,
      linkedPaneId: payload.linkedPaneId,
      sshProfile,
    });
    addWindow(draftWindow);
    addWindowBlockFromWindow(draftWindow);
  }, [addWindow, addWindowBlockFromWindow, canvasWorkspace.workingDirectory, sshProfiles]);

  const handleApplyTemplate = useCallback((templateId: string) => {
    const template = resolvedTemplates.find((item) => item.id === templateId);
    if (!template) {
      return;
    }

    const instantiated = instantiateCanvasWorkspaceFromTemplate(template, {
      name: canvasWorkspace.name,
      workingDirectory: canvasWorkspace.workingDirectory,
      sshProfiles,
    });

    for (const windowItem of instantiated.windows) {
      addWindow(windowItem);
    }

    updateCanvasWorkspace(canvasWorkspace.id, {
      blocks: instantiated.workspace.blocks,
      nextZIndex: instantiated.workspace.nextZIndex,
      templateId: template.id,
      updatedAt: new Date().toISOString(),
    });
    setSelectedBlockIds([]);
    setTemplatesOpen(false);
    createCanvasEvent('template-applied', template.name, template.description, {
      templateId: template.id,
    });
  }, [
    addWindow,
    canvasWorkspace.id,
    canvasWorkspace.name,
    canvasWorkspace.workingDirectory,
    createCanvasEvent,
    resolvedTemplates,
    sshProfiles,
    updateCanvasWorkspace,
  ]);

  const handleSaveCurrentAsTemplate = useCallback(() => {
    const template = createTemplateFromWorkspace(canvasWorkspace, windowsById);
    upsertCanvasWorkspaceTemplate(template);
    createCanvasEvent('workspace-created', template.name, t('canvas.activityTemplateSaved'), {
      templateId: template.id,
    });
    setTemplatesOpen(true);
  }, [canvasWorkspace, createCanvasEvent, t, upsertCanvasWorkspaceTemplate, windowsById]);

  const selectBlock = useCallback((blockId: string, additive: boolean) => {
    setSelectedBlockIds((previous) => {
      if (additive) {
        return previous.includes(blockId)
          ? previous.filter((item) => item !== blockId)
          : [...previous, blockId];
      }

      if (previous.length === 1 && previous[0] === blockId) {
        return previous;
      }

      return [blockId];
    });
  }, []);

  const handleCanvasWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }

      const point = getWorldPointFromClient(event.clientX, event.clientY, rect, canvasWorkspace.viewport);
      const nextZoom = clampZoom(canvasWorkspace.viewport.zoom * (event.deltaY > 0 ? 0.92 : 1.08));
      const nextTx = event.clientX - rect.left - point.x * nextZoom;
      const nextTy = event.clientY - rect.top - point.y * nextZoom;
      updateViewport(nextTx, nextTy, nextZoom);
      return;
    }

    event.preventDefault();
    updateViewport(
      canvasWorkspace.viewport.tx - event.deltaX,
      canvasWorkspace.viewport.ty - event.deltaY,
      canvasWorkspace.viewport.zoom,
    );
  }, [canvasWorkspace.viewport, updateViewport]);

  useEffect(() => {
    if (!dragState) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      if (dragState.type === 'pan') {
        updateViewport(
          dragState.initialViewport.tx + (event.clientX - dragState.startClientX),
          dragState.initialViewport.ty + (event.clientY - dragState.startClientY),
          dragState.initialViewport.zoom,
        );
        return;
      }

      if (dragState.type === 'move') {
        const zoom = canvasWorkspace.viewport.zoom;
        const deltaX = (event.clientX - dragState.startClientX) / zoom;
        const deltaY = (event.clientY - dragState.startClientY) / zoom;
        persistWorkspace((current) => ({
          blocks: moveCanvasBlocks(
            current.blocks,
            dragState.blockIds,
            deltaX,
            deltaY,
            dragState.initialPositions,
          ),
        }));
        return;
      }

      if (dragState.type === 'resize') {
        const zoom = canvasWorkspace.viewport.zoom;
        const deltaX = (event.clientX - dragState.startClientX) / zoom;
        const deltaY = (event.clientY - dragState.startClientY) / zoom;
        persistWorkspace((current) => ({
          blocks: current.blocks.map((block) => (
            block.id === dragState.blockId
              ? resizeCanvasBlock(dragState.initialBlock, dragState.direction, deltaX, deltaY)
              : block
          )),
        }));
        return;
      }

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }

      const worldPoint = getWorldPointFromClient(event.clientX, event.clientY, rect, canvasWorkspace.viewport);
      const nextRect = normalizeCanvasRect(
        dragState.startWorldX,
        dragState.startWorldY,
        worldPoint.x,
        worldPoint.y,
      );
      const nextIds = getIntersectingCanvasBlockIds(canvasWorkspace.blocks, nextRect);

      setDragState((previous) => {
        if (!previous || previous.type !== 'select') {
          return previous;
        }

        return {
          ...previous,
          currentWorldX: worldPoint.x,
          currentWorldY: worldPoint.y,
        };
      });

      setSelectedBlockIds(
        dragState.additive
          ? Array.from(new Set([...dragState.baseSelection, ...nextIds]))
          : nextIds,
      );
    };

    const handleMouseUp = () => {
      setDragState(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [canvasWorkspace.blocks, canvasWorkspace.viewport, dragState, persistWorkspace, updateViewport]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName;
      const isTypingTarget = tagName === 'INPUT' || tagName === 'TEXTAREA' || target?.isContentEditable;

      if ((event.key === 'Backspace' || event.key === 'Delete') && !isTypingTarget && selectedBlockIds.length > 0) {
        event.preventDefault();
        deleteBlocks(selectedBlockIds);
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a' && !isTypingTarget) {
        event.preventDefault();
        setSelectedBlockIds(canvasWorkspace.blocks.map((block) => block.id));
      }

      if (event.key === 'Escape') {
        setDragState(null);
        clearSelection();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canvasWorkspace.blocks, clearSelection, deleteBlocks, selectedBlockIds]);

  const worldStyle = useMemo(() => ({
    transform: `translate(${canvasWorkspace.viewport.tx}px, ${canvasWorkspace.viewport.ty}px) scale(${canvasWorkspace.viewport.zoom})`,
    transformOrigin: '0 0',
  }), [canvasWorkspace.viewport.tx, canvasWorkspace.viewport.ty, canvasWorkspace.viewport.zoom]);

  const selectionRect: CanvasRect | null = useMemo(() => {
    if (!dragState || dragState.type !== 'select') {
      return null;
    }

    return normalizeCanvasRect(
      dragState.startWorldX,
      dragState.startWorldY,
      dragState.currentWorldX,
      dragState.currentWorldY,
    );
  }, [dragState]);

  return (
    <div className="absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_top,rgba(88,188,255,0.08),transparent_28%),linear-gradient(180deg,rgba(7,11,18,0.98),rgba(11,16,24,1))]">
      <div className="pointer-events-none absolute left-5 top-4 z-20 flex items-center gap-3 rounded-full border border-white/10 bg-black/35 px-4 py-2 text-sm text-white/80 backdrop-blur">
        <span className="font-medium text-white">{canvasWorkspace.name}</span>
        <span className="text-white/45">·</span>
        <span>{t('canvas.blockCount', { count: canvasWorkspace.blocks.length })}</span>
        <span className="text-white/45">·</span>
        <span>{formatRelativeTime(canvasWorkspace.updatedAt, language as AppLanguage)}</span>
        {selectedBlockIds.length > 0 && (
          <>
            <span className="text-white/45">·</span>
            <span>{t('canvas.selectionCount', { count: selectedBlockIds.length })}</span>
          </>
        )}
      </div>

      <CanvasArrangeToolbar
        blockCount={canvasWorkspace.blocks.length}
        selectedCount={selectedBlockIds.length}
        zoom={canvasWorkspace.viewport.zoom}
        activeArrangeMode={lastArrangeMode}
        canAddWindow={availableWindows.length > 0}
        onCreateBlock={() => setCreateDialogOpen(true)}
        onOpenTemplates={() => setTemplatesOpen(true)}
        onOpenActivity={() => setActivityOpen(true)}
        activityCount={workspaceActivity.length}
        onAddNote={() => {
          const rect = canvasRef.current?.getBoundingClientRect();
          if (!rect) {
            return;
          }

          createNoteAtClient(rect.left + rect.width / 2, rect.top + rect.height / 2);
        }}
        onArrange={arrangeCanvas}
        onResetZoom={() => updateViewport(canvasWorkspace.viewport.tx, canvasWorkspace.viewport.ty, 1)}
        onZoomIn={() => updateViewport(canvasWorkspace.viewport.tx, canvasWorkspace.viewport.ty, canvasWorkspace.viewport.zoom * 1.12)}
        onZoomOut={() => updateViewport(canvasWorkspace.viewport.tx, canvasWorkspace.viewport.ty, canvasWorkspace.viewport.zoom * 0.88)}
        onFitToContent={fitToContent}
        onDeleteSelected={() => deleteBlocks(selectedBlockIds)}
        onRenameWorkspace={() => {
          setWorkspaceNameDraft(canvasWorkspace.name);
          setWorkspaceRenameOpen(true);
        }}
        onDeleteWorkspace={() => setWorkspaceDeleteOpen(true)}
      />

      <div
        ref={canvasRef}
        className="h-full w-full overflow-hidden"
        onWheel={handleCanvasWheel}
        onMouseDown={(event) => {
          const shouldPan = event.button === 1 || (event.button === 0 && event.altKey);
          if (shouldPan) {
            setDragState({
              type: 'pan',
              startClientX: event.clientX,
              startClientY: event.clientY,
              initialViewport: canvasWorkspace.viewport,
            });
            return;
          }

          if (event.button !== 0) {
            return;
          }

          const rect = canvasRef.current?.getBoundingClientRect();
          if (!rect) {
            return;
          }

          const worldPoint = getWorldPointFromClient(event.clientX, event.clientY, rect, canvasWorkspace.viewport);
          const additive = event.metaKey || event.ctrlKey || event.shiftKey;

          if (!additive) {
            clearSelection();
          }

          setDragState({
            type: 'select',
            startWorldX: worldPoint.x,
            startWorldY: worldPoint.y,
            currentWorldX: worldPoint.x,
            currentWorldY: worldPoint.y,
            baseSelection: additive ? selectedBlockIds : [],
            additive,
          });
        }}
        onDoubleClick={(event) => {
          if (event.target === event.currentTarget) {
            createNoteAtClient(event.clientX, event.clientY);
          }
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.12) 1px, transparent 1px)',
            backgroundSize: `${24 * canvasWorkspace.viewport.zoom}px ${24 * canvasWorkspace.viewport.zoom}px`,
            backgroundPosition: `${canvasWorkspace.viewport.tx}px ${canvasWorkspace.viewport.ty}px`,
          }}
        />

        {canvasWorkspace.blocks.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
            <div className="max-w-md rounded-3xl border border-white/10 bg-[rgba(12,16,24,0.82)] px-8 py-7 text-center shadow-[0_24px_80px_rgba(0,0,0,0.32)] backdrop-blur">
              <div className="text-lg font-semibold text-white">{t('canvas.emptyTitle')}</div>
              <p className="mt-2 text-sm leading-6 text-white/60">{t('canvas.emptyDescription')}</p>
              <p className="mt-4 text-xs uppercase tracking-[0.2em] text-white/35">
                {availableWindows.length > 0
                  ? t('canvas.availableWindows')
                  : t('canvas.emptyCreateTerminalHint')}
              </p>
            </div>
          </div>
        )}

        <div className="pointer-events-none absolute inset-0" style={worldStyle}>
          {selectionRect && (
            <div
              className="pointer-events-none absolute border border-sky-300/70 bg-sky-400/10"
              style={{
                left: selectionRect.x,
                top: selectionRect.y,
                width: selectionRect.width,
                height: selectionRect.height,
                zIndex: 9999,
              }}
            />
          )}

          {canvasWorkspace.blocks
            .slice()
            .sort((left, right) => left.zIndex - right.zIndex)
            .map((block) => {
              const selected = selectedBlockIds.includes(block.id);
              const linkedWindow = block.type === 'window' ? windowsById.get(block.windowId) : null;
              const workingDirectory = linkedWindow ? getCurrentWindowWorkingDirectory(linkedWindow) : '';
              const statusLabel = linkedWindow
                ? t(getStatusLabelKey(getAggregatedStatus(linkedWindow.layout)))
                : t('status.noOutput');
              const panes = linkedWindow ? getAllPanes(linkedWindow.layout) : [];
              const activePane = linkedWindow
                ? panes.find((pane) => pane.id === linkedWindow.activePaneId) ?? panes[0] ?? null
                : null;
              const outputPreview = activePane?.lastOutput?.trim() ?? '';
              const title = block.label || (
                block.type === 'window'
                  ? linkedWindow?.name || t('canvas.missingWindow')
                  : t('canvas.noteUntitled')
              );
              const linkedBlockCount = block.type === 'window'
                ? countLinkedWindowBlocks(canvasWorkspace.blocks, block.windowId)
                : 0;
              const isLiveBlockActive = selectedBlockIds[selectedBlockIds.length - 1] === block.id;

              return (
                <CanvasBlockChrome
                  key={block.id}
                  block={block}
                  title={title}
                  selected={selected}
                  missing={block.type === 'window' && !linkedWindow}
                  editingTitle={editingBlockId === block.id}
                  titleEditor={editingBlockId === block.id ? (
                    <input
                      value={draftBlockTitle}
                      autoFocus
                      onChange={(event) => setDraftBlockTitle(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          commitBlockTitle(block, title);
                        }

                        if (event.key === 'Escape') {
                          event.preventDefault();
                          cancelBlockTitleEdit();
                        }
                      }}
                      onBlur={() => commitBlockTitle(block, title)}
                      aria-label={t('canvas.blockTitle')}
                      className="w-full rounded-md border border-white/10 bg-white/10 px-2 py-1 text-sm text-white outline-none focus:border-sky-300/50"
                    />
                  ) : undefined}
                  onMouseDown={(event) => {
                    event.stopPropagation();
                    selectBlock(block.id, event.metaKey || event.ctrlKey || event.shiftKey);
                  }}
                  onHeaderMouseDown={(event) => {
                    event.stopPropagation();

                    const additive = event.metaKey || event.ctrlKey || event.shiftKey;
                    const nextSelection = additive
                      ? (selectedBlockIds.includes(block.id) ? selectedBlockIds : [...selectedBlockIds, block.id])
                      : (selectedBlockIds.includes(block.id) ? selectedBlockIds : [block.id]);

                    setSelectedBlockIds(nextSelection);

                    const elevatedBlocks = bringBlocksToFront(nextSelection);
                    const sourceBlocks = elevatedBlocks.length > 0 ? elevatedBlocks : canvasWorkspace.blocks;
                    const blockMap = new Map(sourceBlocks.map((item) => [item.id, item] as const));

                    setDragState({
                      type: 'move',
                      startClientX: event.clientX,
                      startClientY: event.clientY,
                      blockIds: nextSelection,
                      initialPositions: Object.fromEntries(
                        nextSelection.map((blockId) => {
                          const currentBlock = blockMap.get(blockId);
                          return [blockId, { x: currentBlock?.x ?? 0, y: currentBlock?.y ?? 0 }];
                        }),
                      ),
                    });
                  }}
                  onStartTitleEdit={() => startEditingBlockTitle(block, title)}
                  onResizeMouseDown={(event, direction) => {
                    event.stopPropagation();
                    selectBlock(block.id, false);
                    const elevatedBlocks = bringBlocksToFront([block.id]);
                    const currentBlock = elevatedBlocks.find((item) => item.id === block.id) ?? block;

                    setDragState({
                      type: 'resize',
                      startClientX: event.clientX,
                      startClientY: event.clientY,
                      blockId: block.id,
                      direction,
                      initialBlock: currentBlock,
                    });
                  }}
                  onRemove={() => deleteBlocks([block.id])}
                >
                  {block.type === 'window' ? (
                    block.displayMode === 'live' && linkedWindow ? (
                      <div className="flex h-full min-h-0 flex-col">
                        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 text-xs text-white/55">
                          <span className="truncate">{workingDirectory || t('canvas.unnamedWindow')}</span>
                          <button
                            type="button"
                            onMouseDown={(event) => event.stopPropagation()}
                            onClick={() => toggleWindowDisplayMode(block.id, 'summary')}
                            className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/75 transition hover:bg-white/10 hover:text-white"
                          >
                            {t('canvas.closeLive')}
                          </button>
                        </div>
                        <div className="min-h-0 flex-1 overflow-hidden">
                          <div
                            className="h-full w-full"
                            onMouseDown={(event) => event.stopPropagation()}
                            onClick={(event) => event.stopPropagation()}
                          >
                            {renderLiveWindow?.(linkedWindow.id, { isActive: isLiveBlockActive })}
                          </div>
                        </div>
                      </div>
                    ) : (
                    <div className="flex h-full flex-col justify-between p-4 text-sm text-white/70">
                      <div>
                        <div className="flex items-center gap-2 text-base font-medium text-white">
                          <MonitorSmartphone size={15} />
                          <span className="truncate">{linkedWindow?.name || t('canvas.missingWindow')}</span>
                        </div>
                        {linkedWindow ? (
                          <div className="mt-3 space-y-2 text-white/55">
                            <div>{t('canvas.windowStatus', { status: statusLabel })}</div>
                            <div className="line-clamp-2">
                              {t('canvas.windowDirectory', { path: workingDirectory || 'N/A' })}
                            </div>
                            <div>{t('canvas.windowPaneCount', { count: panes.length })}</div>
                            {outputPreview ? (
                              <div className="line-clamp-3">{outputPreview}</div>
                            ) : (
                              <div className="line-clamp-3">{t('canvas.windowOpenHint')}</div>
                            )}
                          </div>
                        ) : (
                          <div className="mt-3 space-y-3 text-white/55">
                            <div className="line-clamp-3">
                              {t('canvas.windowMissingHint')}
                            </div>
                            <button
                              type="button"
                              onMouseDown={(event) => event.stopPropagation()}
                              onClick={() => setRelinkingBlockId(block.id)}
                              className="inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1.5 text-xs font-medium text-amber-100 transition hover:bg-amber-400/16"
                            >
                              <Link2 size={13} />
                              {t('canvas.relinkWindow')}
                            </button>
                          </div>
                        )}
                      </div>

                      {linkedWindow && (
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-white/55">
                              {getWindowKind(linkedWindow)}
                            </span>
                            {linkedBlockCount > 1 && (
                              <span className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-white/55">
                                {t('canvas.windowLinkedCount', { count: linkedBlockCount })}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onMouseDown={(event) => event.stopPropagation()}
                            onClick={() => onOpenWindow?.(linkedWindow.id)}
                            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/15"
                          >
                            <MonitorSmartphone size={13} />
                            {t('canvas.openTerminal')}
                          </button>
                          <button
                            type="button"
                            onMouseDown={(event) => event.stopPropagation()}
                            onClick={() => toggleWindowDisplayMode(block.id, 'live')}
                            className="inline-flex items-center gap-2 rounded-full border border-sky-300/25 bg-sky-400/10 px-3 py-1.5 text-xs font-medium text-sky-100 transition hover:bg-sky-400/16"
                          >
                            <MonitorSmartphone size={13} />
                            {t('canvas.openLive')}
                          </button>
                        </div>
                      )}
                    </div>
                    )
                  ) : (
                    <div className="flex h-full flex-col">
                      <div className="px-4 pt-3 text-xs uppercase tracking-[0.18em] text-white/30">
                        <StickyNote size={12} className="mr-2 inline" />
                        {t('canvas.defaultNoteTitle')}
                      </div>
                      <textarea
                        value={block.content}
                        onMouseDown={(event) => {
                          event.stopPropagation();
                          selectBlock(block.id, false);
                        }}
                        onChange={(event) => updateSingleBlock(block.id, { content: event.target.value })}
                        placeholder={t('canvas.notePlaceholder')}
                        className="pointer-events-auto h-full w-full resize-none border-0 bg-transparent px-4 pb-4 pt-2 text-sm text-white outline-none placeholder:text-white/30"
                      />
                    </div>
                  )}
                </CanvasBlockChrome>
              );
            })}
        </div>
      </div>

      <CanvasMinimap
        blocks={canvasWorkspace.blocks}
        viewport={canvasWorkspace.viewport}
        canvasSize={canvasSize}
        onPan={(tx, ty) => updateViewport(tx, ty, canvasWorkspace.viewport.zoom)}
      />

      <CanvasWindowPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        windows={availableWindows}
        onPick={addWindowBlock}
      />

      <CanvasCreateBlockDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        sshProfiles={sshProfiles}
        templates={resolvedTemplates}
        initialWorkingDirectory={canvasWorkspace.workingDirectory}
        onCreateWindow={handleCreateWindowBlock}
        onCreateNote={() => {
          const rect = canvasRef.current?.getBoundingClientRect();
          if (!rect) {
            return;
          }

          createNoteAtClient(rect.left + rect.width / 2, rect.top + rect.height / 2);
        }}
        onApplyTemplate={handleApplyTemplate}
      />

      <CanvasWindowPickerDialog
        open={Boolean(relinkingBlockId)}
        onOpenChange={(open) => {
          if (!open) {
            setRelinkingBlockId(null);
          }
        }}
        title={t('canvas.relinkWindow')}
        description={t('canvas.windowRelinkDescription')}
        windows={relinkAvailableWindows}
        onPick={(windowId) => {
          if (relinkingBlockId) {
            relinkWindowBlock(relinkingBlockId, windowId);
          }
        }}
      />

      <Dialog
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        title={t('canvas.templates')}
        description={t('canvas.templatesDescription')}
        contentClassName="!max-w-5xl"
        showCloseButton
        closeLabel={t('common.close')}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-[rgb(var(--muted-foreground))]">
              {t('canvas.templateCount', { count: resolvedTemplates.length })}
            </div>
            <button
              type="button"
              onClick={handleSaveCurrentAsTemplate}
              className={idePopupActionButtonClassName()}
            >
              <Save size={14} />
              {t('canvas.saveAsTemplate')}
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {resolvedTemplates.map((template) => (
              <div key={template.id} className={`${idePopupCardClassName} rounded-2xl p-4`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-[rgb(var(--foreground))]">{template.name}</div>
                    {template.description ? (
                      <p className="mt-1 text-sm leading-6 text-[rgb(var(--muted-foreground))]">{template.description}</p>
                    ) : null}
                  </div>
                  {!template.system ? (
                    <button
                      type="button"
                      onClick={() => removeCanvasWorkspaceTemplate(template.id)}
                      className={idePopupSecondaryButtonClassName}
                    >
                      {t('common.delete')}
                    </button>
                  ) : null}
                </div>
                <div className="mt-3 text-xs text-[rgb(var(--muted-foreground))]">
                  {t('canvas.templateBlockCount', { count: template.blocks.length })}
                </div>
                <div className="mt-4 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => handleApplyTemplate(template.id)}
                    className={idePopupActionButtonClassName()}
                  >
                    {t('canvas.applyTemplate')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Dialog>

      <Dialog
        open={activityOpen}
        onOpenChange={setActivityOpen}
        title={t('canvas.activity')}
        description={t('canvas.activityDescription')}
        contentClassName="!max-w-3xl"
        showCloseButton
        closeLabel={t('common.close')}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-[rgb(var(--muted-foreground))]">
              {t('canvas.activityWithCount', { count: workspaceActivity.length })}
            </div>
            <button
              type="button"
              onClick={() => clearCanvasActivity(canvasWorkspace.id)}
              className={idePopupSecondaryButtonClassName}
            >
              {t('canvas.clearActivity')}
            </button>
          </div>
          {workspaceActivity.length === 0 ? (
            <div className="rounded-2xl border border-[rgb(var(--border))] px-4 py-6 text-sm text-[rgb(var(--muted-foreground))]">
              {t('canvas.emptyActivity')}
            </div>
          ) : (
            <div className="space-y-3">
              {workspaceActivity.map((event) => (
                <div key={event.id} className={`${idePopupCardClassName} rounded-2xl p-4`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-medium text-[rgb(var(--foreground))]">
                        <Activity size={14} />
                        <span className="truncate">{event.title}</span>
                      </div>
                      {event.message ? (
                        <p className="mt-1 text-sm leading-6 text-[rgb(var(--muted-foreground))]">{event.message}</p>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-xs text-[rgb(var(--muted-foreground))]">
                      {formatRelativeTime(event.timestamp, language as AppLanguage)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Dialog>

      <Dialog
        open={workspaceRenameOpen}
        onOpenChange={setWorkspaceRenameOpen}
        title={t('canvas.renameWorkspace')}
        description={t('canvas.renameWorkspaceDescription')}
        contentClassName="!max-w-lg"
        showCloseButton
        closeLabel={t('common.close')}
      >
        <div className="space-y-4">
          <input
            value={workspaceNameDraft}
            onChange={(event) => setWorkspaceNameDraft(event.target.value)}
            autoFocus
            aria-label={t('canvas.workspaceName')}
            className={idePopupInputClassName}
          />
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setWorkspaceRenameOpen(false)}
              className={idePopupSecondaryButtonClassName}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={handleWorkspaceRenameSave}
              className={idePopupActionButtonClassName()}
            >
              {t('common.save')}
            </button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={workspaceDeleteOpen}
        onOpenChange={setWorkspaceDeleteOpen}
        title={t('canvas.deleteWorkspace')}
        description={t('canvas.deleteWorkspaceDescription')}
        contentClassName="!max-w-lg"
        showCloseButton
        closeLabel={t('common.close')}
      >
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => setWorkspaceDeleteOpen(false)}
            className={idePopupSecondaryButtonClassName}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => {
              void handleWorkspaceDelete();
            }}
            className={idePopupActionButtonClassName('danger')}
          >
            {t('common.delete')}
          </button>
        </div>
      </Dialog>
    </div>
  );
};
