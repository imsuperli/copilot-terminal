import { randomUUID } from 'crypto';
import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from 'child_process';
import path from 'path';
import fs from 'fs-extra';
import type {
  CodePaneDebugRequest,
  CodePaneListRunTargetsConfig,
  CodePaneRunSession,
  CodePaneRunSessionChangedPayload,
  CodePaneRunSessionOutputPayload,
  CodePaneRunTarget,
  CodePaneRunTargetCustomization,
  CodePaneRunTargetConfig,
  CodePaneRunTargetKind,
  CodePaneStopRunTargetConfig,
} from '../../../shared/types/electron-api';
import { resolvePythonEnvironment } from '../language/adapters/PythonProjectAdapter';

export interface ResolvedCodeRunTarget extends CodePaneRunTarget {
  rootPath: string;
  command: string;
  args: string[];
  debugRequest?: CodePaneDebugRequest;
  customization?: CodePaneRunTargetCustomization;
}

interface RunningRunSession {
  child: ChildProcessWithoutNullStreams;
  session: CodePaneRunSession;
  target: ResolvedCodeRunTarget;
  stoppedByUser: boolean;
}

interface PreparedSpawnCommand {
  command: string;
  args: string[];
  options: SpawnOptionsWithoutStdio;
  displayCommand: string;
}

