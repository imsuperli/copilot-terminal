import type {
  CanvasBlock,
  CanvasBlockLink,
  CanvasBlockSummary,
  CanvasExportedReport,
  CanvasWorkspace,
} from '../../shared/types/canvas';
import type { ChatContextFragment } from '../../shared/types/chat';
import type { Pane, Window } from '../types/window';
import type { TranslationKey, TranslationParams } from '../i18n';
import { getWindowKind } from '../../shared/utils/terminalCapabilities';
import { getAllPanes, getAggregatedStatus } from './layoutHelpers';
import { getStatusLabelKey } from './statusHelpers';
import { getCurrentWindowWorkingDirectory } from './windowWorkingDirectory';

type Translate = (key: TranslationKey, params?: TranslationParams) => string;

interface BuildCanvasInsightsOptions {
  workspace: CanvasWorkspace;
  windowsById: Map<string, Window>;
  t: Translate;
  activityItems?: Array<{
    timestamp: string;
    title: string;
    message?: string;
  }>;
}

interface SelectedCanvasContextOptions extends BuildCanvasInsightsOptions {
  selectedBlockIds: string[];
}

function getBlockTitle(
  block: CanvasBlock,
  windowsById: Map<string, Window>,
  t: Translate,
): string {
  if (block.type === 'note') {
    return block.label?.trim() || t('canvas.noteUntitled');
  }

  return block.label?.trim() || windowsById.get(block.windowId)?.name || t('canvas.missingWindow');
}

function truncateText(value: string, maxLength: number): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function formatPaneLabel(pane: Pane): string {
  if (pane.kind === 'chat') {
    return 'Chat';
  }
  if (pane.kind === 'browser') {
    return 'Browser';
  }
  if (pane.kind === 'code') {
    return 'Code';
  }
  return pane.backend === 'ssh' ? 'SSH' : 'Terminal';
}

function getWindowSummary(
  block: Extract<CanvasBlock, { type: 'window' }>,
  windowItem: Window | undefined,
  t: Translate,
): CanvasBlockSummary {
  if (!windowItem) {
    return {
      title: block.label?.trim() || t('canvas.missingWindow'),
      subtitle: t('canvas.windowMissingHint'),
      tags: ['missing'],
    };
  }

  const panes = getAllPanes(windowItem.layout);
  const activePane = panes.find((pane) => pane.id === windowItem.activePaneId) ?? panes[0];
  const workingDirectory = getCurrentWindowWorkingDirectory(windowItem);
  const statusKey = getStatusLabelKey(getAggregatedStatus(windowItem.layout));
  const outputPreview = truncateText(activePane?.lastOutput ?? '', 280);
  const kind = getWindowKind(windowItem);

  const metrics = [
    { label: 'Kind', value: kind },
    { label: 'Status', value: t(statusKey) },
    { label: 'Panes', value: String(panes.length) },
  ];

  if (activePane?.kind === 'browser' && activePane.browser?.url) {
    metrics.push({ label: 'URL', value: truncateText(activePane.browser.url, 56) });
  } else if (activePane?.kind === 'code' && activePane.code?.rootPath) {
    metrics.push({ label: 'Root', value: truncateText(activePane.code.rootPath, 56) });
  } else if (workingDirectory) {
    metrics.push({ label: 'Dir', value: truncateText(workingDirectory, 56) });
  }

  const bullets: string[] = [];
  if (activePane) {
    bullets.push(`Active pane: ${formatPaneLabel(activePane)}`);
  }

  if (activePane?.kind === 'chat') {
    const messageCount = activePane.chat?.messages?.length ?? 0;
    bullets.push(`Messages: ${messageCount}`);
    const lastAssistant = [...(activePane.chat?.messages ?? [])].reverse().find((message) => message.role === 'assistant');
    if (lastAssistant?.content) {
      bullets.push(`Last assistant reply: ${truncateText(lastAssistant.content, 180)}`);
    }
  }

  if (activePane?.kind === 'code') {
    const codeState = activePane.code;
    bullets.push(`Open files: ${codeState?.openFiles?.length ?? 0}`);
    if (codeState?.activeFilePath) {
      bullets.push(`Active file: ${truncateText(codeState.activeFilePath, 120)}`);
    }
    if (codeState?.bookmarks?.length) {
      bullets.push(`Bookmarks: ${codeState.bookmarks.length}`);
    }
    if (codeState?.breakpoints?.length) {
      bullets.push(`Breakpoints: ${codeState.breakpoints.length}`);
    }
  }

  if (activePane?.kind === 'browser' && activePane.browser?.url) {
    bullets.push(`Page: ${truncateText(activePane.browser.url, 160)}`);
  }

  if (outputPreview) {
    bullets.push(`Recent output: ${outputPreview}`);
  }

  return {
    title: windowItem.name,
    subtitle: workingDirectory || undefined,
    body: outputPreview || undefined,
    bullets,
    metrics,
    tags: [kind, activePane ? formatPaneLabel(activePane).toLowerCase() : 'window'],
  };
}

