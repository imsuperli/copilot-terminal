export type CanvasBlockType = 'window' | 'note';
export type CanvasWindowDraftKind = 'local' | 'ssh' | 'code' | 'browser' | 'chat';
export type CanvasTemplateBlockKind = CanvasWindowDraftKind | 'note';

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
  displayMode?: 'summary' | 'live';
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
  templateId?: string;
  blocks: CanvasBlock[];
  viewport: CanvasViewport;
  nextZIndex: number;
}

export interface CanvasTemplateBlockDefinition {
  id: string;
  kind: CanvasTemplateBlockKind;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  displayMode?: 'summary' | 'live';
  noteContent?: string;
  workingDirectory?: string;
  command?: string;
  url?: string;
  linkedPaneId?: string;
}

export interface CanvasWorkspaceTemplate {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  system?: boolean;
  workingDirectory?: string;
  blocks: CanvasTemplateBlockDefinition[];
}

export interface CanvasActivityEvent {
  id: string;
  workspaceId: string;
  timestamp: string;
  type:
    | 'workspace-created'
    | 'workspace-renamed'
    | 'template-applied'
    | 'window-added'
    | 'window-opened'
    | 'window-live-opened'
    | 'window-live-closed'
    | 'note-added'
    | 'checkpoint-saved'
    | 'chat-sent'
    | 'agent-update'
    | 'agent-error';
  title: string;
  message?: string;
  windowId?: string;
  blockId?: string;
  templateId?: string;
  paneId?: string;
}
