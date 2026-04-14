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

  it('expands pytest parametrized cases into individual runnable items', async () => {
    const filePath = path.join(tempRootPath, 'tests', 'test_params.py');
    await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
    await fsPromises.writeFile(
      filePath,
      [
        'import pytest',
        '',
        '@pytest.mark.parametrize("value", ["alpha", "beta"], ids=["a", "b"])',
        'def test_value(value):',
        '    assert value',
        '',
      ].join('\n'),
      'utf8',
    );

    const items = await testService.listTests({
      rootPath: tempRootPath,
      activeFilePath: filePath,
    });

    expect(items[0]).toMatchObject({
      label: 'test_params.py',
      children: expect.arrayContaining([
        expect.objectContaining({ label: 'test_value[a]' }),
        expect.objectContaining({ label: 'test_value[b]' }),
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

  it('detects Go benchmarks and examples as runnable test items', async () => {
    const filePath = path.join(tempRootPath, 'pkg', 'service_test.go');
    await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
    await fsPromises.writeFile(
      filePath,
      [
        'package pkg',
        '',
        'import "testing"',
        '',
        'func TestService(t *testing.T) {}',
        'func BenchmarkService(b *testing.B) {}',
        'func ExampleService() {}',
        '',
      ].join('\n'),
      'utf8',
    );

    const items = await testService.listTests({
      rootPath: tempRootPath,
      activeFilePath: filePath,
    });

    expect(items[0]).toMatchObject({
      label: 'service_test.go',
      children: expect.arrayContaining([
        expect.objectContaining({ label: 'TestService' }),
        expect.objectContaining({ label: 'BenchmarkService' }),
        expect.objectContaining({ label: 'ExampleService' }),
      ]),
    });
  });
});
