import path from 'path';
import { tmpdir } from 'os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('SessionAggregationService', () => {
  let homeDir: string;

  beforeEach(async () => {
    homeDir = await fs.mkdtemp(path.join(tmpdir(), 'session-aggregation-service-'));
  });

  afterEach(async () => {
    await fs.remove(homeDir);
    vi.resetModules();
  });

  it('lists and restores Claude sessions when role/content are stored in payload fields', async () => {
    const projectsDir = path.join(homeDir, '.claude', 'projects', 'demo');
    await fs.ensureDir(projectsDir);

    const sessionPath = path.join(projectsDir, 'session-1.jsonl');
    await fs.writeFile(sessionPath, [
      JSON.stringify({
        timestamp: '2026-05-04T10:00:00.000Z',
        cwd: '/workspace/demo',
        payload: {
          role: 'user',
          message: 'Check nginx logs',
        },
      }),
      JSON.stringify({
        timestamp: '2026-05-04T10:01:00.000Z',
        payload: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Inspect disk usage first.' },
          ],
        },
      }),
    ].join('\n'), 'utf8');

    const { SessionAggregationService } = await import('../SessionAggregationService');
    const service = new SessionAggregationService();
    (service as unknown as { homeDir: string }).homeDir = homeDir;

    const entries = await service.listSessions('/workspace', 10);
    const targetEntry = entries.find((entry) => entry.id === `claude-code:${sessionPath}`);
    expect(targetEntry).toBeTruthy();
    expect(targetEntry).toMatchObject({
      source: 'claude-code',
      scope: 'workspace',
      title: 'Check nginx logs',
      preview: 'Check nginx logs',
      restoreKind: 'history-only',
    });

    const detail = await service.getSessionDetail(`claude-code:${sessionPath}`);
    expect(detail.messages).toEqual([
      {
        id: 'claude-0',
        role: 'user',
        content: 'Check nginx logs',
        timestamp: '2026-05-04T10:00:00.000Z',
        model: undefined,
      },
      {
        id: 'claude-1',
        role: 'assistant',
        content: 'Inspect disk usage first.',
        timestamp: '2026-05-04T10:01:00.000Z',
        model: undefined,
      },
    ]);

    const restored = await service.restoreSession(`claude-code:${sessionPath}`);
    expect(restored).toMatchObject({
      conversationId: `aggregated-claude-code:${sessionPath}`,
      title: 'Check nginx logs',
      restoreKind: 'history-only',
    });
    expect(restored.messages).toHaveLength(2);
  });

  it('ignores malformed Claude jsonl rows instead of failing the whole session', async () => {
    const projectsDir = path.join(homeDir, '.claude', 'projects', 'demo');
    await fs.ensureDir(projectsDir);

    const sessionPath = path.join(projectsDir, 'session-2.jsonl');
    await fs.writeFile(sessionPath, [
      '{not-json',
      JSON.stringify({
        timestamp: '2026-05-04T10:02:00.000Z',
        message: {
          role: 'user',
          content: 'Healthy row',
        },
      }),
    ].join('\n'), 'utf8');

    const { SessionAggregationService } = await import('../SessionAggregationService');
    const service = new SessionAggregationService();
    (service as unknown as { homeDir: string }).homeDir = homeDir;

    const detail = await service.getSessionDetail(`claude-code:${sessionPath}`);
    expect(detail.messages).toHaveLength(1);
    expect(detail.messages[0]?.content).toBe('Healthy row');
  });
});
