import path from 'path';
import { tmpdir } from 'os';
import { promises as fsPromises } from 'fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CodeRunProfileService } from '../CodeRunProfileService';
import { CodeTestService } from '../CodeTestService';

describe('CodeTestService', () => {
  let tempRootPath: string;
  let testService: CodeTestService;

  beforeEach(async () => {
    tempRootPath = await fsPromises.mkdtemp(path.join(tmpdir(), 'code-test-service-'));
    const runProfileService = new CodeRunProfileService({
      emitSessionChanged: () => {},
      emitSessionOutput: () => {},
      now: () => '2026-04-13T00:00:00.000Z',
    });
    testService = new CodeTestService({
      runProfileService,
    });
  });

  afterEach(async () => {
    await fsPromises.rm(tempRootPath, { recursive: true, force: true });
  });

  it('builds a Python test tree with suite and case targets for the active file', async () => {
    const filePath = path.join(tempRootPath, 'tests', 'test_service.py');
    await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
    await fsPromises.writeFile(
      filePath,
      [
        'class TestService:',
        '    def test_handles_request(self):',
        '        assert True',
        '',
        'def test_top_level():',
        '    assert True',
        '',
      ].join('\n'),
      'utf8',
    );

    const items = await testService.listTests({
      rootPath: tempRootPath,
      activeFilePath: filePath,
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      label: 'test_service.py',
      kind: 'file',
      filePath,
      runnableTargetId: expect.any(String),
      children: expect.arrayContaining([
        expect.objectContaining({
          label: 'TestService',
          kind: 'suite',
          runnableTargetId: expect.any(String),
          children: [
            expect.objectContaining({
              label: 'test_handles_request',
              kind: 'case',
              runnableTargetId: expect.any(String),
            }),
          ],
        }),
        expect.objectContaining({
          label: 'test_top_level',
          kind: 'case',
          runnableTargetId: expect.any(String),
        }),
      ]),
    });
  });

  it('builds a Java test tree with suite and case targets', async () => {
    const filePath = path.join(tempRootPath, 'src', 'test', 'java', 'com', 'example', 'ServiceTest.java');
    await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
    await fsPromises.writeFile(
      filePath,
      [
        'package com.example;',
        'import org.junit.jupiter.api.Test;',
        'class ServiceTest {',
        '  @Test',
        '  void loadsContext() {}',
        '',
        '  @Test',
        '  void savesEntity() {}',
        '}',
        '',
      ].join('\n'),
      'utf8',
    );

    const items = await testService.listTests({
      rootPath: tempRootPath,
      activeFilePath: filePath,
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      label: 'ServiceTest.java',
      kind: 'file',
      filePath,
      runnableTargetId: expect.any(String),
      children: [
        expect.objectContaining({
          label: 'ServiceTest',
          kind: 'suite',
          runnableTargetId: expect.any(String),
          children: expect.arrayContaining([
            expect.objectContaining({
              label: 'loadsContext',
              kind: 'case',
              runnableTargetId: expect.any(String),
            }),
            expect.objectContaining({
              label: 'savesEntity',
              kind: 'case',
              runnableTargetId: expect.any(String),
            }),
          ]),
        }),
      ],
    });
  });
});
