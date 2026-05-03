export type CanvasBlockType = 'window' | 'note';

export interface CanvasViewport {
  tx: number;
  ty: number;
  zoom: number;
}

interface CanvasBlockBase {
  id: string;
  type: CanvasBlockType;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  label?: string;
}

export interface CanvasWindowBlock extends CanvasBlockBase {
  type: 'window';
  windowId: string;
}

export interface CanvasNoteBlock extends CanvasBlockBase {
  type: 'note';
  content: string;
}

export type CanvasBlock = CanvasWindowBlock | CanvasNoteBlock;

export interface CanvasWorkspace {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  workingDirectory?: string;
  archived?: boolean;
  blocks: CanvasBlock[];
  viewport: CanvasViewport;
  nextZIndex: number;
}
