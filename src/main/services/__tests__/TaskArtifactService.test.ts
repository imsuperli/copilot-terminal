import path from 'path';
import { tmpdir } from 'os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from 'electron';
import { TaskArtifactService } from '../TaskArtifactService';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp'),
  },
}));

describe('TaskArtifactService', () => {
  let rootPath: string;
  let service: TaskArtifactService;

  beforeEach(async () => {
    rootPath = await fs.mkdtemp(path.join(tmpdir(), 'task-artifact-service-'));
    vi.mocked(app.getPath).mockReturnValue(rootPath);
    service = new TaskArtifactService();
  });

  afterEach(async () => {
    await fs.remove(rootPath);
  });

  it('saves markdown artifacts, lists them by conversation, and deletes them', async () => {
    const record = await service.saveArtifact({
      kind: 'conversation',
      title: 'Nginx / Disk Report',
      workspaceId: 'workspace-1',
      windowId: 'win-1',
      paneId: 'pane-1',
      conversationId: 'conv-1',
      markdown: '# report',
      preview: 'disk + logs',
    });

    expect(record.filePath).toContain(path.join('artifacts', 'workspace-1', 'conv-1'));
    expect(record.filePath).toMatch(/Nginx-Disk-Report-.*\.md$/);
    expect(await fs.pathExists(record.filePath)).toBe(true);

    const listed = await service.listArtifacts({
      conversationId: 'conv-1',
      paneId: 'pane-1',
    });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(record.id);

    await service.deleteArtifact(record.id);
    expect(await fs.pathExists(record.filePath)).toBe(false);
    expect(await service.listArtifacts({ conversationId: 'conv-1' })).toEqual([]);
  });
});
