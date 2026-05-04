import { v4 as uuidv4 } from 'uuid';
import type {
  CanvasTemplateLinkDefinition,
  CanvasTemplateBlockDefinition,
  CanvasWorkspace,
  CanvasWorkspaceTemplate,
} from '../../shared/types/canvas';
import type { Window } from '../types/window';
import { createCanvasWindowBlock, DEFAULT_NOTE_BLOCK_SIZE, DEFAULT_WINDOW_BLOCK_SIZE } from './canvasWorkspace';
import { createCanvasTemplateWindowFromDefinition, inferCanvasWindowDraftKind } from './canvasWindowFactory';
import type { SSHProfile } from '../../shared/types/ssh';

function nowIso(): string {
  return new Date().toISOString();
}

function createTemplateBlock(
  kind: CanvasTemplateBlockDefinition['kind'],
  x: number,
  y: number,
  overrides: Partial<CanvasTemplateBlockDefinition> = {},
): CanvasTemplateBlockDefinition {
  return {
    id: overrides.id ?? uuidv4(),
    kind,
    x,
    y,
    width: overrides.width ?? (kind === 'note' ? DEFAULT_NOTE_BLOCK_SIZE.width : DEFAULT_WINDOW_BLOCK_SIZE.width),
    height: overrides.height ?? (kind === 'note' ? DEFAULT_NOTE_BLOCK_SIZE.height : DEFAULT_WINDOW_BLOCK_SIZE.height),
    ...overrides,
  };
}

export function createDefaultCanvasTemplates(): CanvasWorkspaceTemplate[] {
  const createdAt = nowIso();

  return [
    {
      id: 'canvas-template-troubleshooting',
      name: 'Troubleshooting',
      description: 'A focused troubleshooting board with terminal, chat, browser, and notes.',
      createdAt,
      updatedAt: createdAt,
      system: true,
      chatDefaults: {
        workspaceInstructions: 'Use the selected evidence to explain likely root causes, affected scope, and the next lowest-risk diagnostic step.',
        contextFilePaths: [],
      },
      exportSettings: {
        includeActivity: true,
        includeLinks: true,
        includeBlockSummaries: true,
        sections: ['overview', 'notes', 'blocks', 'links', 'activity'],
      },
      blocks: [
        createTemplateBlock('local', 60, 80, { id: 'repro-terminal', label: 'Repro terminal', workingDirectory: '' }),
        createTemplateBlock('chat', 480, 80, { id: 'diagnosis-chat', label: 'Diagnosis chat' }),
        createTemplateBlock('browser', 900, 80, { id: 'docs-browser', label: 'Docs / dashboards', url: 'https://duckduckgo.com/' }),
        createTemplateBlock('note', 60, 360, { id: 'runbook-note', label: 'Runbook', noteContent: '- Hypothesis\n- Evidence\n- Next step' }),
      ],
      links: [
        { id: uuidv4(), fromBlockId: 'repro-terminal', toBlockId: 'diagnosis-chat', kind: 'evidence', label: 'inspect' },
        { id: uuidv4(), fromBlockId: 'docs-browser', toBlockId: 'diagnosis-chat', kind: 'context', label: 'reference' },
      ],
    },
    {
      id: 'canvas-template-coding',
      name: 'Coding',
      description: 'A mixed workspace for editing, running, browsing, and coordinating in one board.',
      createdAt,
      updatedAt: createdAt,
      system: true,
      chatDefaults: {
        workspaceInstructions: 'Focus on concrete implementation steps, likely side effects, and verification strategy for the linked code and terminals.',
        contextFilePaths: [],
      },
      exportSettings: {
        includeActivity: true,
        includeLinks: true,
        includeBlockSummaries: true,
        sections: ['overview', 'blocks', 'links', 'activity'],
      },
      blocks: [
        createTemplateBlock('code', 60, 80, { id: 'code-workspace', label: 'Code workspace', workingDirectory: '' }),
        createTemplateBlock('local', 520, 80, { id: 'dev-terminal', label: 'Dev terminal', workingDirectory: '' }),
        createTemplateBlock('browser', 940, 80, { id: 'preview-browser', label: 'Preview', url: 'http://localhost:3000' }),
        createTemplateBlock('chat', 940, 360, { id: 'implementation-chat', label: 'Implementation chat' }),
      ],
      links: [
        { id: uuidv4(), fromBlockId: 'code-workspace', toBlockId: 'implementation-chat', kind: 'context', label: 'design' },
        { id: uuidv4(), fromBlockId: 'dev-terminal', toBlockId: 'implementation-chat', kind: 'evidence', label: 'runtime' },
        { id: uuidv4(), fromBlockId: 'preview-browser', toBlockId: 'implementation-chat', kind: 'evidence', label: 'ui result' },
      ],
    },
    {
      id: 'canvas-template-review',
      name: 'Review',
      description: 'A review surface for diffing, evidence gathering, and written conclusions.',
      createdAt,
      updatedAt: createdAt,
      system: true,
      chatDefaults: {
        workspaceInstructions: 'Prioritize findings, impact, regressions, and missing tests. Keep opinions secondary to evidence.',
        contextFilePaths: [],
      },
      exportSettings: {
        includeActivity: true,
        includeLinks: true,
        includeBlockSummaries: true,
        sections: ['overview', 'notes', 'blocks', 'links', 'activity'],
      },
      blocks: [
        createTemplateBlock('code', 60, 80, { id: 'repo-review', label: 'Repo review', workingDirectory: '' }),
        createTemplateBlock('chat', 560, 80, { id: 'review-chat', label: 'Review notes' }),
        createTemplateBlock('note', 980, 80, { id: 'findings-note', label: 'Findings', noteContent: '- Severity\n- Impact\n- Fix' }),
        createTemplateBlock('browser', 560, 360, { id: 'pr-browser', label: 'PR / issue', url: 'https://github.com/' }),
      ],
      links: [
        { id: uuidv4(), fromBlockId: 'repo-review', toBlockId: 'review-chat', kind: 'context', label: 'diff' },
        { id: uuidv4(), fromBlockId: 'pr-browser', toBlockId: 'review-chat', kind: 'context', label: 'discussion' },
        { id: uuidv4(), fromBlockId: 'review-chat', toBlockId: 'findings-note', kind: 'depends-on', label: 'summarize' },
      ],
    },
  ];
}

