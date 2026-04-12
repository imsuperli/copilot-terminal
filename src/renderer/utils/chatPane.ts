import type { ChatMessage } from '../../shared/types/chat';
import type { Pane } from '../types/window';
import { WindowStatus } from '../types/window';
import { getPaneBackend, isTerminalPane } from '../../shared/utils/terminalCapabilities';

interface CreateChatPaneDraftOptions {
  linkedPaneId?: string;
  activeProviderId?: string;
  activeModel?: string;
  messages?: ChatMessage[];
}

export function createChatPaneDraft(
  paneId: string,
  options?: CreateChatPaneDraftOptions,
): Pane {
  return {
    id: paneId,
    kind: 'chat',
    cwd: '',
    command: '',
    status: WindowStatus.Paused,
    pid: null,
    chat: {
      messages: options?.messages ?? [],
      linkedPaneId: options?.linkedPaneId,
      activeProviderId: options?.activeProviderId,
      activeModel: options?.activeModel,
      isStreaming: false,
    },
  };
}

export function selectPreferredChatLinkedPaneId(
  panes: Pane[],
  preferredPaneId?: string,
): string | undefined {
  const terminalPanes = panes.filter((pane) => isTerminalPane(pane));
  if (terminalPanes.length === 0) {
    return undefined;
  }

  if (preferredPaneId && terminalPanes.some((pane) => pane.id === preferredPaneId)) {
    return preferredPaneId;
  }

  const sshPane = terminalPanes.find((pane) => (
    getPaneBackend(pane) === 'ssh'
    && Boolean(pane.ssh?.host)
    && Boolean(pane.ssh?.user)
  ));

  return sshPane?.id ?? terminalPanes[0]?.id;
}
