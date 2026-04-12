import type { InteractionDetector, InteractionRequest } from '../../services/interaction-detector';

export interface MarkerStream {
  write(data: string): void;
  subscribe(listener: (chunk: string) => void): () => void;
}

export interface MarkerRunnerResult {
  exitCode: number;
  output: string;
  timedOut: boolean;
}

export interface MarkerRunnerCallbacks {
  onOutput?: (chunk: string) => void;
  onInteraction?: (request: InteractionRequest) => void;
}

export interface MarkerRunnerHandle {
  result: Promise<MarkerRunnerResult>;
  sendInput: (input: string, appendNewline?: boolean) => void;
  cancel: () => void;
}

export interface MarkerRunnerConfig {
  commandId: string;
  wrappedCommand: string;
  startMarker: string;
  endMarker: string;
  timeoutMs?: number;
  halfLineTimeoutMs?: number;
  stream: MarkerStream;
  interactionDetector?: InteractionDetector;
  callbacks?: MarkerRunnerCallbacks;
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function runMarkerBasedCommand(config: MarkerRunnerConfig): MarkerRunnerHandle {
  const {
    commandId,
    wrappedCommand,
    startMarker,
    endMarker,
    timeoutMs = 10 * 60 * 1000,
    halfLineTimeoutMs = 250,
    stream,
    interactionDetector,
    callbacks,
  } = config;

  let started = false;
  let completed = false;
  let exitCode = 0;
  let output = '';
  let lineBuffer = '';
  let halfLineTimer: ReturnType<typeof setTimeout> | null = null;
  let finish: ((result: MarkerRunnerResult) => void) | null = null;
  let rejectFinish: ((error: Error) => void) | null = null;

  const cleanupHalfLineTimer = () => {
    if (halfLineTimer) {
      clearTimeout(halfLineTimer);
      halfLineTimer = null;
    }
  };

  const flushHalfLine = () => {
    if (!started || completed || !lineBuffer.trim()) {
      return;
    }

    const chunk = lineBuffer;
    output += chunk;
    callbacks?.onOutput?.(chunk);
    const interaction = interactionDetector?.feed(commandId, chunk);
    if (interaction) {
      callbacks?.onInteraction?.(interaction);
    }
    lineBuffer = '';
  };

  const finishResult = (result: MarkerRunnerResult) => {
    if (completed) {
      return;
    }
    completed = true;
    cleanupHalfLineTimer();
    unsubscribe();
    finish?.(result);
  };

  const failResult = (error: Error) => {
    if (completed) {
      return;
    }
    completed = true;
    cleanupHalfLineTimer();
    unsubscribe();
    rejectFinish?.(error);
  };

  const scheduleHalfLineFlush = () => {
    cleanupHalfLineTimer();
    halfLineTimer = setTimeout(() => {
      flushHalfLine();
    }, halfLineTimeoutMs);
  };

  const processLine = (line: string) => {
    const trimmed = line.trim();
    if (!started) {
      if (trimmed.includes(startMarker)) {
        started = true;
      }
      return;
    }

    if (trimmed.includes(endMarker)) {
      const pattern = new RegExp(`${escapeForRegex(endMarker)}:(\\d+)`);
      const match = trimmed.match(pattern);
      exitCode = match?.[1] ? Number(match[1]) : 0;
      finishResult({
        exitCode,
        output,
        timedOut: false,
      });
      return;
    }

    const chunk = `${line}\n`;
    output += chunk;
    callbacks?.onOutput?.(chunk);
    const interaction = interactionDetector?.feed(commandId, chunk);
    if (interaction) {
      callbacks?.onInteraction?.(interaction);
    }
  };

  const onData = (chunk: string) => {
    if (completed) {
      return;
    }

    cleanupHalfLineTimer();
    const joined = `${lineBuffer}${chunk}`;
    const parts = joined.split(/\r?\n/);
    lineBuffer = parts.pop() ?? '';

    for (const line of parts) {
      processLine(line);
      if (completed) {
        return;
      }
    }

    if (lineBuffer) {
      scheduleHalfLineFlush();
    }
  };

  const unsubscribe = stream.subscribe(onData);

  const result = new Promise<MarkerRunnerResult>((resolve, reject) => {
    finish = resolve;
    rejectFinish = reject;
  });

  const commandTimeout = setTimeout(() => {
    flushHalfLine();
    finishResult({
      exitCode,
      output,
      timedOut: true,
    });
  }, timeoutMs);

  result.finally(() => {
    clearTimeout(commandTimeout);
  }).catch(() => {
    clearTimeout(commandTimeout);
  });

  try {
    stream.write(`${wrappedCommand}\n`);
  } catch (error) {
    failResult(error instanceof Error ? error : new Error(String(error)));
  }

  return {
    result,
    sendInput: (input: string, appendNewline = true) => {
      stream.write(appendNewline ? `${input}\n` : input);
      interactionDetector?.clearPromptCache();
    },
    cancel: () => {
      stream.write('\u0003');
    },
  };
}
