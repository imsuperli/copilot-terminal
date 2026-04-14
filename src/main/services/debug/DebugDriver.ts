import type {
  CodePaneBreakpoint,
  CodePaneExceptionBreakpoint,
  CodePaneDebugEvaluationResult,
  CodePaneDebugScope,
  CodePaneDebugSessionState,
  CodePaneDebugStackFrame,
} from '../../../shared/types/electron-api';
import type { ResolvedCodeRunTarget } from '../code/CodeRunProfileService';

export interface DebugDriverCallbacks {
  onOutput: (chunk: string, stream: 'stdout' | 'stderr' | 'system') => void;
  onTerminated: (result: { exitCode: number | null; error?: string }) => void;
}

export interface DebugDriverSnapshot {
  state: Extract<CodePaneDebugSessionState, 'paused' | 'stopped' | 'error'>;
  stopReason?: string;
  error?: string;
  currentFrame: CodePaneDebugStackFrame | null;
  stackFrames: CodePaneDebugStackFrame[];
  scopes: CodePaneDebugScope[];
}

export interface DebugDriverContext {
  rootPath: string;
  target: ResolvedCodeRunTarget;
  breakpoints: CodePaneBreakpoint[];
  exceptionBreakpoints: CodePaneExceptionBreakpoint[];
  callbacks: DebugDriverCallbacks;
}

export interface DebugDriver {
  readonly adapterType: string;
  start(): Promise<DebugDriverSnapshot>;
  applyBreakpoints(breakpoints: CodePaneBreakpoint[]): Promise<void>;
  applyExceptionBreakpoints(breakpoints: CodePaneExceptionBreakpoint[]): Promise<void>;
  resume(): Promise<DebugDriverSnapshot>;
  requestPause(): Promise<void>;
  stepOver(): Promise<DebugDriverSnapshot>;
  stepInto(): Promise<DebugDriverSnapshot>;
  stepOut(): Promise<DebugDriverSnapshot>;
  evaluate(expression: string): Promise<CodePaneDebugEvaluationResult>;
  stop(): Promise<void>;
}

export type DebugDriverFactory = (context: DebugDriverContext) => DebugDriver;
