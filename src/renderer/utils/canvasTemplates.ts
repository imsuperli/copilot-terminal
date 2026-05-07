import { v4 as uuidv4 } from 'uuid';
import type {
  CanvasTemplateLinkDefinition,
  CanvasTemplateBlockDefinition,
  CanvasWorkspace,
  CanvasWorkspaceTemplate,
} from '../../shared/types/canvas';
import type { Window } from '../types/window';
import {
  createCanvasWindowBlock,
  DEFAULT_CANVAS_INSERT_ORIGIN,
  DEFAULT_CANVAS_INSERT_SEARCH_PADDING,
  DEFAULT_CANVAS_INSERT_STEP,
  DEFAULT_BROWSER_WINDOW_BLOCK_SIZE,
  DEFAULT_CHAT_WINDOW_BLOCK_SIZE,
  DEFAULT_CODE_WINDOW_BLOCK_SIZE,
  DEFAULT_NOTE_BLOCK_SIZE,
  DEFAULT_WINDOW_BLOCK_SIZE,
  doCanvasRectsIntersect,
  getCanvasBounds,
} from './canvasWorkspace';
import { createCanvasTemplateWindowFromDefinition, inferCanvasWindowDraftKind } from './canvasWindowFactory';
import type { SSHProfile } from '../../shared/types/ssh';

function nowIso(): string {
  return new Date().toISOString();
}

const SYSTEM_TEMPLATE_TIMESTAMP = '2026-05-07T00:00:00.000Z';

function createTemplateBlock(
  kind: CanvasTemplateBlockDefinition['kind'],
  x: number,
  y: number,
  overrides: Partial<CanvasTemplateBlockDefinition> = {},
): CanvasTemplateBlockDefinition {
  const defaultSize = kind === 'note'
    ? DEFAULT_NOTE_BLOCK_SIZE
    : kind === 'chat'
      ? DEFAULT_CHAT_WINDOW_BLOCK_SIZE
      : kind === 'browser'
        ? DEFAULT_BROWSER_WINDOW_BLOCK_SIZE
        : kind === 'code'
          ? DEFAULT_CODE_WINDOW_BLOCK_SIZE
          : DEFAULT_WINDOW_BLOCK_SIZE;
  return {
    id: overrides.id ?? uuidv4(),
    kind,
    x,
    y,
    width: overrides.width ?? defaultSize.width,
    height: overrides.height ?? defaultSize.height,
    ...overrides,
  };
}

function getTemplateBlockBounds(blocks: Array<Pick<CanvasTemplateBlockDefinition, 'x' | 'y' | 'width' | 'height'>>): {
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
      maxX: 0,
      maxY: 0,
      width: 0,
      height: 0,
    };
  }

  const minX = Math.min(...blocks.map((block) => block.x));
  const minY = Math.min(...blocks.map((block) => block.y));
  const maxX = Math.max(...blocks.map((block) => block.x + block.width));
  const maxY = Math.max(...blocks.map((block) => block.y + block.height));

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function normalizeSystemTemplate(template: CanvasWorkspaceTemplate): CanvasWorkspaceTemplate {
  if (!template.system) {
    return template;
  }

  const defaultTemplate = createDefaultCanvasTemplates().find((item) => item.id === template.id);
  if (!defaultTemplate) {
    return template;
  }

  return {
    ...defaultTemplate,
    createdAt: template.createdAt || defaultTemplate.createdAt,
    updatedAt: template.updatedAt || defaultTemplate.updatedAt,
  };
}

export function reconcileCanvasWorkspaceTemplates(
  templates: CanvasWorkspaceTemplate[],
): CanvasWorkspaceTemplate[] {
  const systemTemplates = createDefaultCanvasTemplates();
  const customTemplates = templates.filter((template) => !template.system);
  const existingTemplates = new Map(templates.map((template) => [template.id, template] as const));
  const reconciledSystemTemplates = systemTemplates.map((template) => {
    const existing = existingTemplates.get(template.id);
    return existing ? normalizeSystemTemplate(existing) : template;
  });

  return [...reconciledSystemTemplates, ...customTemplates];
}

