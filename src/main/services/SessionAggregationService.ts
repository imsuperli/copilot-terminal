import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import type { ChatMessage, RestoreAggregatedSessionResult } from '../../shared/types/chat';
import type {
  AggregatedSessionDetail,
  AggregatedSessionEntry,
  AggregatedSessionMessage,
} from '../../shared/types/task';

interface CodexThreadRow {
  id: string;
  rollout_path: string;
  created_at: number;
  updated_at: number;
  cwd: string;
  title: string;
  model_provider?: string | null;
  model?: string | null;
  git_branch?: string | null;
  first_user_message?: string | null;
}

interface ClaudeJsonlEvent {
  type?: string;
  timestamp?: string;
  cwd?: string;
  gitBranch?: string;
  sessionId?: string;
  message?: {
    role?: 'user' | 'assistant' | 'system';
    content?: string | Array<{ type?: string; text?: string }>;
    model?: string;
  };
  payload?: {
    id?: string;
    type?: string;
    role?: 'user' | 'assistant' | 'system';
    cwd?: string;
    model?: string;
    title?: string;
    message?: string;
    content?: Array<{ type?: string; text?: string }>;
  };
}

function normalizePreview(value: string | undefined, maxLength = 160): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return undefined;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function pathExistsSafe(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function isPathInWorkspace(candidatePath: string | undefined, workspaceCwd: string | undefined): boolean {
  if (!candidatePath || !workspaceCwd) {
    return false;
  }

  const normalizedCandidate = path.resolve(candidatePath);
  const normalizedWorkspace = path.resolve(workspaceCwd);
  return normalizedCandidate === normalizedWorkspace || normalizedCandidate.startsWith(`${normalizedWorkspace}${path.sep}`);
}

function createMessageId(prefix: string, index: number): string {
  return `${prefix}-${index}`;
}

function normalizeChatMessage(message: AggregatedSessionMessage): ChatMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: message.timestamp,
    model: message.model,
  };
}

export class SessionAggregationService {
  private readonly homeDir = os.homedir();

