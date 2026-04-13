import path from 'path';
import { tmpdir } from 'os';
import { promises as fsPromises } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CodeProjectIndexService } from '../CodeProjectIndexService';

const execFileAsync = promisify(execFile);

describe('CodeProjectIndexService', () => {
  let tempProjectRoot: string;
  let tempIndexRoot: string;

  beforeEach(async () => {
    tempProjectRoot = await fsPromises.mkdtemp(path.join(tmpdir(), 'code-project-root-'));
    tempIndexRoot = await fsPromises.mkdtemp(path.join(tmpdir(), 'code-project-index-'));
  });

  afterEach(async () => {
    await fsPromises.rm(tempProjectRoot, { recursive: true, force: true });
    await fsPromises.rm(tempIndexRoot, { recursive: true, force: true });
  });

  it('warms a project, persists the index, and serves directory listings', async () => {
    const srcDirectoryPath = path.join(tempProjectRoot, 'src');
    await fsPromises.mkdir(srcDirectoryPath, { recursive: true });
    await fsPromises.mkdir(path.join(tempProjectRoot, '.hidden'), { recursive: true });
    await fsPromises.mkdir(path.join(tempProjectRoot, 'node_modules', 'pkg'), { recursive: true });
    await Promise.all([
      fsPromises.writeFile(path.join(srcDirectoryPath, 'index.ts'), 'export const value = 1;\n', 'utf-8'),
      fsPromises.writeFile(path.join(tempProjectRoot, '.env'), 'A=1\n', 'utf-8'),
      fsPromises.writeFile(path.join(tempProjectRoot, '.hidden', 'secret.txt'), 'secret\n', 'utf-8'),
      fsPromises.writeFile(path.join(tempProjectRoot, 'node_modules', 'pkg', 'index.js'), 'module.exports = {};\n', 'utf-8'),
    ]);

    const service = new CodeProjectIndexService(tempIndexRoot, undefined, { enableWatcher: false });
    await service.watchProjectForPane('pane-1', tempProjectRoot);
    await service.listDirectory({ rootPath: tempProjectRoot });
    await service.waitForIdle(tempProjectRoot);

    const rootEntries = await service.listDirectory({ rootPath: tempProjectRoot });
    expect(rootEntries).toEqual([
      expect.objectContaining({
        path: srcDirectoryPath,
        name: 'src',
        type: 'directory',
      }),
    ]);

    const hiddenEntries = await service.listDirectory({ rootPath: tempProjectRoot, includeHidden: true });
    expect(hiddenEntries.map((entry) => entry.name)).toEqual(['.hidden', 'src', '.env']);

    const searchResults = await service.searchFiles({ rootPath: tempProjectRoot, query: 'index' });
    expect(searchResults).toEqual([path.join(srcDirectoryPath, 'index.ts')]);

    const persistedProjectRoots = await fsPromises.readdir(path.join(tempIndexRoot, 'projects'));
    expect(persistedProjectRoots).toHaveLength(1);
    const persistedProjectPath = path.join(tempIndexRoot, 'projects', persistedProjectRoots[0] ?? '');
    await expect(fsPromises.stat(path.join(persistedProjectPath, 'manifest.json'))).resolves.toBeTruthy();
    await expect(fsPromises.stat(path.join(persistedProjectPath, 'index.json'))).resolves.toBeTruthy();

    await service.destroy();

    const restartedService = new CodeProjectIndexService(tempIndexRoot, undefined, { enableWatcher: false });
    await restartedService.watchProjectForPane('pane-2', tempProjectRoot);
    const restartedEntries = await restartedService.listDirectory({ rootPath: tempProjectRoot });
    expect(restartedEntries).toEqual([
      expect.objectContaining({
        path: srcDirectoryPath,
        name: 'src',
        type: 'directory',
      }),
    ]);
    await restartedService.destroy();
  });

  it('applies incremental file and directory changes through watcher notifications', async () => {
    const srcDirectoryPath = path.join(tempProjectRoot, 'src');
    const initialFilePath = path.join(srcDirectoryPath, 'index.ts');
    await fsPromises.mkdir(srcDirectoryPath, { recursive: true });
    await fsPromises.writeFile(initialFilePath, 'export const value = 1;\n', 'utf-8');

    const service = new CodeProjectIndexService(tempIndexRoot, undefined, { enableWatcher: false });
    await service.watchProjectForPane('pane-1', tempProjectRoot);
    await service.listDirectory({ rootPath: tempProjectRoot });
    await service.waitForIdle(tempProjectRoot);

    const addedFilePath = path.join(srcDirectoryPath, 'new-file.ts');
    await fsPromises.writeFile(addedFilePath, 'export const added = true;\n', 'utf-8');
    await service.notifyChanges(tempProjectRoot, [{ type: 'add', path: addedFilePath }]);
    await service.waitForIdle(tempProjectRoot);

    const afterAddResults = await service.searchFiles({ rootPath: tempProjectRoot, query: 'new-file' });
    expect(afterAddResults).toEqual([addedFilePath]);

    const libDirectoryPath = path.join(tempProjectRoot, 'lib');
    const libFilePath = path.join(libDirectoryPath, 'util.ts');
    await fsPromises.mkdir(libDirectoryPath, { recursive: true });
    await fsPromises.writeFile(libFilePath, 'export const util = true;\n', 'utf-8');
    await service.notifyChanges(tempProjectRoot, [{ type: 'addDir', path: libDirectoryPath }]);
    await service.waitForIdle(tempProjectRoot);

    const afterDirectoryAddResults = await service.searchFiles({ rootPath: tempProjectRoot, query: 'util' });
    expect(afterDirectoryAddResults).toEqual([libFilePath]);

    await fsPromises.rm(libDirectoryPath, { recursive: true, force: true });
    await service.notifyChanges(tempProjectRoot, [{ type: 'unlinkDir', path: libDirectoryPath }]);
    await service.waitForIdle(tempProjectRoot);

    const afterDirectoryRemoveResults = await service.searchFiles({ rootPath: tempProjectRoot, query: 'util' });
    expect(afterDirectoryRemoveResults).toEqual([]);

    await fsPromises.rm(addedFilePath, { force: true });
    await service.notifyChanges(tempProjectRoot, [{ type: 'unlink', path: addedFilePath }]);
    await service.waitForIdle(tempProjectRoot);

    const srcEntries = await service.listDirectory({
      rootPath: tempProjectRoot,
      targetPath: srcDirectoryPath,
    });
    expect(srcEntries.map((entry) => entry.path)).toEqual([initialFilePath]);

    await service.destroy();
  });

  it('reuses a persisted index when reopening the same project', async () => {
    const sourceFilePath = path.join(tempProjectRoot, 'src', 'index.ts');
    await fsPromises.mkdir(path.dirname(sourceFilePath), { recursive: true });
    await fsPromises.writeFile(sourceFilePath, 'export const value = 1;\n', 'utf-8');

    const initialService = new CodeProjectIndexService(tempIndexRoot, undefined, { enableWatcher: false });
    await initialService.watchProjectForPane('pane-1', tempProjectRoot);
    await initialService.waitForIdle(tempProjectRoot);
    await initialService.destroy();

    const progressEvents: Array<{ paneId: string; state: string }> = [];
    const reopenedService = new CodeProjectIndexService(tempIndexRoot, (payload) => {
      progressEvents.push({
        paneId: payload.paneId,
        state: payload.state,
      });
    }, { enableWatcher: false });

    await reopenedService.watchProjectForPane('pane-2', tempProjectRoot);

    expect(progressEvents).toContainEqual({
      paneId: 'pane-2',
      state: 'ready',
    });
    expect(progressEvents).not.toContainEqual({
      paneId: 'pane-2',
      state: 'building',
    });

    const results = await reopenedService.searchFiles({ rootPath: tempProjectRoot, query: 'index' });
    expect(results).toEqual([sourceFilePath]);

    await reopenedService.destroy();
  });

  it('ignores common Maven and IDE output directories during indexing', async () => {
    const srcDirectoryPath = path.join(tempProjectRoot, 'src', 'main', 'java');
    await fsPromises.mkdir(srcDirectoryPath, { recursive: true });
    await fsPromises.mkdir(path.join(tempProjectRoot, 'target', 'classes', 'com', 'example'), { recursive: true });
    await fsPromises.mkdir(path.join(tempProjectRoot, '.idea'), { recursive: true });
    await fsPromises.mkdir(path.join(tempProjectRoot, '.gradle', '8.0'), { recursive: true });
    await Promise.all([
      fsPromises.writeFile(path.join(srcDirectoryPath, 'App.java'), 'class App {}\n', 'utf-8'),
      fsPromises.writeFile(path.join(tempProjectRoot, 'target', 'classes', 'com', 'example', 'App.class'), 'bytecode', 'utf-8'),
      fsPromises.writeFile(path.join(tempProjectRoot, '.idea', 'workspace.xml'), '<workspace />\n', 'utf-8'),
      fsPromises.writeFile(path.join(tempProjectRoot, '.gradle', '8.0', 'gc.properties'), 'state=true\n', 'utf-8'),
    ]);

    const service = new CodeProjectIndexService(tempIndexRoot, undefined, { enableWatcher: false });
    await service.watchProjectForPane('pane-1', tempProjectRoot);
    await service.waitForIdle(tempProjectRoot);

    const rootEntries = await service.listDirectory({ rootPath: tempProjectRoot, includeHidden: true });
    expect(rootEntries.map((entry) => entry.name)).toEqual(['src']);

    const sourceResults = await service.searchFiles({ rootPath: tempProjectRoot, query: 'app.java' });
    expect(sourceResults).toEqual([path.join(srcDirectoryPath, 'App.java')]);

    const classResults = await service.searchFiles({ rootPath: tempProjectRoot, query: 'app.class' });
    expect(classResults).toEqual([]);

    await service.destroy();
  });

  it('keeps the pane root as the indexed project root even inside a larger git repository', async () => {
    const nestedProjectRoot = path.join(tempProjectRoot, 'services', 'orders');
    const nestedSourceFilePath = path.join(nestedProjectRoot, 'src', 'main', 'java', 'OrdersApp.java');
    const siblingFilePath = path.join(tempProjectRoot, 'shared', 'Shared.java');
    await fsPromises.mkdir(path.dirname(nestedSourceFilePath), { recursive: true });
    await fsPromises.mkdir(path.dirname(siblingFilePath), { recursive: true });
    await Promise.all([
      fsPromises.writeFile(path.join(nestedProjectRoot, 'pom.xml'), '<project />\n', 'utf-8'),
      fsPromises.writeFile(nestedSourceFilePath, 'class OrdersApp {}\n', 'utf-8'),
      fsPromises.writeFile(siblingFilePath, 'class Shared {}\n', 'utf-8'),
    ]);
    await execFileAsync('git', ['init'], { cwd: tempProjectRoot });

    const service = new CodeProjectIndexService(tempIndexRoot, undefined, { enableWatcher: false });
    await service.watchProjectForPane('pane-1', nestedProjectRoot);
    await service.waitForIdle(nestedProjectRoot);

    const persistedProjectRoots = await fsPromises.readdir(path.join(tempIndexRoot, 'projects'));
    expect(persistedProjectRoots).toHaveLength(1);
    const persistedProjectPath = path.join(tempIndexRoot, 'projects', persistedProjectRoots[0] ?? '');
    const manifest = JSON.parse(
      await fsPromises.readFile(path.join(persistedProjectPath, 'manifest.json'), 'utf-8'),
    ) as { projectRootPath: string };
    const index = JSON.parse(
      await fsPromises.readFile(path.join(persistedProjectPath, 'index.json'), 'utf-8'),
    ) as { files: string[] };

    expect(manifest.projectRootPath).toBe(nestedProjectRoot);
    expect(index.files).toEqual(['pom.xml', 'src/main/java/OrdersApp.java']);
    expect(index.files).not.toContain('shared/Shared.java');

    await service.destroy();
  });
});
