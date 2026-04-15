import path from 'path';
import { tmpdir } from 'os';
import { promises as fsPromises } from 'fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  CodePaneRunSessionChangedPayload,
  CodePaneRunSessionOutputPayload,
} from '../../../../shared/types/electron-api';
import { CodeRunProfileService, prepareSpawnCommand } from '../CodeRunProfileService';

describe('CodeRunProfileService', () => {
  let tempRootPath: string;
  let sessionEvents: CodePaneRunSessionChangedPayload[];
  let outputEvents: CodePaneRunSessionOutputPayload[];
  let service: CodeRunProfileService;

  beforeEach(async () => {
    tempRootPath = await fsPromises.mkdtemp(path.join(tmpdir(), 'code-run-profile-service-'));
    sessionEvents = [];
    outputEvents = [];
    service = new CodeRunProfileService({
      emitSessionChanged: (payload) => {
        sessionEvents.push(payload);
      },
      emitSessionOutput: (payload) => {
        outputEvents.push(payload);
      },
      now: () => '2026-04-13T00:00:00.000Z',
    });
  });

  afterEach(async () => {
    await fsPromises.rm(tempRootPath, { recursive: true, force: true });
  });

  it('lists Spring Boot and Java main run targets for the active file', async () => {
    const pomPath = path.join(tempRootPath, 'pom.xml');
    const javaFilePath = path.join(tempRootPath, 'src', 'main', 'java', 'com', 'example', 'Application.java');

    await fsPromises.mkdir(path.dirname(javaFilePath), { recursive: true });
    await fsPromises.writeFile(pomPath, '<project><artifactId>demo</artifactId><name>spring-boot-app</name></project>', 'utf8');
    await fsPromises.writeFile(
      javaFilePath,
      'package com.example;\npublic class Application { public static void main(String[] args) {} }\n',
      'utf8',
    );

    const targets = await service.listRunTargets({
      rootPath: tempRootPath,
      activeFilePath: javaFilePath,
    });

    expect(targets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: 'Application.java',
        detail: 'mvn compile exec:java -Dexec.mainClass=com.example.Application',
        kind: 'application',
        languageId: 'java',
        filePath: javaFilePath,
      }),
      expect.objectContaining({
        label: 'Spring Boot',
        detail: 'mvn spring-boot:run',
        kind: 'application',
        languageId: 'java',
        customization: {
          profiles: '',
          programArgs: '',
          vmArgs: '',
        },
      }),
    ]));
  });

  it('applies Spring Boot customization to Maven run targets', () => {
    const target = service.registerAdHocTarget({
      rootPath: tempRootPath,
      label: 'Spring Boot',
      detail: 'mvn spring-boot:run',
      kind: 'application',
      languageId: 'java',
      workingDirectory: tempRootPath,
      command: 'mvn',
      args: ['spring-boot:run'],
      customization: {
        profiles: '',
        programArgs: '',
        vmArgs: '',
      },
    });

    const executionTarget = service.getExecutionTarget(target.id, {
      profiles: 'dev,local',
      programArgs: '--server.port=8081 --debug',
      vmArgs: '-Xms256m -Xmx1g',
    });

    expect(executionTarget).toEqual(expect.objectContaining({
      detail: 'mvn spring-boot:run -Dspring-boot.run.profiles=dev,local -Dspring-boot.run.arguments=--server.port=8081 --debug -Dspring-boot.run.jvmArguments=-Xms256m -Xmx1g',
      args: [
        'spring-boot:run',
        '-Dspring-boot.run.profiles=dev,local',
        '-Dspring-boot.run.arguments=--server.port=8081 --debug',
        '-Dspring-boot.run.jvmArguments=-Xms256m -Xmx1g',
      ],
    }));
  });

  it('builds customized execution targets for Spring Boot tests', () => {
    const target = service.registerAdHocTarget({
      rootPath: tempRootPath,
      label: 'Spring Boot Test',
      detail: 'mvn test',
      kind: 'test',
      languageId: 'java',
      workingDirectory: tempRootPath,
      command: 'mvn',
      args: ['test'],
      customization: {
        profiles: '',
        programArgs: '',
        vmArgs: '',
      },
    });

    const executionTarget = service.getExecutionTarget(target.id, {
      profiles: 'test',
      vmArgs: '-Xmx1g',
    });

    expect(executionTarget).toEqual(expect.objectContaining({
      detail: 'mvn test -Dspring.profiles.active=test -DargLine=-Xmx1g',
      args: ['test', '-Dspring.profiles.active=test', '-DargLine=-Xmx1g'],
    }));
  });

  it('binds Django run targets to the detected interpreter', async () => {
    const interpreterPath = path.join(tempRootPath, '.venv', 'bin', 'python');
    const activeFilePath = path.join(tempRootPath, 'app.py');
    await fsPromises.mkdir(path.dirname(interpreterPath), { recursive: true });
    await fsPromises.writeFile(interpreterPath, '', 'utf8');
    await fsPromises.writeFile(path.join(tempRootPath, 'manage.py'), 'print("manage")\n', 'utf8');
    await fsPromises.writeFile(activeFilePath, 'print("app")\n', 'utf8');

    const targets = await service.listRunTargets({
      rootPath: tempRootPath,
      activeFilePath,
    });

    expect(targets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: 'app.py',
        detail: `${interpreterPath} app.py`,
        languageId: 'python',
      }),
      expect.objectContaining({
        label: 'Django Server',
        detail: `${interpreterPath} manage.py runserver`,
        languageId: 'python',
      }),
    ]));
  });

  it('adds a FastAPI uvicorn target for FastAPI modules', async () => {
    const interpreterPath = path.join(tempRootPath, '.venv', 'bin', 'python');
    const activeFilePath = path.join(tempRootPath, 'app', 'main.py');
    await fsPromises.mkdir(path.dirname(interpreterPath), { recursive: true });
    await fsPromises.mkdir(path.dirname(activeFilePath), { recursive: true });
    await fsPromises.writeFile(interpreterPath, '', 'utf8');
    await fsPromises.writeFile(
      activeFilePath,
      [
        'from fastapi import FastAPI',
        '',
        'app = FastAPI()',
        '',
        '@app.get("/health")',
        'def health():',
        '    return {"ok": True}',
        '',
      ].join('\n'),
      'utf8',
    );

    const targets = await service.listRunTargets({
      rootPath: tempRootPath,
      activeFilePath,
    });

    expect(targets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: 'FastAPI',
        detail: `${interpreterPath} -m uvicorn app.main:app --reload`,
        languageId: 'python',
      }),
    ]));
  });

  it('runs ad hoc test targets, emits output, and reruns failed tests', async () => {
    const target = service.registerAdHocTarget({
      rootPath: tempRootPath,
      label: 'Failing test target',
      detail: 'node -e failing-target',
      kind: 'test',
      languageId: 'javascript',
      workingDirectory: tempRootPath,
      command: process.execPath,
      args: ['-e', 'process.stderr.write("boom\\n"); process.exit(1);'],
    });

    const session = await service.runTarget({
      rootPath: tempRootPath,
      targetId: target.id,
    });

    await waitForCondition(() => (
      sessionEvents.some((event) => event.session.id === session.id && event.session.state === 'failed')
    ));

    expect(outputEvents.some((event) => (
      event.rootPath === tempRootPath && event.sessionId === session.id && event.chunk.includes('boom')
    ))).toBe(true);

    const rerunSessions = await service.rerunFailedTargets(tempRootPath);
    expect(rerunSessions).toHaveLength(1);
    expect(rerunSessions[0].targetId).toBe(target.id);
  });

  it('uses shell execution for Windows command-wrapper targets', async () => {
    const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');

    Object.defineProperty(process, 'platform', { value: 'win32' });

    try {
      expect(prepareSpawnCommand('mvn.cmd', ['spring-boot:run'], tempRootPath, process.env)).toEqual({
        command: 'mvn.cmd',
        args: ['spring-boot:run'],
        options: expect.objectContaining({
          cwd: tempRootPath,
          env: process.env,
          shell: true,
          windowsHide: true,
        }),
        displayCommand: 'mvn.cmd spring-boot:run',
      });
    } finally {
      if (originalPlatformDescriptor) {
        Object.defineProperty(process, 'platform', originalPlatformDescriptor);
      }
    }
  });
});

async function waitForCondition(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const startedAt = Date.now();

  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Timed out waiting for condition');
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
