import { describe, expect, it, vi } from 'vitest';
import type {
  CodePaneBreakpoint,
  CodePaneDebugScope,
  CodePaneDebugStackFrame,
} from '../../../../shared/types/electron-api';
import { CodeRunProfileService } from '../../code/CodeRunProfileService';
import { DebugAdapterSupervisor } from '../DebugAdapterSupervisor';
import type { DebugDriver, DebugDriverContext, DebugDriverSnapshot } from '../DebugDriver';

describe('DebugAdapterSupervisor', () => {
  it('starts a debug session and exposes debug details', async () => {
    const { runProfileService, targetId } = createRunProfileService();
    const emittedSessions: Array<{ rootPath: string; state: string }> = [];
    const emittedOutput: Array<{ rootPath: string; chunk: string }> = [];
    let receivedBreakpoints: CodePaneBreakpoint[] = [];

    const supervisor = new DebugAdapterSupervisor({
      runProfileService,
      emitSessionChanged: (payload) => {
        emittedSessions.push({
          rootPath: payload.rootPath,
          state: payload.session.state,
        });
      },
      emitSessionOutput: (payload) => {
        emittedOutput.push({
          rootPath: payload.rootPath,
          chunk: payload.chunk,
        });
      },
      now: () => '2026-04-13T00:00:00.000Z',
      createDriver: (context) => {
        receivedBreakpoints = context.breakpoints;
        return new FakeDebugDriver(context, {
          startSnapshot: createSnapshot({
            frameLineNumber: 10,
            variables: [{ name: 'value', value: '1' }],
          }),
        });
      },
    });

    await supervisor.setBreakpoint({
      rootPath: '/workspace/project',
      breakpoint: {
        filePath: '/workspace/project/src/app.py',
        lineNumber: 10,
      },
    });

    const session = await supervisor.startSession({
      rootPath: '/workspace/project',
      targetId,
    });

    expect(session.state).toBe('paused');
    expect(receivedBreakpoints).toEqual([
      {
        filePath: '/workspace/project/src/app.py',
        lineNumber: 10,
      },
    ]);
    const details = await supervisor.getSessionDetails(session.id);
    expect(details.stackFrames).toEqual([
      expect.objectContaining({
        lineNumber: 10,
      }),
    ]);
    expect(details.scopes[0]?.variables).toEqual([
      expect.objectContaining({
        name: 'value',
        value: '1',
      }),
    ]);
    expect(emittedSessions.some((entry) => entry.rootPath === '/workspace/project' && entry.state === 'paused')).toBe(true);
    expect(emittedOutput).toHaveLength(0);
  });

  it('continues a debug session and syncs pending breakpoints after it pauses again', async () => {
    const { runProfileService, targetId } = createRunProfileService();
    const applyBreakpointCalls: CodePaneBreakpoint[][] = [];

    const supervisor = new DebugAdapterSupervisor({
      runProfileService,
      emitSessionChanged: vi.fn(),
      emitSessionOutput: vi.fn(),
      now: () => '2026-04-13T00:00:00.000Z',
      createDriver: (context) => new FakeDebugDriver(context, {
        startSnapshot: createSnapshot({
          frameLineNumber: 10,
          variables: [{ name: 'value', value: '1' }],
        }),
        resumeSnapshot: createSnapshot({
          frameLineNumber: 14,
          variables: [{ name: 'value', value: '2' }],
        }),
        onApplyBreakpoints: (breakpoints) => {
          applyBreakpointCalls.push(breakpoints);
        },
      }),
    });

    await supervisor.setBreakpoint({
      rootPath: '/workspace/project',
      breakpoint: {
        filePath: '/workspace/project/src/app.py',
        lineNumber: 10,
      },
    });

    const session = await supervisor.startSession({
      rootPath: '/workspace/project',
      targetId,
    });

    await supervisor.continueSession({
      sessionId: session.id,
    });
    await supervisor.setBreakpoint({
      rootPath: '/workspace/project',
      breakpoint: {
        filePath: '/workspace/project/src/app.py',
        lineNumber: 14,
      },
    });

    await waitForCondition(() => applyBreakpointCalls.length >= 2);
    expect(applyBreakpointCalls[0]).toEqual([
      {
        filePath: '/workspace/project/src/app.py',
        lineNumber: 10,
      },
    ]);
    expect(applyBreakpointCalls[1]).toEqual([
      {
        filePath: '/workspace/project/src/app.py',
        lineNumber: 10,
      },
      {
        filePath: '/workspace/project/src/app.py',
        lineNumber: 14,
      },
    ]);

    const details = await supervisor.getSessionDetails(session.id);
    expect(details.stackFrames[0]?.lineNumber).toBe(14);
  });

  it('pauses and evaluates against the active debug driver', async () => {
    const { runProfileService, targetId } = createRunProfileService();
    let fakeDriver: FakeDebugDriver | null = null;

    const supervisor = new DebugAdapterSupervisor({
      runProfileService,
      emitSessionChanged: vi.fn(),
      emitSessionOutput: vi.fn(),
      now: () => '2026-04-13T00:00:00.000Z',
      createDriver: (context) => {
        fakeDriver = new FakeDebugDriver(context, {
          startSnapshot: createSnapshot({
            frameLineNumber: 10,
            variables: [{ name: 'value', value: '1' }],
          }),
        });
        return fakeDriver;
      },
    });

    const session = await supervisor.startSession({
      rootPath: '/workspace/project',
      targetId,
    });

    await supervisor.pauseSession({
      sessionId: session.id,
    });
    const evaluation = await supervisor.evaluate({
      sessionId: session.id,
      expression: 'value',
    });

    expect(fakeDriver?.requestPause).toHaveBeenCalled();
    expect(fakeDriver?.evaluate).toHaveBeenCalledWith('value');
    expect(evaluation.value).toBe('eval:value');
  });
});

