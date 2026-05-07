import type {
  CanvasBlock,
  CanvasWindowBlock,
  CanvasBlockType,
  CanvasViewport,
} from '../../shared/types/canvas';
import type { Window } from '../types/window';
import { getAllPanes } from './layoutHelpers';
import { isBrowserPane, isChatPane, isCodePane } from '../../shared/utils/terminalCapabilities';

export type CanvasArrangeMode = 'grid' | 'row' | 'column';
export type CanvasResizeDirection = 'e' | 's' | 'se' | 'w' | 'n' | 'nw' | 'ne' | 'sw';

export interface CanvasRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasLinkPoint {
  x: number;
  y: number;
}

export type CanvasLinkAnchorSide = 'left' | 'right' | 'top' | 'bottom';

export interface CanvasLinkGeometry {
  path: string;
  midpoint: CanvasLinkPoint;
  start: CanvasLinkPoint;
  end: CanvasLinkPoint;
  startSide: CanvasLinkAnchorSide;
  endSide: CanvasLinkAnchorSide;
}

export const CANVAS_GAP = 40;
export const CANVAS_BOUNDS_PADDING = 48;
export const CANVAS_MIN_ZOOM = 0.3;
export const CANVAS_MAX_ZOOM = 2.5;
export const DEFAULT_NOTE_BLOCK_SIZE = { width: 320, height: 200 };
export const DEFAULT_WINDOW_BLOCK_SIZE = { width: 360, height: 220 };
export const DEFAULT_CHAT_WINDOW_BLOCK_SIZE = { width: 440, height: 320 };
export const DEFAULT_BROWSER_WINDOW_BLOCK_SIZE = { width: 420, height: 300 };
export const DEFAULT_CODE_WINDOW_BLOCK_SIZE = { width: 460, height: 320 };
export const DEFAULT_CANVAS_INSERT_ORIGIN = { x: 112, y: 124 };
export const DEFAULT_CANVAS_INSERT_STEP = { x: 28, y: 24 };
export const DEFAULT_CANVAS_INSERT_SEARCH_PADDING = 24;