export function createTemplateFromWorkspace(
  workspace: CanvasWorkspace,
  windowsById: Map<string, Window>,
): CanvasWorkspaceTemplate {
  const now = nowIso();

  return {
    id: uuidv4(),
    name: `${workspace.name} template`,
    description: workspace.workingDirectory ? `Derived from ${workspace.workingDirectory}` : undefined,
    createdAt: now,
    updatedAt: now,
    workingDirectory: workspace.workingDirectory,
    chatDefaults: workspace.chatDefaults,
    exportSettings: workspace.exportSettings,
    blocks: workspace.blocks.map((block) => {
      if (block.type === 'note') {
        return {
          id: uuidv4(),
          kind: 'note',
          x: block.x,
          y: block.y,
          width: block.width,
          height: block.height,
          label: block.label,
          noteContent: block.content,
        };
      }

      const windowItem = windowsById.get(block.windowId);
      const kind = windowItem ? inferCanvasWindowDraftKind(windowItem) : 'local';
      const pane = windowItem?.layout.type === 'pane' ? windowItem.layout.pane : undefined;

      return {
        id: uuidv4(),
        kind,
        x: block.x,
        y: block.y,
        width: block.width,
        height: block.height,
        label: block.label ?? windowItem?.name,
        displayMode: block.displayMode,
        workingDirectory: pane?.kind === 'browser'
          ? undefined
          : pane?.kind === 'chat'
            ? undefined
            : pane?.kind === 'code'
              ? pane.code?.rootPath
              : pane?.cwd,
        url: pane?.browser?.url,
        linkedPaneId: pane?.chat?.linkedPaneId,
        command: pane?.kind ? undefined : pane?.command,
      };
    }),
    links: (workspace.links ?? []).map((link) => ({
      id: uuidv4(),
      fromBlockId: link.fromBlockId,
      toBlockId: link.toBlockId,
      kind: link.kind,
      label: link.label,
    }) satisfies CanvasTemplateLinkDefinition),
  };
}

export function instantiateCanvasWorkspaceFromTemplate(
  template: CanvasWorkspaceTemplate,
  options?: {
    name?: string;
    workingDirectory?: string;
    sshProfiles?: SSHProfile[];
  },
): {
  workspace: CanvasWorkspace;
  windows: Window[];
} {
  const createdAt = nowIso();
  const windows: Window[] = [];
  const blocks: CanvasWorkspace['blocks'] = [];
  const links: NonNullable<CanvasWorkspace['links']> = [];
  let nextZIndex = 1;
  const instantiatedBlockIds = new Map<string, string>();

  for (const definition of template.blocks) {
    if (definition.kind === 'note') {
      const blockId = uuidv4();
      blocks.push({
        id: blockId,
        type: 'note',
        x: definition.x,
        y: definition.y,
        width: definition.width,
        height: definition.height,
        zIndex: nextZIndex,
        label: definition.label,
        content: definition.noteContent ?? '',
      });
      instantiatedBlockIds.set(definition.id, blockId);
      nextZIndex += 1;
      continue;
    }

    const createdWindow = createCanvasTemplateWindowFromDefinition({
      ...definition,
      workingDirectory: definition.workingDirectory || options?.workingDirectory || template.workingDirectory,
    }, {
      sshProfiles: options?.sshProfiles,
    });

    if (!createdWindow) {
      continue;
    }

    windows.push(createdWindow);
    const windowBlock = createCanvasWindowBlock(createdWindow, blocks.length, nextZIndex);
    windowBlock.x = definition.x;
    windowBlock.y = definition.y;
    windowBlock.width = definition.width;
    windowBlock.height = definition.height;
    windowBlock.label = definition.label ?? createdWindow.name;
    windowBlock.displayMode = definition.displayMode ?? 'summary';
    blocks.push(windowBlock);
    instantiatedBlockIds.set(definition.id, windowBlock.id);
    nextZIndex += 1;
  }

  for (const link of template.links ?? []) {
    const fromBlockId = instantiatedBlockIds.get(link.fromBlockId);
    const toBlockId = instantiatedBlockIds.get(link.toBlockId);
    if (!fromBlockId || !toBlockId) {
      continue;
    }

    links.push({
      id: uuidv4(),
      fromBlockId,
      toBlockId,
      kind: link.kind,
      label: link.label,
      createdAt,
    });
  }

  return {
    workspace: {
      id: uuidv4(),
      name: options?.name?.trim() || template.name,
      createdAt,
      updatedAt: createdAt,
      workingDirectory: options?.workingDirectory || template.workingDirectory,
      templateId: template.id,
      blocks,
      links,
      viewport: {
        tx: 0,
        ty: 0,
        zoom: 1,
      },
      nextZIndex,
      chatDefaults: template.chatDefaults,
      exportSettings: template.exportSettings,
    },
    windows,
  };
}
