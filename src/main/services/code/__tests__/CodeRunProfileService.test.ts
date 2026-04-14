import path from 'path';
import { tmpdir } from 'os';
import { promises as fsPromises } from 'fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  CodePaneRunSessionChangedPayload,
  CodePaneRunSessionOutputPayload,
} from '../../../../shared/types/electron-api';
import { CodeRunProfileService } from '../CodeRunProfileService';

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
