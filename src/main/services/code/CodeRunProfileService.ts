import { randomUUID } from 'crypto';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import path from 'path';
import fs from 'fs-extra';
import type {
  CodePaneListRunTargetsConfig,
  CodePaneRunSession,
  CodePaneRunSessionChangedPayload,
  CodePaneRunSessionOutputPayload,
  CodePaneRunTarget,
  CodePaneRunTargetConfig,
  CodePaneRunTargetKind,
  CodePaneStopRunTargetConfig,
} from '../../../shared/types/electron-api';

interface ResolvedRunTarget extends CodePaneRunTarget {
  rootPath: string;
  command: string;
  args: string[];
}

interface RunningRunSession {
  child: ChildProcessWithoutNullStreams;
  session: CodePaneRunSession;
  target: ResolvedRunTarget;
  stoppedByUser: boolean;
}

export interface CodeRunProfileServiceOptions {
  emitSessionChanged: (payload: CodePaneRunSessionChangedPayload) => void;
  emitSessionOutput: (payload: CodePaneRunSessionOutputPayload) => void;
  now?: () => string;
}

export class CodeRunProfileService {
  private readonly emitSessionChanged: (payload: CodePaneRunSessionChangedPayload) => void;
  private readonly emitSessionOutput: (payload: CodePaneRunSessionOutputPayload) => void;
  private readonly now: () => string;
  private readonly targets = new Map<string, ResolvedRunTarget>();
  private readonly runningSessions = new Map<string, RunningRunSession>();
  private readonly failedTestTargetIdsByRoot = new Map<string, Set<string>>();

