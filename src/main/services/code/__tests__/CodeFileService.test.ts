import path from 'path';
import { tmpdir } from 'os';
import { promises as fsPromises } from 'fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CODE_PANE_BINARY_FILE_ERROR_CODE,
  CODE_PANE_SAVE_CONFLICT_ERROR_CODE,
} from '../../../../shared/types/electron-api';
import { CodeFileService } from '../CodeFileService';

describe('CodeFileService', () => {
  const service = new CodeFileService();
  let tempRootPath: string;

  beforeEach(async () => {
    tempRootPath = await fsPromises.mkdtemp(path.join(tmpdir(), 'code-file-service-'));
  });

  afterEach(async () => {
    await fsPromises.rm(tempRootPath, { recursive: true, force: true });
  });

  it('lists, reads, writes, and searches text files within the root', async () => {
    const nestedDirectoryPath = path.join(tempRootPath, 'src');
    const filePath = path.join(nestedDirectoryPath, 'index.ts');
    await fsPromises.mkdir(nestedDirectoryPath, { recursive: true });
    await fsPromises.writeFile(filePath, 'export const value = 1;\n', 'utf-8');

    const rootEntries = await service.listDirectory({ rootPath: tempRootPath });
    expect(rootEntries).toHaveLength(1);
    expect(rootEntries[0]).toMatchObject({
      path: nestedDirectoryPath,
      type: 'directory',
    });

    const fileResult = await service.readFile({ rootPath: tempRootPath, filePath });
    expect(fileResult.content).toContain('value = 1');
    expect(fileResult.language).toBe('typescript');

    const writeResult = await service.writeFile({
      rootPath: tempRootPath,
      filePath,
      content: 'export const value = 2;\n',
      expectedMtimeMs: fileResult.mtimeMs,
    });
    expect(writeResult.mtimeMs).toBeGreaterThanOrEqual(fileResult.mtimeMs);

    const searchResults = await service.searchFiles({ rootPath: tempRootPath, query: 'index' });
    expect(searchResults).toEqual([filePath]);
  });

  it('rejects binary files and detects save conflicts', async () => {
    const binaryFilePath = path.join(tempRootPath, 'image.bin');
    await fsPromises.writeFile(binaryFilePath, Buffer.from([0x00, 0xff, 0x41]));

    const binaryResult = await service.readFile({ rootPath: tempRootPath, filePath: binaryFilePath }).catch((error) => error);
    expect(binaryResult).toBeInstanceOf(Error);
    expect((binaryResult as Error & { ipcErrorCode?: string }).ipcErrorCode).toBe(CODE_PANE_BINARY_FILE_ERROR_CODE);

    const textFilePath = path.join(tempRootPath, 'notes.txt');
    await fsPromises.writeFile(textFilePath, 'first version\n', 'utf-8');
    const firstRead = await service.readFile({ rootPath: tempRootPath, filePath: textFilePath });

    await new Promise((resolve) => setTimeout(resolve, 20));
    await fsPromises.writeFile(textFilePath, 'external update\n', 'utf-8');

    const conflictResult = await service.writeFile({
      rootPath: tempRootPath,
      filePath: textFilePath,
      content: 'local change\n',
      expectedMtimeMs: firstRead.mtimeMs,
    }).catch((error) => error);

    expect(conflictResult).toBeInstanceOf(Error);
    expect((conflictResult as Error & { ipcErrorCode?: string }).ipcErrorCode).toBe(CODE_PANE_SAVE_CONFLICT_ERROR_CODE);
  });

  it('prioritizes exact and shorter path matches in search results', async () => {
    const exactRootPath = path.join(tempRootPath, 'index.ts');
    const nestedExactPath = path.join(tempRootPath, 'src', 'index.ts');
    const prefixPath = path.join(tempRootPath, 'src', 'indexer.ts');
    const containsPath = path.join(tempRootPath, 'src', 'app-index.ts');

    await fsPromises.mkdir(path.join(tempRootPath, 'src'), { recursive: true });
    await Promise.all([
      fsPromises.writeFile(exactRootPath, 'export const root = true;\n', 'utf-8'),
      fsPromises.writeFile(nestedExactPath, 'export const nested = true;\n', 'utf-8'),
      fsPromises.writeFile(prefixPath, 'export const prefix = true;\n', 'utf-8'),
      fsPromises.writeFile(containsPath, 'export const contains = true;\n', 'utf-8'),
    ]);

    const searchResults = await service.searchFiles({ rootPath: tempRootPath, query: 'index' });
    expect(searchResults.slice(0, 4)).toEqual([
      exactRootPath,
      nestedExactPath,
      prefixPath,
      containsPath,
    ]);
  });
});
