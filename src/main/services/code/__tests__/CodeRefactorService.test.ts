import path from 'path';
import { promises as fsPromises } from 'fs';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CodeFileService } from '../CodeFileService';
import { CodeRefactorService } from '../CodeRefactorService';
import type { LanguageFeatureService } from '../../language/LanguageFeatureService';

describe('CodeRefactorService', () => {
  let workspaceRootPath: string;
  let fooFilePath: string;
  let barFilePath: string;
  let appFilePath: string;
  let service: CodeRefactorService;

  beforeEach(async () => {
    workspaceRootPath = await fsPromises.mkdtemp(path.join(tmpdir(), 'code-refactor-service-'));
    fooFilePath = path.join(workspaceRootPath, 'src', 'main', 'java', 'com', 'acme', 'Foo.java');
    barFilePath = path.join(workspaceRootPath, 'src', 'main', 'java', 'com', 'acme', 'Bar.java');
    appFilePath = path.join(workspaceRootPath, 'src', 'main', 'java', 'com', 'acme', 'App.java');

    await fsPromises.mkdir(path.dirname(fooFilePath), { recursive: true });
    await fsPromises.writeFile(fooFilePath, [
      'package com.acme;',
      '',
      'public class Foo {',
      '  public Foo() {}',
      '}',
      '',
    ].join('\n'), 'utf-8');
    await fsPromises.writeFile(appFilePath, [
      'package com.acme;',
      '',
      'import com.acme.Foo;',
      '',
      'public class App {',
      '  private final Foo foo = new Foo();',
      '}',
      '',
    ].join('\n'), 'utf-8');

    service = new CodeRefactorService({
      codeFileService: new CodeFileService(),
      languageFeatureService: {
        renameSymbol: vi.fn(),
        runCodeAction: vi.fn(),
      } as unknown as LanguageFeatureService,
    });
  });

  afterEach(async () => {
    await fsPromises.rm(workspaceRootPath, { recursive: true, force: true });
  });

  it('previews and applies a Java rename-path refactor with follow-up edits', async () => {
    const preview = await service.prepareRefactor({
      kind: 'rename-path',
      rootPath: workspaceRootPath,
      filePath: fooFilePath,
      nextFilePath: barFilePath,
    }, null);

    expect(preview.stats).toMatchObject({
      renameCount: 1,
      modifyCount: 1,
    });
    expect(preview.warnings?.length).toBeGreaterThan(0);

    const movedFile = preview.files.find((file) => file.targetFilePath === barFilePath);
    expect(movedFile).toBeTruthy();
    expect(movedFile?.afterContent).toContain('public class Bar');

    const dependentFile = preview.files.find((file) => file.filePath === appFilePath);
    expect(dependentFile?.afterContent).toContain('import com.acme.Bar;');

    const appliedPreview = await service.applyRefactor({
      previewId: preview.id,
    });

    expect(appliedPreview.id).toBe(preview.id);
    await expect(fsPromises.stat(fooFilePath)).rejects.toThrow();
    expect(await fsPromises.readFile(barFilePath, 'utf-8')).toContain('public class Bar');
    expect(await fsPromises.readFile(appFilePath, 'utf-8')).toContain('import com.acme.Bar;');
  });

  it('adds warnings when safe-delete would remove referenced Java files', async () => {
    const preview = await service.prepareRefactor({
      kind: 'safe-delete',
      rootPath: workspaceRootPath,
      filePath: fooFilePath,
    }, null);

    expect(preview.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('com.acme.Foo'),
    ]));
  });
});
