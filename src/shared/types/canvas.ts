export type CanvasBlockType = 'window' | 'note';
export type CanvasWindowDraftKind = 'local' | 'ssh' | 'code' | 'browser' | 'chat';
export type CanvasTemplateBlockKind = CanvasWindowDraftKind | 'note';
export type CanvasBlockLinkKind = 'context' | 'depends-on' | 'evidence' | 'related';
export type CanvasReportSectionKind = 'overview' | 'notes' | 'blocks' | 'links' | 'activity';

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

export interface CanvasBlockLink {
  id: string;
  fromBlockId: string;
  toBlockId: string;
  kind: CanvasBlockLinkKind;
  label?: string;
  createdAt: string;
}

export interface CanvasWorkspaceChatDefaults {
  workspaceInstructions?: string;
  contextFilePaths?: string[];
}

export interface CanvasWorkspaceExportSettings {
  title?: string;
  includeActivity?: boolean;
  includeLinks?: boolean;
  includeBlockSummaries?: boolean;
  sections?: CanvasReportSectionKind[];
}

export interface CanvasWorkspace {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  workingDirectory?: string;
  archived?: boolean;
  templateId?: string;
  blocks: CanvasBlock[];
  links?: CanvasBlockLink[];
  viewport: CanvasViewport;
  nextZIndex: number;
  chatDefaults?: CanvasWorkspaceChatDefaults;
  exportSettings?: CanvasWorkspaceExportSettings;
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

export interface CanvasTemplateLinkDefinition {
  id: string;
  fromBlockId: string;
  toBlockId: string;
  kind: CanvasBlockLinkKind;
  label?: string;
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
  links?: CanvasTemplateLinkDefinition[];
  chatDefaults?: CanvasWorkspaceChatDefaults;
  exportSettings?: CanvasWorkspaceExportSettings;
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
    | 'selection-sent-to-chat'
    | 'evidence-captured'
    | 'blocks-linked'
    | 'report-exported'
    | 'checkpoint-saved'
    | 'chat-sent'
    | 'agent-update'
    | 'agent-error';
  title: string;
  message?: string;
  windowId?: string;
  blockId?: string;
  blockIds?: string[];
  templateId?: string;
  paneId?: string;
}

export interface CanvasBlockSummaryMetric {
  label: string;
  value: string;
}

export interface CanvasBlockSummary {
  title: string;
  subtitle?: string;
  body?: string;
  bullets?: string[];
  metrics?: CanvasBlockSummaryMetric[];
  tags?: string[];
}

export interface CanvasExportedReport {
  title: string;
  generatedAt: string;
  workspaceId: string;
  workspaceName: string;
  markdown: string;
}
