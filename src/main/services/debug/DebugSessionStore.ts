import type {
  CodePaneBreakpoint,
  CodePaneDebugSession,
  CodePaneDebugSessionDetails,
} from '../../../shared/types/electron-api';

interface StoredDebugSession {
  rootPath: string;
  session: CodePaneDebugSession;
  details: CodePaneDebugSessionDetails;
}

export class DebugSessionStore {
  private readonly breakpointsByRoot = new Map<string, Map<string, Set<number>>>();
  private readonly sessions = new Map<string, StoredDebugSession>();

  setBreakpoint(rootPath: string, breakpoint: CodePaneBreakpoint): void {
    const breakpointMap = this.ensureBreakpointMap(rootPath);
    const lineNumbers = breakpointMap.get(breakpoint.filePath) ?? new Set<number>();
    lineNumbers.add(breakpoint.lineNumber);
    breakpointMap.set(breakpoint.filePath, lineNumbers);
  }

  removeBreakpoint(rootPath: string, breakpoint: CodePaneBreakpoint): void {
    const breakpointMap = this.breakpointsByRoot.get(rootPath);
    if (!breakpointMap) {
      return;
    }

    const lineNumbers = breakpointMap.get(breakpoint.filePath);
    if (!lineNumbers) {
      return;
    }

    lineNumbers.delete(breakpoint.lineNumber);
    if (lineNumbers.size === 0) {
      breakpointMap.delete(breakpoint.filePath);
    }

    if (breakpointMap.size === 0) {
      this.breakpointsByRoot.delete(rootPath);
    }
  }

  getBreakpoints(rootPath: string): CodePaneBreakpoint[] {
    const breakpointMap = this.breakpointsByRoot.get(rootPath);
    if (!breakpointMap) {
      return [];
    }

    const breakpoints: CodePaneBreakpoint[] = [];
    for (const [filePath, lineNumbers] of breakpointMap.entries()) {
      for (const lineNumber of Array.from(lineNumbers).sort((left, right) => left - right)) {
        breakpoints.push({
          filePath,
          lineNumber,
        });
      }
    }

    return breakpoints;
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

  deleteSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  private ensureBreakpointMap(rootPath: string): Map<string, Set<number>> {
    const existingBreakpointMap = this.breakpointsByRoot.get(rootPath);
    if (existingBreakpointMap) {
      return existingBreakpointMap;
    }

    const nextBreakpointMap = new Map<string, Set<number>>();
    this.breakpointsByRoot.set(rootPath, nextBreakpointMap);
    return nextBreakpointMap;
  }
}