function getNoteSummary(
  block: Extract<CanvasBlock, { type: 'note' }>,
  t: Translate,
): CanvasBlockSummary {
  const content = block.content.trim();
  const lines = content ? content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) : [];
  return {
    title: block.label?.trim() || t('canvas.noteUntitled'),
    subtitle: lines.length > 0 ? `${lines.length} lines` : undefined,
    body: truncateText(content, 220) || undefined,
    bullets: lines.slice(0, 4),
    metrics: [
      { label: 'Lines', value: String(lines.length) },
      { label: 'Chars', value: String(content.length) },
    ],
    tags: ['note'],
  };
}

export function buildCanvasBlockSummary(
  block: CanvasBlock,
  windowsById: Map<string, Window>,
  t: Translate,
): CanvasBlockSummary {
  if (block.type === 'note') {
    return getNoteSummary(block, t);
  }

  return getWindowSummary(block, windowsById.get(block.windowId), t);
}

export function serializeCanvasBlockEvidence(
  block: CanvasBlock,
  windowsById: Map<string, Window>,
  t: Translate,
): string {
  const title = getBlockTitle(block, windowsById, t);

  if (block.type === 'note') {
    return [
      `## ${title}`,
      '',
      block.content.trim() || '(empty note)',
    ].join('\n');
  }

  const windowItem = windowsById.get(block.windowId);
  if (!windowItem) {
    return [
      `## ${title}`,
      '',
      t('canvas.windowMissingHint'),
    ].join('\n');
  }

  const panes = getAllPanes(windowItem.layout);
  const activePane = panes.find((pane) => pane.id === windowItem.activePaneId) ?? panes[0];
  const workingDirectory = getCurrentWindowWorkingDirectory(windowItem);
  const status = t(getStatusLabelKey(getAggregatedStatus(windowItem.layout)));
  const lines = [
    `## ${title}`,
    '',
    `- Kind: ${getWindowKind(windowItem)}`,
    `- Status: ${status}`,
    `- Working directory: ${workingDirectory || 'N/A'}`,
    `- Pane count: ${panes.length}`,
  ];

  if (activePane?.kind === 'browser' && activePane.browser?.url) {
    lines.push(`- URL: ${activePane.browser.url}`);
  }

  if (activePane?.kind === 'code') {
    lines.push(`- Root path: ${activePane.code?.rootPath || workingDirectory || 'N/A'}`);
    if (activePane.code?.activeFilePath) {
      lines.push(`- Active file: ${activePane.code.activeFilePath}`);
    }
  }

  if (activePane?.kind === 'chat') {
    lines.push(`- Chat messages: ${activePane.chat?.messages?.length ?? 0}`);
  }

  const outputPreview = truncateText(activePane?.lastOutput ?? '', 1200);
  if (outputPreview) {
    lines.push('', 'Recent output:', '```text', outputPreview, '```');
  }

  return lines.join('\n');
}

export function buildSelectedCanvasContext({
  workspace,
  windowsById,
  selectedBlockIds,
  t,
}: SelectedCanvasContextOptions): {
  selectedBlocks: CanvasBlock[];
  contextText: string;
  fragments: ChatContextFragment[];
} {
  const selectedSet = new Set(selectedBlockIds);
  const selectedBlocks = workspace.blocks.filter((block) => selectedSet.has(block.id));
  const contextText = selectedBlocks
    .map((block) => serializeCanvasBlockEvidence(block, windowsById, t))
    .join('\n\n');
  const fragments = contextText ? [{
    type: 'file' as const,
    label: `${workspace.name} canvas selection`,
    path: `canvas://${workspace.id}/selection`,
    content: contextText,
  }] : [];

  return {
    selectedBlocks,
    contextText,
    fragments,
  };
}

