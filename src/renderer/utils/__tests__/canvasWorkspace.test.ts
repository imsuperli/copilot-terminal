import { describe, expect, it } from 'vitest';
import type { CanvasBlock } from '../../../shared/types/canvas';
import {
  arrangeCanvasBlocks,
  buildCanvasLinkGeometry,
  fitViewportToBlocks,
  moveCanvasBlocks,
  resizeCanvasBlock,
} from '../canvasWorkspace';

const sampleBlocks: CanvasBlock[] = [
  { id: 'note-1', type: 'note', x: 20, y: 30, width: 320, height: 200, zIndex: 1, content: '', label: 'A' },
  { id: 'win-1', type: 'window', x: 420, y: 60, width: 360, height: 220, zIndex: 2, windowId: 'window-1', label: 'B' },
  { id: 'note-2', type: 'note', x: 180, y: 420, width: 280, height: 180, zIndex: 3, content: '', label: 'C' },
];

describe('canvasWorkspace utils', () => {
  it('arranges blocks in rows with increasing x positions', () => {
    const arranged = arrangeCanvasBlocks(sampleBlocks, 'row');
    expect(arranged[0].x).toBe(0);
    expect(arranged[0].y).toBe(0);
    expect(arranged[1].x).toBeGreaterThan(arranged[0].x);
    expect(arranged[2].x).toBeGreaterThan(arranged[1].x);
  });

  it('fits viewport to content bounds', () => {
    const viewport = fitViewportToBlocks(sampleBlocks, { w: 1200, h: 800 });
    expect(viewport.zoom).toBeGreaterThan(0.3);
    expect(viewport.zoom).toBeLessThanOrEqual(2.5);
    expect(Number.isFinite(viewport.tx)).toBe(true);
    expect(Number.isFinite(viewport.ty)).toBe(true);
  });

  it('moves only the targeted blocks', () => {
    const moved = moveCanvasBlocks(
      sampleBlocks,
      ['note-1', 'note-2'],
      100,
      -20,
      {
        'note-1': { x: 20, y: 30 },
        'note-2': { x: 180, y: 420 },
      },
    );

    expect(moved[0].x).toBe(120);
    expect(moved[0].y).toBe(10);
    expect(moved[1].x).toBe(sampleBlocks[1].x);
    expect(moved[2].x).toBe(280);
    expect(moved[2].y).toBe(400);
  });

  it('respects minimum sizes when resizing from the west and north edges', () => {
    const resized = resizeCanvasBlock(sampleBlocks[0], 'nw', 600, 500);
    expect(resized.width).toBeGreaterThanOrEqual(220);
    expect(resized.height).toBeGreaterThanOrEqual(140);
    expect(resized.x).toBeGreaterThanOrEqual(sampleBlocks[0].x);
    expect(resized.y).toBeGreaterThanOrEqual(sampleBlocks[0].y);
  });

  it('builds edge-to-edge link geometry instead of connecting block centers', () => {
    const geometry = buildCanvasLinkGeometry(sampleBlocks[0], sampleBlocks[1]);

    expect(geometry.start.x).toBe(sampleBlocks[0].x + sampleBlocks[0].width);
    expect(geometry.start.y).toBeGreaterThan(sampleBlocks[0].y);
    expect(geometry.start.y).toBeLessThan(sampleBlocks[0].y + sampleBlocks[0].height);
    expect(geometry.end.x).toBe(sampleBlocks[1].x);
    expect(geometry.end.y).toBeGreaterThan(sampleBlocks[1].y);
    expect(geometry.end.y).toBeLessThan(sampleBlocks[1].y + sampleBlocks[1].height);
    expect(geometry.start.x).not.toBe(sampleBlocks[0].x + sampleBlocks[0].width / 2);
    expect(geometry.end.x).not.toBe(sampleBlocks[1].x + sampleBlocks[1].width / 2);
    expect(geometry.path.startsWith(`M ${geometry.start.x} ${geometry.start.y}`)).toBe(true);
  });
});