  constructor(options: CodeRunProfileServiceOptions) {
    this.emitSessionChanged = options.emitSessionChanged;
    this.emitSessionOutput = options.emitSessionOutput;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async listRunTargets(config: CodePaneListRunTargetsConfig): Promise<CodePaneRunTarget[]> {
    const targets: CodePaneRunTarget[] = [];
    const rootPath = config.rootPath;
    const activeFilePath = config.activeFilePath ?? null;

    if (activeFilePath?.endsWith('.java') && await isJavaMainFile(activeFilePath)) {
      const className = deriveJavaClassName(rootPath, activeFilePath, 'main');
      if (className) {
        targets.push(this.registerTarget({
          rootPath,
          key: `java:main:${activeFilePath}`,
          label: path.basename(activeFilePath),
          detail: `mvn compile exec:java -Dexec.mainClass=${className}`,
          kind: 'application',
          languageId: 'java',
          workingDirectory: rootPath,
          filePath: activeFilePath,
          command: resolveExecutable('mvn'),
          args: ['compile', 'exec:java', `-Dexec.mainClass=${className}`],
          canDebug: true,
        }));
      }
    }

    if (await this.isSpringBootProject(rootPath)) {
      targets.push(this.registerTarget({
        rootPath,
        key: 'java:spring-boot',
        label: 'Spring Boot',
        detail: 'mvn spring-boot:run',
        kind: 'application',
        languageId: 'java',
        workingDirectory: rootPath,
        command: resolveExecutable('mvn'),
        args: ['spring-boot:run'],
        canDebug: true,
      }));
    }

    if (activeFilePath?.endsWith('.py') && !isPythonTestFile(activeFilePath)) {
      targets.push(this.registerTarget({
        rootPath,
        key: `python:file:${activeFilePath}`,
        label: path.basename(activeFilePath),
        detail: `python ${path.basename(activeFilePath)}`,
        kind: 'application',
        languageId: 'python',
        workingDirectory: path.dirname(activeFilePath),
        filePath: activeFilePath,
        command: resolveExecutable('python'),
        args: [activeFilePath],
        canDebug: true,
      }));
    }

    if (activeFilePath?.endsWith('.go') && !activeFilePath.endsWith('_test.go') && await isGoMainFile(activeFilePath)) {
      targets.push(this.registerTarget({
        rootPath,
        key: `go:file:${activeFilePath}`,
        label: path.basename(activeFilePath),
        detail: `go run ${path.basename(activeFilePath)}`,
        kind: 'application',
        languageId: 'go',
        workingDirectory: path.dirname(activeFilePath),
        filePath: activeFilePath,
        command: resolveExecutable('go'),
        args: ['run', activeFilePath],
        canDebug: true,
      }));
    }

    return targets;
  }

  async runTarget(config: CodePaneRunTargetConfig): Promise<CodePaneRunSession> {
    const target = this.targets.get(config.targetId);
    if (!target) {
      throw new Error(`Unknown run target: ${config.targetId}`);
    }

    const sessionId = randomUUID();
    const session: CodePaneRunSession = {
      id: sessionId,
      targetId: target.id,
      label: target.label,
      detail: target.detail,
      kind: target.kind,
      languageId: target.languageId,
      state: 'starting',
      workingDirectory: target.workingDirectory,
      startedAt: this.now(),
    };

    const child = spawn(target.command, target.args, {
      cwd: target.workingDirectory,
      env: process.env,
      stdio: 'pipe',
    });

    const runningSession: RunningRunSession = {
      child,
      session,
      target,
      stoppedByUser: false,
    };
    this.runningSessions.set(session.id, runningSession);
    this.emitSessionChanged({
      rootPath: target.rootPath,
      session,
    });

    child.on('spawn', () => {
      this.updateSession(session.id, {
        state: 'running',
      });
      this.emitOutput(session.id, target.rootPath, `$ ${target.command} ${target.args.join(' ')}\n`, 'system');
    });

    child.stdout.on('data', (chunk: Buffer) => {
      this.emitOutput(session.id, target.rootPath, chunk.toString('utf8'), 'stdout');
    });

    child.stderr.on('data', (chunk: Buffer) => {
      this.emitOutput(session.id, target.rootPath, chunk.toString('utf8'), 'stderr');
    });

    child.on('error', (error) => {
      this.emitOutput(session.id, target.rootPath, `${error.message}\n`, 'stderr');
      this.finishSession(session.id, 'failed', null);
    });

    child.on('exit', (exitCode) => {
      const state = runningSession.stoppedByUser
        ? 'stopped'
        : exitCode === 0
          ? 'passed'
          : 'failed';
      this.finishSession(session.id, state, exitCode ?? null);
    });

    return session;
  }

  async stopRunTarget(config: CodePaneStopRunTargetConfig): Promise<void> {
    const runningSession = this.runningSessions.get(config.sessionId);
    if (!runningSession) {
      return;
    }

    runningSession.stoppedByUser = true;
    runningSession.child.kill();
  }

  async rerunFailedTargets(rootPath: string): Promise<CodePaneRunSession[]> {
    const failedTargetIds = Array.from(this.failedTestTargetIdsByRoot.get(rootPath) ?? []);
    const sessions: CodePaneRunSession[] = [];

    for (const targetId of failedTargetIds) {
      sessions.push(await this.runTarget({
        rootPath,
        targetId,
      }));
    }

    return sessions;
  }

  markFailedTestTarget(rootPath: string, targetId: string, failed: boolean): void {
    const failedTargetIds = new Set(this.failedTestTargetIdsByRoot.get(rootPath) ?? []);
    if (failed) {
      failedTargetIds.add(targetId);
    } else {
      failedTargetIds.delete(targetId);
    }
    this.failedTestTargetIdsByRoot.set(rootPath, failedTargetIds);
  }

  registerAdHocTarget(target: Omit<ResolvedRunTarget, 'id'> & { id?: string }): CodePaneRunTarget {
    return this.storeTarget({
      ...target,
      id: target.id ?? randomUUID(),
    });
  }

  private registerTarget(target: {
    rootPath: string;
    key: string;
    label: string;
    detail: string;
    kind: CodePaneRunTargetKind;
    languageId: string;
    workingDirectory: string;
    command: string;
    args: string[];
    filePath?: string;
    canDebug?: boolean;
  }): CodePaneRunTarget {
    return this.storeTarget({
      id: `${target.rootPath}:${target.key}`,
      rootPath: target.rootPath,
      label: target.label,
      detail: target.detail,
      kind: target.kind,
      languageId: target.languageId,
      workingDirectory: target.workingDirectory,
      filePath: target.filePath,
      command: target.command,
      args: target.args,
      canDebug: target.canDebug,
    });
  }

  private storeTarget(target: ResolvedRunTarget): CodePaneRunTarget {
    this.targets.set(target.id, target);
    return {
      id: target.id,
      label: target.label,
      detail: target.detail,
      kind: target.kind,
      languageId: target.languageId,
      workingDirectory: target.workingDirectory,
      ...(target.filePath ? { filePath: target.filePath } : {}),
      ...(target.canDebug ? { canDebug: true } : {}),
    };
  }

  private updateSession(sessionId: string, patch: Partial<CodePaneRunSession>): void {
    const runningSession = this.runningSessions.get(sessionId);
    if (!runningSession) {
      return;
    }

    runningSession.session = {
      ...runningSession.session,
      ...patch,
    };
    this.emitSessionChanged({
      rootPath: runningSession.target.rootPath,
      session: runningSession.session,
    });
  }

  private finishSession(
    sessionId: string,
    state: CodePaneRunSession['state'],
    exitCode: number | null,
  ): void {
    const runningSession = this.runningSessions.get(sessionId);
    if (!runningSession) {
      return;
    }

    this.updateSession(sessionId, {
      state,
      exitCode,
      endedAt: this.now(),
    });

    if (runningSession.target.kind === 'test') {
      this.markFailedTestTarget(runningSession.target.rootPath, runningSession.target.id, state === 'failed');
    }

    this.runningSessions.delete(sessionId);
  }

  private emitOutput(
    sessionId: string,
    rootPath: string,
    chunk: string,
    stream: CodePaneRunSessionOutputPayload['stream'],
  ): void {
    this.emitSessionOutput({
      rootPath,
      sessionId,
      chunk,
      stream,
    });
  }

  private async isSpringBootProject(rootPath: string): Promise<boolean> {
    const pomPath = path.join(rootPath, 'pom.xml');
    if (!await fs.pathExists(pomPath)) {
      return false;
    }

    const pomContent = await fs.readFile(pomPath, 'utf8');
    return /spring-boot/i.test(pomContent);
  }
}

function resolveExecutable(command: string): string {
  if (process.platform === 'win32') {
    if (command === 'mvn') {
      return 'mvn.cmd';
    }
    if (command === 'python') {
      return 'python.exe';
    }
    if (command === 'go') {
      return 'go.exe';
    }
  }

  return command;
}

async function isGoMainFile(filePath: string): Promise<boolean> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return /\bpackage\s+main\b/.test(content);
  } catch {
    return false;
  }
}

async function isJavaMainFile(filePath: string): Promise<boolean> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return /\bpublic\s+static\s+void\s+main\s*\(\s*String(?:\s*\[\s*\]|\.\.\.)/.test(content);
  } catch {
    return false;
  }
}

function deriveJavaClassName(
  rootPath: string,
  filePath: string,
  sourceKind: 'main' | 'test',
): string | null {
  const sourceRoot = path.join(rootPath, 'src', sourceKind, 'java');
  const relativePath = path.relative(sourceRoot, filePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return null;
  }

  return relativePath
    .replace(/\.java$/i, '')
    .split(path.sep)
    .join('.');
}

function isPythonTestFile(filePath: string): boolean {
  const baseName = path.basename(filePath);
  return baseName.startsWith('test_')
    || baseName.endsWith('_test.py')
    || filePath.split(path.sep).includes('tests');
}