const MIN_BLOCK_SIZE: Record<CanvasBlockType, { width: number; height: number }> = {
  note: { width: 220, height: 140 },
  window: { width: 280, height: 180 },
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function getCanvasBlockCenter(block: CanvasBlock): CanvasLinkPoint {
  return {
    x: block.x + block.width / 2,
    y: block.y + block.height / 2,
  };
}

function getCanvasLinkAnchorNormal(side: CanvasLinkAnchorSide): CanvasLinkPoint {
  switch (side) {
    case 'left':
      return { x: -1, y: 0 };
    case 'right':
      return { x: 1, y: 0 };
    case 'top':
      return { x: 0, y: -1 };
    case 'bottom':
      return { x: 0, y: 1 };
    default:
      return { x: 1, y: 0 };
  }
}

function getCanvasBlockEdgeAnchor(block: CanvasBlock, targetPoint: CanvasLinkPoint): {
  point: CanvasLinkPoint;
  side: CanvasLinkAnchorSide;
} {
  const center = getCanvasBlockCenter(block);
  const halfWidth = block.width / 2;
  const halfHeight = block.height / 2;
  const dx = targetPoint.x - center.x;
  const dy = targetPoint.y - center.y;

  if (dx === 0 && dy === 0) {
    return {
      point: {
        x: block.x + block.width,
        y: center.y,
      },
      side: 'right',
    };
  }

  const scaleX = dx === 0 ? Number.POSITIVE_INFINITY : halfWidth / Math.abs(dx);
  const scaleY = dy === 0 ? Number.POSITIVE_INFINITY : halfHeight / Math.abs(dy);
  const intersectsHorizontalEdge = scaleX <= scaleY;
  const cornerInset = Math.min(18, block.width / 4, block.height / 4);

  if (intersectsHorizontalEdge) {
    return {
      point: {
        x: dx >= 0 ? block.x + block.width : block.x,
        y: clamp(
          center.y + dy * scaleX,
          block.y + cornerInset,
          block.y + block.height - cornerInset,
        ),
      },
      side: dx >= 0 ? 'right' : 'left',
    };
  }

  return {
    point: {
      x: clamp(
        center.x + dx * scaleY,
        block.x + cornerInset,
        block.x + block.width - cornerInset,
      ),
      y: dy >= 0 ? block.y + block.height : block.y,
    },
    side: dy >= 0 ? 'bottom' : 'top',
  };
}

function getCubicBezierPoint(
  start: CanvasLinkPoint,
  control1: CanvasLinkPoint,
  control2: CanvasLinkPoint,
  end: CanvasLinkPoint,
  t: number,
): CanvasLinkPoint {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;

  return {
    x: mt2 * mt * start.x + 3 * mt2 * t * control1.x + 3 * mt * t2 * control2.x + t2 * t * end.x,
    y: mt2 * mt * start.y + 3 * mt2 * t * control1.y + 3 * mt * t2 * control2.y + t2 * t * end.y,
  };
}

export function buildCanvasLinkGeometry(fromBlock: CanvasBlock, toBlock: CanvasBlock): CanvasLinkGeometry {
  const fromCenter = getCanvasBlockCenter(fromBlock);
  const toCenter = getCanvasBlockCenter(toBlock);
  const startAnchor = getCanvasBlockEdgeAnchor(fromBlock, toCenter);
  const endAnchor = getCanvasBlockEdgeAnchor(toBlock, fromCenter);
  const dx = endAnchor.point.x - startAnchor.point.x;
  const dy = endAnchor.point.y - startAnchor.point.y;
  const distance = Math.hypot(dx, dy);

  if (distance < 1) {
    return {
      path: `M ${startAnchor.point.x} ${startAnchor.point.y} L ${endAnchor.point.x} ${endAnchor.point.y}`,
      midpoint: {
        x: (startAnchor.point.x + endAnchor.point.x) / 2,
        y: (startAnchor.point.y + endAnchor.point.y) / 2,
      },
      start: startAnchor.point,
      end: endAnchor.point,
      startSide: startAnchor.side,
      endSide: endAnchor.side,
    };
  }

  const controlOffset = clamp(distance * 0.32, 36, 180);
  const startNormal = getCanvasLinkAnchorNormal(startAnchor.side);
  const endNormal = getCanvasLinkAnchorNormal(endAnchor.side);
  const control1 = {
    x: startAnchor.point.x + startNormal.x * controlOffset,
    y: startAnchor.point.y + startNormal.y * controlOffset,
  };
  const control2 = {
    x: endAnchor.point.x + endNormal.x * controlOffset,
    y: endAnchor.point.y + endNormal.y * controlOffset,
  };
  const midpoint = getCubicBezierPoint(startAnchor.point, control1, control2, endAnchor.point, 0.5);

  return {
    path: [
      `M ${startAnchor.point.x} ${startAnchor.point.y}`,
      `C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${endAnchor.point.x} ${endAnchor.point.y}`,
    ].join(' '),
    midpoint,
    start: startAnchor.point,
    end: endAnchor.point,
    startSide: startAnchor.side,
    endSide: endAnchor.side,
  };
}

export function clampZoom(zoom: number): number {
  return Math.max(CANVAS_MIN_ZOOM, Math.min(CANVAS_MAX_ZOOM, zoom));
}

export function getCanvasWindowBlockSize(windowItem: Window): { width: number; height: number } {
  const panes = getAllPanes(windowItem.layout);
  const activePane = panes.find((pane) => pane.id === windowItem.activePaneId) ?? panes[0] ?? null;

  if (!activePane) {
    return DEFAULT_WINDOW_BLOCK_SIZE;
  }

  if (isChatPane(activePane)) {
    return DEFAULT_CHAT_WINDOW_BLOCK_SIZE;
  }

  if (isCodePane(activePane)) {
    return DEFAULT_CODE_WINDOW_BLOCK_SIZE;
  }

  if (isBrowserPane(activePane)) {
    return DEFAULT_BROWSER_WINDOW_BLOCK_SIZE;
  }

  return DEFAULT_WINDOW_BLOCK_SIZE;
}

export function createCanvasWindowBlock(
  windowItem: Window,
  index: number,
  zIndex: number,
  existingBlocks?: CanvasBlock[],
): CanvasWindowBlock {
  const size = getCanvasWindowBlockSize(windowItem);
  const insertionRect = existingBlocks
    ? findCanvasWindowInsertRect(existingBlocks, size)
    : {
        x: DEFAULT_CANVAS_INSERT_ORIGIN.x + index * DEFAULT_CANVAS_INSERT_STEP.x,
        y: DEFAULT_CANVAS_INSERT_ORIGIN.y + index * DEFAULT_CANVAS_INSERT_STEP.y,
        width: size.width,
        height: size.height,
      };
  return {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? `window-${crypto.randomUUID()}` : `window-${Date.now()}`,
    type: 'window',
    windowId: windowItem.id,
    x: insertionRect.x,
    y: insertionRect.y,
    width: insertionRect.width,
    height: insertionRect.height,
    zIndex,
    label: windowItem.name,
    displayMode: 'summary',
  };
}

export function findCanvasWindowInsertRect(
  blocks: CanvasBlock[],
  size: { width: number; height: number },
  options?: {
    origin?: { x: number; y: number };
    step?: { x: number; y: number };
    searchPadding?: number;
    maxAttempts?: number;
  },
): CanvasRect {
  const origin = options?.origin ?? DEFAULT_CANVAS_INSERT_ORIGIN;
  const step = options?.step ?? DEFAULT_CANVAS_INSERT_STEP;
  const searchPadding = options?.searchPadding ?? DEFAULT_CANVAS_INSERT_SEARCH_PADDING;
  const maxAttempts = options?.maxAttempts ?? 240;

  let candidateX = origin.x;
  let candidateY = origin.y;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate: CanvasRect = {
      x: candidateX,
      y: candidateY,
      width: size.width,
      height: size.height,
    };

    const expandedCandidate: CanvasRect = {
      x: candidate.x - searchPadding,
      y: candidate.y - searchPadding,
      width: candidate.width + searchPadding * 2,
      height: candidate.height + searchPadding * 2,
    };

    const intersects = blocks.some((block) => doesCanvasRectIntersectBlock(expandedCandidate, block));
    if (!intersects) {
      return candidate;
    }

    candidateX += step.x;
    candidateY += step.y;

    if ((attempt + 1) % 8 === 0) {
      candidateX = origin.x;
      candidateY += size.height + CANVAS_GAP;
    }
  }

  const bounds = getCanvasBounds(blocks);
  return {
    x: Math.max(origin.x, bounds.minX),
    y: Math.max(origin.y, bounds.maxY + CANVAS_GAP),
    width: size.width,
    height: size.height,
  };
}

