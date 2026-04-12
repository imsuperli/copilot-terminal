import type { ChatMessage } from '../../shared/types/chat';
import type { Pane } from '../types/window';
import { WindowStatus } from '../types/window';

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