export function findCanvasTemplateInsertOffset(
  existingBlocks: CanvasWorkspace['blocks'],
  incomingBlocks: CanvasWorkspace['blocks'],
): { x: number; y: number } {
  if (incomingBlocks.length === 0) {
    return { x: 0, y: 0 };
  }

  const incomingBounds = getTemplateBlockBounds(incomingBlocks);
  const origin = DEFAULT_CANVAS_INSERT_ORIGIN;
  const step = DEFAULT_CANVAS_INSERT_STEP;
  const searchPadding = DEFAULT_CANVAS_INSERT_SEARCH_PADDING;
  const maxAttempts = 240;

  let candidateX = origin.x;
  let candidateY = origin.y;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const offset = {
      x: candidateX - incomingBounds.minX,
      y: candidateY - incomingBounds.minY,
    };

    const intersects = incomingBlocks.some((block) => {
      const shiftedRect = {
        x: block.x + offset.x - searchPadding,
        y: block.y + offset.y - searchPadding,
        width: block.width + searchPadding * 2,
        height: block.height + searchPadding * 2,
      };

      return existingBlocks.some((existingBlock) => doCanvasRectsIntersect(shiftedRect, existingBlock));
    });

    if (!intersects) {
      return offset;
    }

    candidateX += step.x;
    candidateY += step.y;

    if ((attempt + 1) % 8 === 0) {
      candidateX = origin.x;
      candidateY += incomingBounds.height + 40;
    }
  }

  const existingBounds = getCanvasBounds(existingBlocks, 0);
  return {
    x: origin.x - incomingBounds.minX,
    y: Math.max(origin.y, existingBounds.maxY + 40) - incomingBounds.minY,
  };
}

export function createDefaultCanvasTemplates(): CanvasWorkspaceTemplate[] {
  const createdAt = SYSTEM_TEMPLATE_TIMESTAMP;

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
        { id: 'troubleshooting-link-inspect', fromBlockId: 'repro-terminal', toBlockId: 'diagnosis-chat', kind: 'evidence', label: 'inspect' },
        { id: 'troubleshooting-link-reference', fromBlockId: 'docs-browser', toBlockId: 'diagnosis-chat', kind: 'context', label: 'reference' },
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
        { id: 'coding-link-design', fromBlockId: 'code-workspace', toBlockId: 'implementation-chat', kind: 'context', label: 'design' },
        { id: 'coding-link-runtime', fromBlockId: 'dev-terminal', toBlockId: 'implementation-chat', kind: 'evidence', label: 'runtime' },
        { id: 'coding-link-ui-result', fromBlockId: 'preview-browser', toBlockId: 'implementation-chat', kind: 'evidence', label: 'ui result' },
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
        { id: 'review-link-diff', fromBlockId: 'repo-review', toBlockId: 'review-chat', kind: 'context', label: 'diff' },
        { id: 'review-link-discussion', fromBlockId: 'pr-browser', toBlockId: 'review-chat', kind: 'context', label: 'discussion' },
        { id: 'review-link-summarize', fromBlockId: 'review-chat', toBlockId: 'findings-note', kind: 'depends-on', label: 'summarize' },
      ],
    },
  ];
}

export function createTemplateFromWorkspace(
  workspace: CanvasWorkspace,
  windowsById: Map<string, Window>,
): CanvasWorkspaceTemplate {
  const now = nowIso();
  const templateBlockIds = new Map<string, string>();

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
      const templateBlockId = uuidv4();
      templateBlockIds.set(block.id, templateBlockId);

      if (block.type === 'note') {
        return {
          id: templateBlockId,
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
        id: templateBlockId,
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
      fromBlockId: templateBlockIds.get(link.fromBlockId) ?? link.fromBlockId,
      toBlockId: templateBlockIds.get(link.toBlockId) ?? link.toBlockId,
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

export function mergeCanvasWorkspaceContents(
  current: Pick<CanvasWorkspace, 'blocks' | 'links' | 'nextZIndex'>,
  incoming: Pick<CanvasWorkspace, 'blocks' | 'links' | 'nextZIndex'>,
  offset: { x: number; y: number },
): Pick<CanvasWorkspace, 'blocks' | 'links' | 'nextZIndex'> {
  const shiftedBlocks = incoming.blocks.map((block) => ({
    ...block,
    x: block.x + offset.x,
    y: block.y + offset.y,
    zIndex: block.zIndex + current.nextZIndex - 1,
  }));

  const shiftedLinks = (incoming.links ?? []).map((link) => ({ ...link }));

  return {
    blocks: [...current.blocks, ...shiftedBlocks],
    links: [...(current.links ?? []), ...shiftedLinks],
    nextZIndex: current.nextZIndex + Math.max(incoming.nextZIndex - 1, shiftedBlocks.length),
  };
}
