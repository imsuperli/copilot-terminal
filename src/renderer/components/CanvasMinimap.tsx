import React, { useCallback, useEffect, useRef } from 'react';
import type { CanvasBlock, CanvasViewport } from '../../shared/types/canvas';

interface CanvasMinimapProps {
  blocks: CanvasBlock[];
  viewport: CanvasViewport;
  canvasSize: { w: number; h: number };
  onPan: (tx: number, ty: number) => void;
}

const TILE_COLORS: Record<CanvasBlock['type'], string> = {
  window: '#4a9eff',
  note: '#e2c08d',
};

const WIDTH = 160;
const HEIGHT = 100;
const PADDING = 20;

export function CanvasMinimap({
  blocks,
  viewport,
  canvasSize,
  onPan,
}: CanvasMinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draggingRef = useRef(false);

  const getBounds = useCallback(() => {
    if (blocks.length === 0) {
      return { minX: 0, minY: 0, maxX: 1000, maxY: 600 };
    }

    const minX = Math.min(...blocks.map((block) => block.x)) - PADDING;
    const minY = Math.min(...blocks.map((block) => block.y)) - PADDING;
    const maxX = Math.max(...blocks.map((block) => block.x + block.width)) + PADDING;
    const maxY = Math.max(...blocks.map((block) => block.y + block.height)) + PADDING;
    return { minX, minY, maxX, maxY };
  }, [blocks]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    canvas.width = WIDTH * dpr;
    canvas.height = HEIGHT * dpr;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.scale(dpr, dpr);
    context.clearRect(0, 0, WIDTH, HEIGHT);

    const { minX, minY, maxX, maxY } = getBounds();
    const worldW = maxX - minX;
    const worldH = maxY - minY;
    const scale = Math.min(WIDTH / worldW, HEIGHT / worldH) * 0.9;
    const offX = (WIDTH - worldW * scale) / 2 - minX * scale;
    const offY = (HEIGHT - worldH * scale) / 2 - minY * scale;

    for (const block of blocks) {
      const x = block.x * scale + offX;
      const y = block.y * scale + offY;
      const w = Math.max(2, block.width * scale);
      const h = Math.max(2, block.height * scale);
      context.fillStyle = `${TILE_COLORS[block.type]}88`;
      context.strokeStyle = `${TILE_COLORS[block.type]}cc`;
      context.lineWidth = 0.5;
      context.beginPath();
      context.roundRect(x, y, w, h, 1);
      context.fill();
      context.stroke();
    }

    const vx = (-viewport.tx / viewport.zoom) * scale + offX;
    const vy = (-viewport.ty / viewport.zoom) * scale + offY;
    const vw = (canvasSize.w / viewport.zoom) * scale;
    const vh = (canvasSize.h / viewport.zoom) * scale;
    context.strokeStyle = 'rgba(255,255,255,0.3)';
    context.lineWidth = 1;
    context.strokeRect(vx, vy, vw, vh);
    context.fillStyle = 'rgba(255,255,255,0.04)';
    context.fillRect(vx, vy, vw, vh);
  }, [blocks, canvasSize, getBounds, viewport]);

  const panTo = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const mx = (clientX - rect.left) * (WIDTH / rect.width);
    const my = (clientY - rect.top) * (HEIGHT / rect.height);

    const { minX, minY, maxX, maxY } = getBounds();
    const worldW = maxX - minX;
    const worldH = maxY - minY;
    const scale = Math.min(WIDTH / worldW, HEIGHT / worldH) * 0.9;
    const offX = (WIDTH - worldW * scale) / 2 - minX * scale;
    const offY = (HEIGHT - worldH * scale) / 2 - minY * scale;

    const worldX = (mx - offX) / scale;
    const worldY = (my - offY) / scale;
    const tx = canvasSize.w / 2 - worldX * viewport.zoom;
    const ty = canvasSize.h / 2 - worldY * viewport.zoom;
    onPan(tx, ty);
  }, [canvasSize, getBounds, onPan, viewport.zoom]);

  if (blocks.length === 0) {
    return null;
  }

  return (
    <div
      className="absolute bottom-4 left-4 z-20 overflow-hidden rounded-lg border border-white/10 bg-[rgba(12,16,24,0.9)] shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
      style={{ cursor: 'crosshair' }}
    >
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        style={{ display: 'block', width: WIDTH, height: HEIGHT }}
        onMouseDown={(event) => {
          draggingRef.current = true;
          panTo(event.clientX, event.clientY);
        }}
        onMouseMove={(event) => {
          if (draggingRef.current) {
            panTo(event.clientX, event.clientY);
          }
        }}
        onMouseUp={() => {
          draggingRef.current = false;
        }}
        onMouseLeave={() => {
          draggingRef.current = false;
        }}
      />
    </div>
  );
}
