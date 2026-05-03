import type {
  CanvasBlock,
  CanvasBlockType,
  CanvasViewport,
} from '../../shared/types/canvas';

export type CanvasArrangeMode = 'grid' | 'row' | 'column';
export type CanvasResizeDirection = 'e' | 's' | 'se' | 'w' | 'n' | 'nw' | 'ne' | 'sw';

export interface CanvasRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const CANVAS_GAP = 40;
export const CANVAS_BOUNDS_PADDING = 48;
export const CANVAS_MIN_ZOOM = 0.3;
export const CANVAS_MAX_ZOOM = 2.5;
export const DEFAULT_NOTE_BLOCK_SIZE = { width: 320, height: 200 };
export const DEFAULT_WINDOW_BLOCK_SIZE = { width: 360, height: 220 };

const MIN_BLOCK_SIZE: Record<CanvasBlockType, { width: number; height: number }> = {
  note: { width: 220, height: 140 },
  window: { width: 280, height: 180 },
};

export function clampZoom(zoom: number): number {
  return Math.max(CANVAS_MIN_ZOOM, Math.min(CANVAS_MAX_ZOOM, zoom));
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