interface EffectiveCommandLine {
  command: string;
  args: string[];
  detail: string;
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
  private readonly targets = new Map<string, ResolvedCodeRunTarget>();
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
        customization: {
          profiles: '',
          programArgs: '',
          vmArgs: '',
        },
      }));
      targets.push(this.registerTarget({
        rootPath,
        key: 'java:spring-boot-test',
        label: 'Spring Boot Test',
        detail: 'mvn test',
        kind: 'test',
        languageId: 'java',
        workingDirectory: rootPath,
        command: resolveExecutable('mvn'),
        args: ['test'],
        customization: {
          profiles: '',
          programArgs: '',
          vmArgs: '',
        },
      }));
    }

    if (activeFilePath?.endsWith('.py') && !isPythonTestFile(activeFilePath)) {
      const pythonEnvironment = await resolvePythonEnvironment(rootPath);
      const pythonCommand = pythonEnvironment.interpreterPath ?? resolveExecutable('python');

      targets.push(this.registerTarget({
        rootPath,
        key: `python:file:${activeFilePath}`,
        label: path.basename(activeFilePath),
        detail: `${pythonCommand} ${path.basename(activeFilePath)}`,
        kind: 'application',
        languageId: 'python',
        workingDirectory: path.dirname(activeFilePath),
        filePath: activeFilePath,
        command: pythonCommand,
        args: [activeFilePath],
        canDebug: true,
      }));

      const djangoManagePath = path.join(rootPath, 'manage.py');
      if (await fs.pathExists(djangoManagePath)) {
        targets.push(this.registerTarget({
          rootPath,
          key: 'python:django:runserver',
          label: 'Django Server',
          detail: `${pythonCommand} manage.py runserver`,
          kind: 'application',
          languageId: 'python',
          workingDirectory: rootPath,
          filePath: djangoManagePath,
          command: pythonCommand,
          args: ['manage.py', 'runserver'],
          canDebug: true,
        }));
      }

      const fastApiImportTarget = await detectFastApiImportTarget(rootPath, activeFilePath);
      if (fastApiImportTarget) {
        targets.push(this.registerTarget({
          rootPath,
          key: `python:fastapi:${activeFilePath}`,
          label: 'FastAPI',
          detail: `${pythonCommand} -m uvicorn ${fastApiImportTarget} --reload`,
          kind: 'application',
          languageId: 'python',
          workingDirectory: rootPath,
          filePath: activeFilePath,
          command: pythonCommand,
          args: ['-m', 'uvicorn', fastApiImportTarget, '--reload'],
          canDebug: true,
        }));
      }
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
    const target = this.getExecutionTarget(config.targetId, config.customization);
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

    const preparedCommand = prepareSpawnCommand(
      target.command,
      target.args,
      target.workingDirectory,
      process.env,
    );
    let child: ChildProcessWithoutNullStreams;

    try {
      child = spawn(preparedCommand.command, preparedCommand.args, {
        ...preparedCommand.options,
        stdio: 'pipe',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failedSession: CodePaneRunSession = {
        ...session,
        state: 'failed',
        endedAt: this.now(),
      };

      this.emitSessionChanged({
        rootPath: target.rootPath,
        session: failedSession,
      });
      this.emitOutput(session.id, target.rootPath, `$ ${preparedCommand.displayCommand}\n`, 'system');
      this.emitOutput(session.id, target.rootPath, `${message}\n`, 'stderr');
      return failedSession;
    }

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
      this.emitOutput(session.id, target.rootPath, `$ ${preparedCommand.displayCommand}\n`, 'system');
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

  registerAdHocTarget(target: Omit<ResolvedCodeRunTarget, 'id'> & { id?: string }): CodePaneRunTarget {
    return this.storeTarget({
      ...target,
      id: target.id ?? randomUUID(),
    });
  }

  getResolvedTarget(targetId: string): ResolvedCodeRunTarget | null {
    return this.targets.get(targetId) ?? null;
  }

  getExecutionTarget(
    targetId: string,
    customization?: CodePaneRunTargetCustomization,
  ): ResolvedCodeRunTarget | null {
    const target = this.targets.get(targetId);
    if (!target) {
      return null;
    }

    const effectiveTarget = this.resolveTargetCommandLine(target, customization);
    return {
      ...target,
      command: effectiveTarget.command,
      args: effectiveTarget.args,
      detail: effectiveTarget.detail,
      customization: mergeRunTargetCustomization(target.customization, customization),
    };
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
    debugRequest?: CodePaneDebugRequest;
    customization?: CodePaneRunTargetCustomization;
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
      debugRequest: target.debugRequest,
      customization: target.customization,
    });
  }

  private storeTarget(target: ResolvedCodeRunTarget): CodePaneRunTarget {
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
      ...(target.debugRequest ? { debugRequest: target.debugRequest } : {}),
      ...(target.customization ? { customization: target.customization } : {}),
    };
  }

  private resolveTargetCommandLine(
    target: ResolvedCodeRunTarget,
    customization?: CodePaneRunTargetCustomization,
  ): EffectiveCommandLine {
    const mergedCustomization = mergeRunTargetCustomization(target.customization, customization);

    if (target.languageId === 'java' && target.command.toLowerCase().includes('mvn') && target.args.includes('spring-boot:run')) {
      return buildSpringBootMavenRunCommand(target, mergedCustomization);
    }

    if (target.languageId === 'java' && target.command.toLowerCase().includes('mvn') && target.kind === 'test' && target.customization) {
      return buildSpringBootMavenTestCommand(target, mergedCustomization);
    }

    return {
      command: target.command,
      args: target.args,
      detail: target.detail,
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

function mergeRunTargetCustomization(
  base?: CodePaneRunTargetCustomization,
  override?: CodePaneRunTargetCustomization,
): CodePaneRunTargetCustomization | undefined {
  if (!base && !override) {
    return undefined;
  }

  return {
    profiles: override?.profiles ?? base?.profiles ?? '',
    programArgs: override?.programArgs ?? base?.programArgs ?? '',
    vmArgs: override?.vmArgs ?? base?.vmArgs ?? '',
  };
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

export function prepareSpawnCommand(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): PreparedSpawnCommand {
  if (process.platform !== 'win32' || !requiresWindowsCommandShell(command)) {
    return {
      command,
      args,
      options: {
        cwd,
        env,
      },
      displayCommand: formatDisplayCommand(command, args),
    };
  }

  return {
    command,
    args,
    options: {
      cwd,
      env,
      shell: true,
      windowsHide: true,
    },
    displayCommand: formatDisplayCommand(command, args),
  };
}

function requiresWindowsCommandShell(command: string): boolean {
  const normalized = command.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return normalized.endsWith('.cmd')
    || normalized.endsWith('.bat')
    || normalized === 'mvn'
    || normalized === 'mvn.cmd'
    || normalized === 'gradle'
    || normalized === 'gradle.bat'
    || normalized === 'mvnw'
    || normalized.endsWith(`${path.win32.sep}mvnw`)
    || normalized === 'mvnw.cmd'
    || normalized === 'gradlew'
    || normalized.endsWith(`${path.win32.sep}gradlew`)
    || normalized === 'gradlew.bat';
}

function formatDisplayCommand(command: string, args: string[]): string {
  return [command, ...args].join(' ').trim();
}

function buildSpringBootMavenRunCommand(
  target: ResolvedCodeRunTarget,
  customization?: CodePaneRunTargetCustomization,
): EffectiveCommandLine {
  const args = [...target.args];
  const profiles = normalizeRunOptionValue(customization?.profiles);
  const programArgs = normalizeRunOptionValue(customization?.programArgs);
  const vmArgs = normalizeRunOptionValue(customization?.vmArgs);

  if (profiles) {
    args.push(`-Dspring-boot.run.profiles=${profiles}`);
  }
  if (programArgs) {
    args.push(`-Dspring-boot.run.arguments=${programArgs}`);
  }
  if (vmArgs) {
    args.push(`-Dspring-boot.run.jvmArguments=${vmArgs}`);
  }

  return {
    command: target.command,
    args,
    detail: formatDisplayCommand(target.command, args),
  };
}

function buildSpringBootMavenTestCommand(
  target: ResolvedCodeRunTarget,
  customization?: CodePaneRunTargetCustomization,
): EffectiveCommandLine {
  const args = [...target.args];
  const profiles = normalizeRunOptionValue(customization?.profiles);
  const programArgs = normalizeRunOptionValue(customization?.programArgs);
  const vmArgs = normalizeRunOptionValue(customization?.vmArgs);

  if (profiles) {
    args.push(`-Dspring.profiles.active=${profiles}`);
  }
  if (programArgs) {
    args.push(`-Dspring-boot.run.arguments=${programArgs}`);
  }
  if (vmArgs) {
    args.push(`-DargLine=${vmArgs}`);
  }

  return {
    command: target.command,
    args,
    detail: formatDisplayCommand(target.command, args),
  };
}

function normalizeRunOptionValue(value?: string): string {
  return value?.trim() ?? '';
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

async function detectFastApiImportTarget(rootPath: string, filePath: string): Promise<string | null> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    if (!/FastAPI\s*\(/.test(content)) {
      return null;
    }

    const relativePath = path.relative(rootPath, filePath).replace(/\.py$/i, '');
    if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      return null;
    }

    const modulePath = relativePath.split(path.sep).join('.').replace(/\.__init__$/, '');
    return `${modulePath}:app`;
  } catch {
    return null;
  }
}