class FakeDebugDriver implements DebugDriver {
  readonly adapterType = 'fake-debugger';
  readonly applyBreakpoints = vi.fn(async (breakpoints: CodePaneBreakpoint[]) => {
    this.options.onApplyBreakpoints?.(breakpoints);
  });
  readonly requestPause = vi.fn(async () => {});
  readonly evaluate = vi.fn(async (expression: string) => ({
    value: `eval:${expression}`,
  }));
  readonly stop = vi.fn(async () => {});

  private readonly initialBreakpoints: CodePaneBreakpoint[];

  constructor(
    context: DebugDriverContext,
    private readonly options: {
      startSnapshot: DebugDriverSnapshot;
      resumeSnapshot?: DebugDriverSnapshot;
      onApplyBreakpoints?: (breakpoints: CodePaneBreakpoint[]) => void;
    },
  ) {
    this.initialBreakpoints = context.breakpoints;
  }

  async start(): Promise<DebugDriverSnapshot> {
    await this.applyBreakpoints(this.initialBreakpoints);
    return this.options.startSnapshot;
  }

  async resume(): Promise<DebugDriverSnapshot> {
    await new Promise((resolve) => setTimeout(resolve, 10));
    return this.options.resumeSnapshot ?? this.options.startSnapshot;
  }

  async stepOver(): Promise<DebugDriverSnapshot> {
    return this.options.resumeSnapshot ?? this.options.startSnapshot;
  }

  async stepInto(): Promise<DebugDriverSnapshot> {
    return this.options.resumeSnapshot ?? this.options.startSnapshot;
  }

  async stepOut(): Promise<DebugDriverSnapshot> {
    return this.options.resumeSnapshot ?? this.options.startSnapshot;
  }
}

function createRunProfileService(): {
  runProfileService: CodeRunProfileService;
  targetId: string;
} {
  const runProfileService = new CodeRunProfileService({
    emitSessionChanged: vi.fn(),
    emitSessionOutput: vi.fn(),
    now: () => '2026-04-13T00:00:00.000Z',
  });
  const target = runProfileService.registerAdHocTarget({
    rootPath: '/workspace/project',
    label: 'app.py',
    detail: 'python app.py',
    kind: 'application',
    languageId: 'python',
    workingDirectory: '/workspace/project',
    filePath: '/workspace/project/src/app.py',
    command: process.execPath,
    args: ['app.py'],
    canDebug: true,
  });

  return {
    runProfileService,
    targetId: target.id,
  };
}

function createSnapshot(options: {
  frameLineNumber: number;
  variables: Array<{ name: string; value: string }>;
}): DebugDriverSnapshot {
  const frame: CodePaneDebugStackFrame = {
    id: `frame-${options.frameLineNumber}`,
    name: 'main',
    filePath: '/workspace/project/src/app.py',
    lineNumber: options.frameLineNumber,
    column: 1,
  };
  const scopes: CodePaneDebugScope[] = [{
    id: 'locals',
    name: 'Locals',
    variables: options.variables.map((variable, index) => ({
      id: `var-${index + 1}`,
      name: variable.name,
      value: variable.value,
    })),
  }];

  return {
    state: 'paused',
    stopReason: 'breakpoint',
    currentFrame: frame,
    stackFrames: [frame],
    scopes,
  };
}

async function waitForCondition(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const startedAt = Date.now();

  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Timed out waiting for condition');
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