function describeLink(
  link: CanvasBlockLink,
  blockMap: Map<string, CanvasBlock>,
  windowsById: Map<string, Window>,
  t: Translate,
): string {
  const fromBlock = blockMap.get(link.fromBlockId);
  const toBlock = blockMap.get(link.toBlockId);
  const fromTitle = fromBlock ? getBlockTitle(fromBlock, windowsById, t) : link.fromBlockId;
  const toTitle = toBlock ? getBlockTitle(toBlock, windowsById, t) : link.toBlockId;
  const label = link.label?.trim();
  return label
    ? `${fromTitle} -> ${toTitle} (${link.kind}: ${label})`
    : `${fromTitle} -> ${toTitle} (${link.kind})`;
}

export function exportCanvasWorkspaceReport({
  workspace,
  windowsById,
  t,
  activityItems = [],
}: BuildCanvasInsightsOptions): CanvasExportedReport {
  const blockMap = new Map(workspace.blocks.map((block) => [block.id, block] as const));
  const generatedAt = new Date().toISOString();
  const title = workspace.exportSettings?.title?.trim() || `${workspace.name} report`;
  const sections = workspace.exportSettings?.sections ?? ['overview', 'notes', 'blocks', 'links', 'activity'];
  const includeLinks = workspace.exportSettings?.includeLinks ?? true;
  const includeActivity = workspace.exportSettings?.includeActivity ?? true;
  const includeBlockSummaries = workspace.exportSettings?.includeBlockSummaries ?? true;

  const lines: string[] = [`# ${title}`];

  if (sections.includes('overview')) {
    lines.push(
      '',
      `- Workspace: ${workspace.name}`,
      `- Generated at: ${generatedAt}`,
      `- Blocks: ${workspace.blocks.length}`,
    );

    if (workspace.workingDirectory) {
      lines.push(`- Default directory: ${workspace.workingDirectory}`);
    }

    if (workspace.chatDefaults?.workspaceInstructions?.trim()) {
      lines.push(`- Workspace instructions: ${workspace.chatDefaults.workspaceInstructions.trim()}`);
    }
  }

  if (sections.includes('notes')) {
    const notes = workspace.blocks.filter((block): block is Extract<CanvasBlock, { type: 'note' }> => block.type === 'note');
    lines.push('', '## Notes');
    if (notes.length === 0) {
      lines.push('', '_No notes_');
    } else {
      for (const note of notes) {
        lines.push('', serializeCanvasBlockEvidence(note, windowsById, t));
      }
    }
  }

  if (sections.includes('blocks')) {
    lines.push('', '## Blocks');
    for (const block of workspace.blocks) {
      const summary = buildCanvasBlockSummary(block, windowsById, t);
      lines.push('', `### ${summary.title}`);
      if (summary.subtitle) {
        lines.push(summary.subtitle);
      }
      if (summary.body) {
        lines.push('', summary.body);
      }
      if (includeBlockSummaries && summary.bullets?.length) {
        lines.push('', ...summary.bullets.map((bullet) => `- ${bullet}`));
      }
      if (includeBlockSummaries && summary.metrics?.length) {
        lines.push('', ...summary.metrics.map((metric) => `- ${metric.label}: ${metric.value}`));
      }
    }
  }

  if (includeLinks && sections.includes('links')) {
    lines.push('', '## Links');
    if (!workspace.links?.length) {
      lines.push('', '_No explicit links_');
    } else {
      lines.push('', ...workspace.links.map((link) => `- ${describeLink(link, blockMap, windowsById, t)}`));
    }
  }

  if (includeActivity && sections.includes('activity')) {
    lines.push('', '## Activity');
    if (activityItems.length === 0) {
      lines.push('', '_No activity captured_');
    } else {
      for (const item of activityItems) {
        lines.push('', `- ${item.timestamp} | ${item.title}${item.message ? ` | ${item.message}` : ''}`);
      }
    }
  }

  return {
    title,
    generatedAt,
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    markdown: lines.join('\n'),
  };
}
