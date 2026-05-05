import path from 'path';
import { tmpdir } from 'os';
import { execFileSync } from 'child_process';
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

  it('restores Codex sessions from sqlite thread metadata and rollout jsonl', async () => {
    const codexDir = path.join(homeDir, '.codex');
    await fs.ensureDir(codexDir);

    const rolloutPath = path.join(codexDir, 'rollout-1.jsonl');
    await fs.writeFile(rolloutPath, [
      JSON.stringify({
        type: 'event_msg',
        timestamp: '2026-05-04T11:00:00.000Z',
        payload: {
          type: 'user_message',
          message: 'Check disk usage',
        },
      }),
      JSON.stringify({
        type: 'response_item',
        timestamp: '2026-05-04T11:01:00.000Z',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [
            { text: 'Disk usage is high in /var/log.' },
          ],
        },
      }),
    ].join('\n'), 'utf8');

    const sqlitePath = path.join(codexDir, 'state_5.sqlite');
    execFileSync('python3', ['-c', `
import sqlite3, sys
conn = sqlite3.connect(sys.argv[1])
cur = conn.cursor()
cur.execute("""
create table threads (
  id text primary key,
  rollout_path text,
  created_at integer,
  updated_at integer,
  cwd text,
  title text,
  model_provider text,
  model text,
  git_branch text,
  first_user_message text,
  archived integer default 0
)
""")
cur.execute(
  "insert into threads (id, rollout_path, created_at, updated_at, cwd, title, model_provider, model, git_branch, first_user_message, archived) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)",
  ("thread-1", sys.argv[2], 1714820400, 1714820460, "/workspace/demo", "Codex Investigation", "openai", "gpt-5-codex", "main", "Check disk usage")
)
conn.commit()
conn.close()
`, sqlitePath, rolloutPath]);

    const { SessionAggregationService } = await import('../SessionAggregationService');
    const service = new SessionAggregationService();
    (service as unknown as { homeDir: string }).homeDir = homeDir;

    const entries = await service.listSessions('/workspace', 20);
    const targetEntry = entries.find((entry) => entry.id === 'codex:thread-1');
    expect(targetEntry).toMatchObject({
      source: 'codex',
      scope: 'workspace',
      title: 'Codex Investigation',
      provider: 'openai',
      model: 'gpt-5-codex',
      gitBranch: 'main',
      preview: 'Check disk usage',
    });

    const detail = await service.getSessionDetail('codex:thread-1');
    expect(detail.messages).toEqual([
      {
        id: 'codex-0',
        role: 'user',
        content: 'Check disk usage',
        timestamp: '2026-05-04T11:00:00.000Z',
      },
      {
        id: 'codex-1',
        role: 'assistant',
        content: 'Disk usage is high in /var/log.',
        timestamp: '2026-05-04T11:01:00.000Z',
      },
    ]);
  });
});