export function arrangeCanvasBlocks(
  blocks: CanvasBlock[],
  mode: CanvasArrangeMode,
  gap: number = CANVAS_GAP,
): CanvasBlock[] {
  if (blocks.length === 0) {
    return blocks;
  }

  if (mode === 'column') {
    let y = 0;
    return blocks.map((block) => {
      const nextBlock = { ...block, x: 0, y };
      y += block.height + gap;
      return nextBlock;
    });
  }

  if (mode === 'row') {
    let x = 0;
    return blocks.map((block) => {
      const nextBlock = { ...block, x, y: 0 };
      x += block.width + gap;
      return nextBlock;
    });
  }

  const cols = Math.max(1, Math.round(Math.sqrt(blocks.length * 1.6)));
  const colWidth = Math.max(...blocks.map((block) => block.width));
  const arranged: CanvasBlock[] = [];
  let y = 0;

  for (let row = 0; row * cols < blocks.length; row += 1) {
    const rowBlocks = blocks.slice(row * cols, (row + 1) * cols);
    const rowHeight = Math.max(...rowBlocks.map((block) => block.height));
    for (let col = 0; col < rowBlocks.length; col += 1) {
      arranged.push({
        ...rowBlocks[col],
        x: col * (colWidth + gap),
        y,
      });
    }
    y += rowHeight + gap;
  }

  return arranged;
}

export function getCanvasBlockMinSize(block: CanvasBlock | CanvasBlockType): {
  width: number;
  height: number;
} {
  const type = typeof block === 'string' ? block : block.type;
  return MIN_BLOCK_SIZE[type];
}

