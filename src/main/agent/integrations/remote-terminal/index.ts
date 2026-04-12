import { v4 as uuidv4 } from 'uuid';
import type { ProcessManager } from '../../../services/ProcessManager';
import type {
  SSHExecCommandCallbacks,
  SSHExecCommandHandle,
} from '../../../types/process';
import { InteractionDetector, type InteractionRequest } from '../../services/interaction-detector';
import {
  runMarkerBasedCommand,
  type MarkerRunnerHandle,
} from './marker-based-runner';

export interface RemoteCommandCallbacks {
  onOutput?: (chunk: string) => void;
  onInteraction?: (request: InteractionRequest) => void;
}

export interface RemoteCommandHandle {
  commandId: string;
  result: Promise<{
    exitCode: number;
    output: string;
    timedOut: boolean;
  }>;
  sendInput: (input: string, appendNewline?: boolean) => void;
  cancel: () => void;
}

export interface RemoteCommandRequest {
  windowId: string;
  paneId: string;
  command: string;
  callbacks?: RemoteCommandCallbacks;
}

export interface SilentRemoteCommandRequest {
  windowId: string;
  paneId: string;
  command: string;
  callbacks?: SSHExecCommandCallbacks;
}

export class RemoteTerminalManager {
  constructor(private readonly processManager: ProcessManager) {}

  runCommand(request: RemoteCommandRequest): RemoteCommandHandle {
    const pid = this.processManager.getPidByPane(request.windowId, request.paneId);
    if (pid === null) {
      throw new Error(`Pane not found: ${request.windowId}/${request.paneId}`);
    }

    const commandId = uuidv4();
    const markerId = commandId.replace(/[^a-zA-Z0-9_-]/g, '');
    const startMarker = `__COPILOT_AGENT_START_${markerId}__`;
    const endMarker = `__COPILOT_AGENT_END_${markerId}__`;
    const wrappedCommand = [
      `printf '\\n${startMarker}\\n'`,
      `{ ${request.command}; }`,
      '__copilot_agent_exit=$?',
      `printf '\\n${endMarker}:%s\\n' "$__copilot_agent_exit"`,
    ].join('; ');

    const detector = new InteractionDetector();
    const stream = {
      write: (data: string) => {
        this.processManager.writeToPty(pid, data);
      },
      subscribe: (listener: (chunk: string) => void) => (
        this.processManager.subscribePtyData(pid, (data) => listener(data))
      ),
    };

    const runner: MarkerRunnerHandle = runMarkerBasedCommand({
      commandId,
      wrappedCommand,
      startMarker,
      endMarker,
      stream,
      interactionDetector: detector,
      callbacks: {
        onOutput: request.callbacks?.onOutput,
        onInteraction: request.callbacks?.onInteraction,
      },
    });

    return {
      commandId,
      result: runner.result,
      sendInput: runner.sendInput,
      cancel: runner.cancel,
    };
  }

  async runSilentCommand(request: SilentRemoteCommandRequest): Promise<SSHExecCommandHandle> {
    return this.processManager.execSSHCommandDetailedStreaming(
      request.windowId,
      request.paneId,
      request.command,
      request.callbacks,
    );
  }
}