  async listSessions(workspaceCwd?: string, limit = 80): Promise<AggregatedSessionEntry[]> {
    const [claudeEntries, codexEntries] = await Promise.all([
      this.listClaudeSessions(workspaceCwd),
      this.listCodexSessions(workspaceCwd),
    ]);

    return [...claudeEntries, ...codexEntries]
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, Math.max(1, limit));
  }

  async getSessionDetail(entryId: string): Promise<AggregatedSessionDetail> {
    const [source, ...rest] = entryId.split(':');
    if (source === 'claude-code') {
      return await this.getClaudeSessionDetail(rest.join(':'));
    }

    if (source === 'codex') {
      return await this.getCodexSessionDetail(rest.join(':'));
    }

    throw new Error(`Unsupported aggregated session source: ${entryId}`);
  }

  async restoreSession(entryId: string): Promise<RestoreAggregatedSessionResult> {
    const detail = await this.getSessionDetail(entryId);
    return {
      conversationId: `aggregated-${detail.entry.id}`,
      title: detail.entry.title,
      restoreKind: detail.entry.restoreKind,
      messages: detail.messages.map(normalizeChatMessage),
      metadata: detail.metadata,
    };
  }

  private async listClaudeSessions(workspaceCwd?: string): Promise<AggregatedSessionEntry[]> {
    const projectsRoot = path.join(this.homeDir, '.claude', 'projects');
    if (!pathExistsSafe(projectsRoot)) {
      return [];
    }

    const filePaths = await this.collectFiles(projectsRoot, '.jsonl', 120);
    const entries: AggregatedSessionEntry[] = [];

    for (const filePath of filePaths) {
      try {
        const stat = await fs.stat(filePath);
        const lines = (await fs.readFile(filePath, 'utf8'))
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);
        if (lines.length === 0) {
          continue;
        }

        let title = path.basename(filePath, '.jsonl');
        let cwd: string | undefined;
        let gitBranch: string | undefined;
        let preview: string | undefined;
        let messageCount = 0;

        for (const line of lines) {
          let event: ClaudeJsonlEvent;
          try {
            event = JSON.parse(line) as ClaudeJsonlEvent;
          } catch {
            continue;
          }

          if (!cwd && typeof event.cwd === 'string') {
            cwd = event.cwd;
          }
          if (!gitBranch && typeof event.gitBranch === 'string') {
            gitBranch = event.gitBranch;
          }
          const content = this.extractClaudeContent(event);
          if (content) {
            messageCount += 1;
            if (!preview) {
              preview = normalizePreview(content);
            }
            if (title === path.basename(filePath, '.jsonl') && event.message?.role === 'user') {
              title = normalizePreview(content, 72) ?? title;
            }
          }
        }

        const scope = isPathInWorkspace(cwd, workspaceCwd) ? 'workspace' : 'user';
        entries.push({
          id: `claude-code:${filePath}`,
          source: 'claude-code',
          scope,
          title,
          updatedAt: stat.mtimeMs,
          createdAt: stat.birthtimeMs || stat.mtimeMs,
          cwd,
          gitBranch,
          preview,
          messageCount,
          filePath,
          sourceLabel: 'Claude Code',
          restoreKind: 'history-only',
        });
      } catch {
        continue;
      }
    }

    return entries;
  }

  private async getClaudeSessionDetail(filePath: string): Promise<AggregatedSessionDetail> {
    const lines = (await fs.readFile(filePath, 'utf8'))
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const messages: AggregatedSessionMessage[] = [];
    let cwd: string | undefined;
    let gitBranch: string | undefined;
    let title = path.basename(filePath, '.jsonl');

    for (const [index, line] of lines.entries()) {
      let event: ClaudeJsonlEvent;
      try {
        event = JSON.parse(line) as ClaudeJsonlEvent;
      } catch {
        continue;
      }

      if (!cwd && typeof event.cwd === 'string') {
        cwd = event.cwd;
      }
      if (!gitBranch && typeof event.gitBranch === 'string') {
        gitBranch = event.gitBranch;
      }

      const role = event.message?.role;
      const content = this.extractClaudeContent(event);
      const timestamp = event.timestamp;
      if (role && content && timestamp) {
        if (role === 'user' && title === path.basename(filePath, '.jsonl')) {
          title = normalizePreview(content, 72) ?? title;
        }
        messages.push({
          id: createMessageId('claude', index),
          role,
          content,
          timestamp,
          model: event.message?.model,
        });
      }
    }

    const stat = await fs.stat(filePath);
    return {
      entry: {
        id: `claude-code:${filePath}`,
        source: 'claude-code',
        scope: 'user',
        title,
        updatedAt: stat.mtimeMs,
        createdAt: stat.birthtimeMs || stat.mtimeMs,
        cwd,
        gitBranch,
        preview: normalizePreview(messages.at(-1)?.content ?? messages[0]?.content),
        messageCount: messages.length,
        filePath,
        sourceLabel: 'Claude Code',
        restoreKind: 'history-only',
      },
      messages,
      metadata: {
        cwd,
        gitBranch,
      },
    };
  }

  private extractClaudeContent(event: ClaudeJsonlEvent): string | undefined {
    const directContent = event.message?.content;
    if (typeof directContent === 'string') {
      return directContent;
    }
    if (Array.isArray(directContent)) {
      const joined = directContent
        .map((item) => item?.text ?? '')
        .filter(Boolean)
        .join('\n')
        .trim();
      if (joined) {
        return joined;
      }
    }

    const payload = event.payload;
    if (typeof payload?.message === 'string') {
      return payload.message;
    }
    if (Array.isArray(payload?.content)) {
      const joined = payload.content
        .map((item) => item?.text ?? '')
        .filter(Boolean)
        .join('\n')
        .trim();
      if (joined) {
        return joined;
      }
    }
    return undefined;
  }

  private async listCodexSessions(workspaceCwd?: string): Promise<AggregatedSessionEntry[]> {
    const sqlitePath = await this.resolveNewestExisting([
      path.join(this.homeDir, '.codex', 'state_5.sqlite'),
      path.join(this.homeDir, '.codex', 'state_4.sqlite'),
      path.join(this.homeDir, '.codex', 'state.sqlite'),
    ]);
    if (!sqlitePath) {
      return [];
    }

    const rows = await this.queryCodexThreads(sqlitePath);
    return rows.map((row) => ({
      id: `codex:${row.id}`,
      source: 'codex',
      scope: isPathInWorkspace(row.cwd, workspaceCwd) ? 'workspace' : 'user',
      title: row.title || normalizePreview(row.first_user_message ?? '', 72) || row.id,
      updatedAt: row.updated_at * 1000,
      createdAt: row.created_at * 1000,
      cwd: row.cwd,
      gitBranch: row.git_branch ?? undefined,
      model: row.model ?? undefined,
      provider: row.model_provider ?? undefined,
      preview: normalizePreview(row.first_user_message ?? undefined),
      filePath: row.rollout_path,
      sourceLabel: 'Codex CLI',
      restoreKind: 'history-only',
    }));
  }

  private async getCodexSessionDetail(threadId: string): Promise<AggregatedSessionDetail> {
    const sqlitePath = await this.resolveNewestExisting([
      path.join(this.homeDir, '.codex', 'state_5.sqlite'),
      path.join(this.homeDir, '.codex', 'state_4.sqlite'),
      path.join(this.homeDir, '.codex', 'state.sqlite'),
    ]);
    if (!sqlitePath) {
      throw new Error('Codex state database was not found');
    }

    const rows = await this.queryCodexThreads(sqlitePath, threadId);
    const row = rows[0];
    if (!row) {
      throw new Error(`Codex thread was not found: ${threadId}`);
    }

    const rolloutPath = row.rollout_path;
    const messages = await this.parseCodexRolloutMessages(rolloutPath);
    return {
      entry: {
        id: `codex:${row.id}`,
        source: 'codex',
        scope: 'user',
        title: row.title || normalizePreview(row.first_user_message ?? '', 72) || row.id,
        updatedAt: row.updated_at * 1000,
        createdAt: row.created_at * 1000,
        cwd: row.cwd,
        gitBranch: row.git_branch ?? undefined,
        model: row.model ?? undefined,
        provider: row.model_provider ?? undefined,
        preview: normalizePreview(messages.at(-1)?.content ?? messages[0]?.content),
        messageCount: messages.length,
        filePath: rolloutPath,
        sourceLabel: 'Codex CLI',
        restoreKind: 'history-only',
      },
      messages,
      metadata: {
        cwd: row.cwd,
        gitBranch: row.git_branch ?? undefined,
        model: row.model ?? undefined,
      },
    };
  }

  private async parseCodexRolloutMessages(filePath: string): Promise<AggregatedSessionMessage[]> {
    if (!pathExistsSafe(filePath)) {
      return [];
    }

    const lines = (await fs.readFile(filePath, 'utf8'))
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const messages: AggregatedSessionMessage[] = [];

    for (const [index, line] of lines.entries()) {
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }

      const payload = event.payload as Record<string, unknown> | undefined;
      const eventType = typeof event.type === 'string' ? event.type : undefined;
      const timestamp = typeof event.timestamp === 'string' ? event.timestamp : new Date().toISOString();

      if (eventType === 'event_msg' && payload?.type === 'user_message' && typeof payload.message === 'string') {
        messages.push({
          id: createMessageId('codex', index),
          role: 'user',
          content: payload.message,
          timestamp,
        });
        continue;
      }

      if (eventType === 'event_msg' && payload?.type === 'agent_message' && typeof payload.message === 'string') {
        messages.push({
          id: createMessageId('codex', index),
          role: 'assistant',
          content: payload.message,
          timestamp,
        });
        continue;
      }

      if (eventType === 'response_item' && payload?.type === 'message') {
        const role = payload.role;
        const content = Array.isArray(payload.content)
          ? payload.content
            .map((item) => (
              item && typeof item === 'object' && 'text' in item ? String((item as { text?: unknown }).text ?? '') : ''
            ))
            .filter(Boolean)
            .join('\n')
            .trim()
          : '';
        if (
          (role === 'user' || role === 'assistant' || role === 'system')
          && content
        ) {
          messages.push({
            id: createMessageId('codex', index),
            role,
            content,
            timestamp,
          });
        }
      }
    }

    return messages;
  }

  private async queryCodexThreads(sqlitePath: string, threadId?: string): Promise<CodexThreadRow[]> {
    const script = `
import os
import sqlite3
import json
import sys

db_path = sys.argv[1]
thread_id = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] else None
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cur = conn.cursor()
if thread_id:
    rows = cur.execute(
        "select id, rollout_path, created_at, updated_at, cwd, title, model_provider, model, git_branch, first_user_message from threads where id = ? order by updated_at desc",
        (thread_id,),
    ).fetchall()
else:
    rows = cur.execute(
        "select id, rollout_path, created_at, updated_at, cwd, title, model_provider, model, git_branch, first_user_message from threads where archived = 0 order by updated_at desc limit 120"
    ).fetchall()
print(json.dumps([dict(row) for row in rows], ensure_ascii=False))
`.trim();

    const { spawn } = await import('child_process');
    const stdout = await new Promise<string>((resolve, reject) => {
      const child = spawn('python3', ['-c', script, sqlitePath, threadId ?? ''], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => {
        output += String(chunk);
      });
      child.stderr.on('data', (chunk) => {
        stderr += String(chunk);
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) {
          resolve(output);
          return;
        }
        reject(new Error(stderr || `python3 exited with code ${code}`));
      });
    });

    return JSON.parse(stdout) as CodexThreadRow[];
  }

  private async collectFiles(rootDir: string, extension: string, limit: number): Promise<string[]> {
    const stack = [rootDir];
    const files: string[] = [];

    while (stack.length > 0 && files.length < limit) {
      const currentDir = stack.pop();
      if (!currentDir) {
        continue;
      }

      let entries: fs.Dirent[];
      try {
        entries = await fs.readdir(currentDir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        const nextPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          stack.push(nextPath);
        } else if (entry.isFile() && entry.name.endsWith(extension)) {
          files.push(nextPath);
          if (files.length >= limit) {
            break;
          }
        }
      }
    }

    return files;
  }

  private async resolveNewestExisting(paths: string[]): Promise<string | null> {
    for (const candidate of paths) {
      if (pathExistsSafe(candidate)) {
        return candidate;
      }
    }
    return null;
  }
}