export function getCanvasBounds(
  blocks: CanvasBlock[],
  padding: number = CANVAS_BOUNDS_PADDING,
): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
} {
  if (blocks.length === 0) {
    return {
      minX: 0,
      minY: 0,
      maxX: 1000,
      maxY: 600,
      width: 1000,
      height: 600,
    };
  }

  const minX = Math.min(...blocks.map((block) => block.x)) - padding;
  const minY = Math.min(...blocks.map((block) => block.y)) - padding;
  const maxX = Math.max(...blocks.map((block) => block.x + block.width)) + padding;
  const maxY = Math.max(...blocks.map((block) => block.y + block.height)) + padding;

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function fitViewportToBlocks(
  blocks: CanvasBlock[],
  canvasSize: { w: number; h: number },
): CanvasViewport {
  if (blocks.length === 0 || canvasSize.w <= 0 || canvasSize.h <= 0) {
    return { tx: 0, ty: 0, zoom: 1 };
  }

  const bounds = getCanvasBounds(blocks);
  const paddedZoom = Math.min(canvasSize.w / bounds.width, canvasSize.h / bounds.height) * 0.92;
  const zoom = clampZoom(paddedZoom);
  const centerX = bounds.minX + bounds.width / 2;
  const centerY = bounds.minY + bounds.height / 2;

  return {
    tx: canvasSize.w / 2 - centerX * zoom,
    ty: canvasSize.h / 2 - centerY * zoom,
    zoom,
  };
}

export function getWorldPointFromClient(
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, 'left' | 'top'>,
  viewport: CanvasViewport,
): { x: number; y: number } {
  return {
    x: (clientX - rect.left - viewport.tx) / viewport.zoom,
    y: (clientY - rect.top - viewport.ty) / viewport.zoom,
  };
}

export function normalizeCanvasRect(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): CanvasRect {
  const x = Math.min(startX, endX);
  const y = Math.min(startY, endY);
  return {
    x,
    y,
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY),
  };
}

export function doesCanvasRectIntersectBlock(rect: CanvasRect, block: CanvasBlock): boolean {
  return !(
    rect.x + rect.width < block.x
    || rect.x > block.x + block.width
    || rect.y + rect.height < block.y
    || rect.y > block.y + block.height
  );
}

export function getIntersectingCanvasBlockIds(
  blocks: CanvasBlock[],
  rect: CanvasRect,
): string[] {
  return blocks
    .filter((block) => doesCanvasRectIntersectBlock(rect, block))
    .map((block) => block.id);
}

export function moveCanvasBlocks(
  blocks: CanvasBlock[],
  blockIds: string[],
  deltaX: number,
  deltaY: number,
  initialPositions: Record<string, { x: number; y: number }>,
): CanvasBlock[] {
  const targetIds = new Set(blockIds);
  return blocks.map((block) => {
    if (!targetIds.has(block.id)) {
      return block;
    }

    const initial = initialPositions[block.id];
    if (!initial) {
      return block;
    }

    return {
      ...block,
      x: initial.x + deltaX,
      y: initial.y + deltaY,
    };
  });
}

export function resizeCanvasBlock(
  block: CanvasBlock,
  direction: CanvasResizeDirection,
  deltaX: number,
  deltaY: number,
): CanvasBlock {
  const minimumSize = getCanvasBlockMinSize(block);
  let nextX = block.x;
  let nextY = block.y;
  let nextWidth = block.width;
  let nextHeight = block.height;

  if (direction.includes('e')) {
    nextWidth = Math.max(minimumSize.width, block.width + deltaX);
  }

  if (direction.includes('s')) {
    nextHeight = Math.max(minimumSize.height, block.height + deltaY);
  }

  if (direction.includes('w')) {
    nextWidth = Math.max(minimumSize.width, block.width - deltaX);
    nextX = block.x + (block.width - nextWidth);
  }

  if (direction.includes('n')) {
    nextHeight = Math.max(minimumSize.height, block.height - deltaY);
    nextY = block.y + (block.height - nextHeight);
  }

  return {
    ...block,
    x: nextX,
    y: nextY,
    width: nextWidth,
    height: nextHeight,
  };
}
