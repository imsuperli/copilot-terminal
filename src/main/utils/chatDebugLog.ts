import fs from 'fs';
import os from 'os';
import path from 'path';

export type ChatDebugLevel = 'INFO' | 'WARN' | 'ERROR';

const CHAT_DEBUG_LOG_FILENAME = 'copilot-terminal-chat-debug.log';
const MAX_STRING_LENGTH = 800;
const MAX_ARRAY_ITEMS = 50;
const MAX_OBJECT_DEPTH = 6;
const SENSITIVE_KEY_PATTERN = /(api[-_]?key|authorization|token|password|passphrase|secret|private[-_]?key)/i;
const CONSOLE_DEBUG_ENABLED = process.env.AUSOME_CHAT_DEBUG === '1';
const FILE_DEBUG_ENABLED = CONSOLE_DEBUG_ENABLED || Boolean(process.env.AUSOME_CHAT_DEBUG_LOG_FILE?.trim());

export function getChatDebugLogFilePath(): string {
  const configuredPath = process.env.AUSOME_CHAT_DEBUG_LOG_FILE?.trim();
  if (configuredPath) {
    return configuredPath;
  }

  return path.join(os.tmpdir(), CHAT_DEBUG_LOG_FILENAME);
}

export function previewText(value: string, maxLength = 200): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}... [truncated ${value.length - maxLength} chars]`;
}

function sanitizeLogValue(value: unknown, depth = 0): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (
    value === null
    || value === undefined
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return value;
  }

  if (typeof value === 'string') {
    return previewText(value, MAX_STRING_LENGTH);
  }

  if (depth >= MAX_OBJECT_DEPTH) {
    return '[max-depth]';
  }

  if (Array.isArray(value)) {
    const nextValues = value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeLogValue(item, depth + 1));
    if (value.length > MAX_ARRAY_ITEMS) {
      nextValues.push(`... [truncated ${value.length - MAX_ARRAY_ITEMS} items]`);
    }
    return nextValues;
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
      result[key] = SENSITIVE_KEY_PATTERN.test(key)
        ? '[redacted]'
        : sanitizeLogValue(entryValue, depth + 1);
    }
    return result;
  }

  return String(value);
}

function appendChatDebugLog(level: ChatDebugLevel, scope: string, message: string, extra?: unknown): void {
  if (!FILE_DEBUG_ENABLED && !CONSOLE_DEBUG_ENABLED) {
    return;
  }

  const safeExtra = extra === undefined ? undefined : sanitizeLogValue(extra);
  const suffix = safeExtra === undefined ? '' : ` ${JSON.stringify(safeExtra)}`;
  const line = `[ChatDebug ${new Date().toISOString()}] [${level}] [${scope}] ${message}${suffix}\n`;

  if (FILE_DEBUG_ENABLED) {
    try {
      fs.appendFileSync(getChatDebugLogFilePath(), line, 'utf8');
    } catch {
      // Ignore file logging failures.
    }
  }

  if (!CONSOLE_DEBUG_ENABLED) {
    return;
  }

  const consoleArgs = safeExtra === undefined
    ? [`[ChatDebug] [${scope}] ${message}`]
    : [`[ChatDebug] [${scope}] ${message}`, safeExtra];

  if (level === 'ERROR') {
    console.error(...consoleArgs);
  } else if (level === 'WARN') {
    console.warn(...consoleArgs);
  } else {
    console.log(...consoleArgs);
  }
}

export function chatDebugInfo(scope: string, message: string, extra?: unknown): void {
  appendChatDebugLog('INFO', scope, message, extra);
}

export function chatDebugWarn(scope: string, message: string, extra?: unknown): void {
  appendChatDebugLog('WARN', scope, message, extra);
}

export function chatDebugError(scope: string, message: string, extra?: unknown): void {
  appendChatDebugLog('ERROR', scope, message, extra);
}
