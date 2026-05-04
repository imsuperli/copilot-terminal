import type { CanvasWorkspace } from '../../shared/types/canvas';
import type { ChatContextFragment, ChatSettings } from '../../shared/types/chat';

function getPathLabel(filePath: string): string {
  const segments = filePath.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] ?? filePath;
}

export function normalizeChatSettings(settings: ChatSettings | undefined): ChatSettings {
  return {
    providers: settings?.providers ?? [],
    activeProviderId: settings?.activeProviderId,
    defaultSystemPrompt: settings?.defaultSystemPrompt ?? '',
    workspaceInstructions: settings?.workspaceInstructions ?? '',
    contextFilePaths: settings?.contextFilePaths ?? [],
    enableCommandSecurity: settings?.enableCommandSecurity ?? true,
  };
}

export function extractFileMentions(text: string): string[] {
  const matches = text.match(/(^|\s)@([^\s]+)/g) ?? [];
  return Array.from(new Set(
    matches
      .map((match) => match.trim().slice(1))
      .filter((value) => value.startsWith('/')),
  ));
}

export function mergeChatSettingsWithCanvasDefaults(
  settings: ChatSettings,
  canvasWorkspace?: CanvasWorkspace | null,
): ChatSettings {
  return {
    ...settings,
    workspaceInstructions: [
      settings.workspaceInstructions?.trim(),
      canvasWorkspace?.chatDefaults?.workspaceInstructions?.trim(),
    ].filter(Boolean).join('\n\n'),
    contextFilePaths: Array.from(new Set([
      ...(settings.contextFilePaths ?? []),
      ...(canvasWorkspace?.chatDefaults?.contextFilePaths ?? []),
    ].map((value) => value.trim()).filter(Boolean))),
  };
}

export function buildChatSystemPrompt(settings: ChatSettings): string {
  return [
    settings.defaultSystemPrompt?.trim(),
    settings.workspaceInstructions?.trim(),
  ].filter(Boolean).join('\n\n');
}

export async function resolveChatContextFragments(
  settings: ChatSettings,
  messageText: string,
): Promise<ChatContextFragment[]> {
  const configuredPaths = settings.contextFilePaths ?? [];
  const paths = Array.from(new Set([
    ...configuredPaths,
    ...extractFileMentions(messageText),
  ].map((value) => value.trim()).filter(Boolean)));

  const fragments: ChatContextFragment[] = [];
  for (const filePath of paths) {
    try {
      const response = await window.electronAPI.codePaneReadFile({
        rootPath: filePath,
        filePath,
      });
      if (!response.success || !response.data) {
        continue;
      }

      fragments.push({
        type: 'file',
        path: filePath,
        label: getPathLabel(filePath),
        content: response.data.content,
      });
    } catch {
      // Ignore invalid or inaccessible context files; the user can still send the message.
    }
  }

  return fragments;
}
