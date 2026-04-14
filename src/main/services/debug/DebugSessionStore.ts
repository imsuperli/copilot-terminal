import type {
  CodePaneBreakpoint,
  CodePaneExceptionBreakpoint,
  CodePaneDebugSession,
  CodePaneDebugSessionDetails,
  CodePaneDebugSessionSnapshot,
} from '../../../shared/types/electron-api';

interface StoredDebugSession {
  rootPath: string;
  session: CodePaneDebugSession;
  details: CodePaneDebugSessionDetails;
  output: string;
}

export class DebugSessionStore {
  private readonly breakpointsByRoot = new Map<string, Map<string, CodePaneBreakpoint>>();
  private readonly exceptionBreakpointsByRoot = new Map<string, CodePaneExceptionBreakpoint[]>();
  private readonly sessions = new Map<string, StoredDebugSession>();

  setBreakpoint(rootPath: string, breakpoint: CodePaneBreakpoint): void {
    const breakpointMap = this.ensureBreakpointMap(rootPath);
    const normalizedBreakpoint = normalizeBreakpoint(breakpoint);
    breakpointMap.set(createBreakpointKey(normalizedBreakpoint), normalizedBreakpoint);
  }

  removeBreakpoint(rootPath: string, breakpoint: CodePaneBreakpoint): void {
    const breakpointMap = this.breakpointsByRoot.get(rootPath);
    if (!breakpointMap) {
      return;
    }

    breakpointMap.delete(createBreakpointKey(breakpoint));
    if (breakpointMap.size === 0) {
      this.breakpointsByRoot.delete(rootPath);
    }
  }

  getBreakpoints(rootPath: string): CodePaneBreakpoint[] {
    return Array.from(this.breakpointsByRoot.get(rootPath)?.values() ?? []).sort(compareBreakpoints);
  }

  getEnabledBreakpoints(rootPath: string): CodePaneBreakpoint[] {
    return this.getBreakpoints(rootPath).filter((breakpoint) => breakpoint.enabled !== false);
  }

  setExceptionBreakpoints(rootPath: string, breakpoints: CodePaneExceptionBreakpoint[]): void {
    this.exceptionBreakpointsByRoot.set(rootPath, normalizeExceptionBreakpoints(breakpoints));
  }

  getExceptionBreakpoints(rootPath: string): CodePaneExceptionBreakpoint[] {
    return normalizeExceptionBreakpoints(this.exceptionBreakpointsByRoot.get(rootPath) ?? []);
  }

  storeSession(rootPath: string, session: CodePaneDebugSession): void {
    this.sessions.set(session.id, {
      rootPath,
      session,
      details: {
        sessionId: session.id,
        stackFrames: [],
        scopes: [],
      },
      output: '',
    });
  }

  updateSession(sessionId: string, patch: Partial<CodePaneDebugSession>): CodePaneDebugSession | null {
    const storedSession = this.sessions.get(sessionId);
    if (!storedSession) {
      return null;
    }

    storedSession.session = {
      ...storedSession.session,
      ...patch,
    };
    return storedSession.session;
  }

  getSession(sessionId: string): StoredDebugSession | null {
    return this.sessions.get(sessionId) ?? null;
  }

  setSessionDetails(sessionId: string, details: CodePaneDebugSessionDetails): CodePaneDebugSessionDetails | null {
    const storedSession = this.sessions.get(sessionId);
    if (!storedSession) {
      return null;
    }

    storedSession.details = details;
    return storedSession.details;
  }

  getSessionDetails(sessionId: string): CodePaneDebugSessionDetails | null {
    return this.sessions.get(sessionId)?.details ?? null;
  }

  appendSessionOutput(sessionId: string, chunk: string): void {
    const storedSession = this.sessions.get(sessionId);
    if (!storedSession) {
      return;
    }

    storedSession.output = `${storedSession.output}${chunk}`;
  }

  listSessions(rootPath: string): CodePaneDebugSessionSnapshot[] {
    return Array.from(this.sessions.values())
      .filter((storedSession) => storedSession.rootPath === rootPath)
      .sort((left, right) => right.session.startedAt.localeCompare(left.session.startedAt))
      .map((storedSession) => ({
        session: storedSession.session,
        output: storedSession.output,
      }));
  }

  deleteSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  private ensureBreakpointMap(rootPath: string): Map<string, CodePaneBreakpoint> {
    const existingBreakpointMap = this.breakpointsByRoot.get(rootPath);
    if (existingBreakpointMap) {
      return existingBreakpointMap;
    }

    const nextBreakpointMap = new Map<string, CodePaneBreakpoint>();
    this.breakpointsByRoot.set(rootPath, nextBreakpointMap);
    return nextBreakpointMap;
  }
}

function createBreakpointKey(breakpoint: CodePaneBreakpoint): string {
  return `${normalizePath(breakpoint.filePath)}:${Math.max(1, Math.round(breakpoint.lineNumber))}`;
}

function normalizeBreakpoint(breakpoint: CodePaneBreakpoint): CodePaneBreakpoint {
  return {
    ...breakpoint,
    filePath: normalizePath(breakpoint.filePath),
    lineNumber: Math.max(1, Math.round(breakpoint.lineNumber)),
    ...(breakpoint.condition?.trim() ? { condition: breakpoint.condition.trim() } : {}),
    ...(breakpoint.logMessage?.trim() ? { logMessage: breakpoint.logMessage.trim() } : {}),
    ...(breakpoint.enabled === false ? { enabled: false } : {}),
  };
}

function compareBreakpoints(left: CodePaneBreakpoint, right: CodePaneBreakpoint): number {
  const pathOrder = left.filePath.localeCompare(right.filePath);
  return pathOrder !== 0 ? pathOrder : left.lineNumber - right.lineNumber;
}

function normalizeExceptionBreakpoints(breakpoints: CodePaneExceptionBreakpoint[]): CodePaneExceptionBreakpoint[] {
  const allBreakpoint = breakpoints.find((breakpoint) => breakpoint.id === 'all');
  return [{
    id: 'all',
    label: allBreakpoint?.label ?? 'All Exceptions',
    enabled: allBreakpoint?.enabled === true,
  }];
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/');
}
