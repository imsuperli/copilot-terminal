import { v4 as uuidv4 } from 'uuid';
import type {
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
      blocks: [
        createTemplateBlock('local', 60, 80, { label: 'Repro terminal', workingDirectory: '' }),
        createTemplateBlock('chat', 480, 80, { label: 'Diagnosis chat' }),
        createTemplateBlock('browser', 900, 80, { label: 'Docs / dashboards', url: 'https://duckduckgo.com/' }),
        createTemplateBlock('note', 60, 360, { label: 'Runbook', noteContent: '- Hypothesis\n- Evidence\n- Next step' }),
      ],
    },
    {
      id: 'canvas-template-coding',
      name: 'Coding',
      description: 'A mixed workspace for editing, running, browsing, and coordinating in one board.',
      createdAt,
      updatedAt: createdAt,
      system: true,
      blocks: [
        createTemplateBlock('code', 60, 80, { label: 'Code workspace', workingDirectory: '' }),
        createTemplateBlock('local', 520, 80, { label: 'Dev terminal', workingDirectory: '' }),
        createTemplateBlock('browser', 940, 80, { label: 'Preview', url: 'http://localhost:3000' }),
        createTemplateBlock('chat', 940, 360, { label: 'Implementation chat' }),
      ],
    },
    {
      id: 'canvas-template-review',
      name: 'Review',
      description: 'A review surface for diffing, evidence gathering, and written conclusions.',
      createdAt,
      updatedAt: createdAt,
      system: true,
      blocks: [
        createTemplateBlock('code', 60, 80, { label: 'Repo review', workingDirectory: '' }),
        createTemplateBlock('chat', 560, 80, { label: 'Review notes' }),
        createTemplateBlock('note', 980, 80, { label: 'Findings', noteContent: '- Severity\n- Impact\n- Fix' }),
        createTemplateBlock('browser', 560, 360, { label: 'PR / issue', url: 'https://github.com/' }),
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
  let nextZIndex = 1;

  for (const definition of template.blocks) {
    if (definition.kind === 'note') {
      blocks.push({
        id: uuidv4(),
        type: 'note',
        x: definition.x,
        y: definition.y,
        width: definition.width,
        height: definition.height,
        zIndex: nextZIndex,
        label: definition.label,
        content: definition.noteContent ?? '',
      });
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
    nextZIndex += 1;
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
      viewport: {
        tx: 0,
        ty: 0,
        zoom: 1,
      },
      nextZIndex,
    },
    windows,
  };
}
