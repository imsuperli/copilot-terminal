export interface SSHCwdTrackerState {
  commandBuffer: string;
  cwd: string | null;
  previousCwd: string | null;
  homeCwd: string | null;
}

const OSC_7_BEL_PATTERN = /\u001b]7;([^\u0007\u001b]+)\u0007/g;
const OSC_7_ST_PATTERN = /\u001b]7;([^\u001b]+)\u001b\\/g;
const OSC_TITLE_BEL_PATTERN = /\u001b](?:0|2);([^\u0007\u001b]+)\u0007/g;
const OSC_TITLE_ST_PATTERN = /\u001b](?:0|2);([^\u001b]+)\u001b\\/g;
const OSC_CWD_BEL_PATTERN = /\u001b]633;.*?(?:Cwd|CurrentDir)=([^\u0007\u001b]+)\u0007/g;
const OSC_CWD_ST_PATTERN = /\u001b]633;.*?(?:Cwd|CurrentDir)=([^\u001b]+)\u001b\\/g;
const BRACKETED_PASTE_START = '\u001b[200~';
const BRACKETED_PASTE_END = '\u001b[201~';
const OSC_PREFIX = '\u001b]';

export function createSSHCwdTrackerState(initialCwd?: string | null): SSHCwdTrackerState {
  const normalizedCwd = normalizeRemoteCwd(initialCwd);

  return {
    commandBuffer: '',
    cwd: normalizedCwd,
    previousCwd: null,
    homeCwd: normalizedCwd && normalizedCwd.startsWith('/') ? null : null,
  };
}

export function extractLatestOsc7RemoteCwd(data: string): string | null {
  if (!data || !mayContainRemoteCwdMarker(data)) {
    return null;
  }

  let latestPath: string | null = null;

  for (const pattern of [OSC_7_BEL_PATTERN, OSC_7_ST_PATTERN]) {
    pattern.lastIndex = 0;
    let match = pattern.exec(data);

    while (match) {
      const parsed = parseFileUriPath(match[1]);
      if (parsed) {
        latestPath = parsed;
      }
      match = pattern.exec(data);
    }
  }

  for (const pattern of [OSC_CWD_BEL_PATTERN, OSC_CWD_ST_PATTERN]) {
    pattern.lastIndex = 0;
    let match = pattern.exec(data);

    while (match) {
      const parsed = normalizeRemoteCwd(match[1]);
      if (parsed) {
        latestPath = parsed;
      }
      match = pattern.exec(data);
    }
  }

  for (const pattern of [OSC_TITLE_BEL_PATTERN, OSC_TITLE_ST_PATTERN]) {
    pattern.lastIndex = 0;
    let match = pattern.exec(data);

    while (match) {
      const parsed = parseTitlePath(match[1]);
      if (parsed) {
        latestPath = parsed;
      }
      match = pattern.exec(data);
    }
  }

  return latestPath;
}

export function updateSSHCwdTrackerFromRuntimeCwd(
  state: SSHCwdTrackerState,
  cwd: string | null | undefined,
): SSHCwdTrackerState {
  const normalizedCwd = normalizeRemoteCwd(cwd);
  if (!normalizedCwd) {
    return state;
  }

  const nextHomeCwd = deriveHomeCwd(state.cwd, normalizedCwd) ?? state.homeCwd;

  if (normalizedCwd === state.cwd && nextHomeCwd === state.homeCwd) {
    return state;
  }

  return {
    ...state,
    cwd: normalizedCwd,
    previousCwd: state.cwd === normalizedCwd ? state.previousCwd : state.cwd,
    homeCwd: nextHomeCwd,
  };
}

export function applyTerminalInputToSSHCwdTracker(
  state: SSHCwdTrackerState,
  data: string,
): { nextState: SSHCwdTrackerState; resolvedCwd: string | null } {
  if (!data) {
    return { nextState: state, resolvedCwd: null };
  }

  if (isSimpleCommandBufferAppend(data)) {
    return {
      nextState: {
        ...state,
        commandBuffer: `${state.commandBuffer}${data}`,
      },
      resolvedCwd: null,
    };
  }

  let nextState = state;
  let latestResolvedCwd: string | null = null;

  for (let index = 0; index < data.length; index += 1) {
    if (data.startsWith(BRACKETED_PASTE_START, index)) {
      index += BRACKETED_PASTE_START.length - 1;
      continue;
    }

    if (data.startsWith(BRACKETED_PASTE_END, index)) {
      index += BRACKETED_PASTE_END.length - 1;
      continue;
    }

    const char = data[index];

    if (char === '\u001b') {
      const sequenceLength = getTerminalEscapeSequenceLength(data.slice(index));
      if (sequenceLength > 0) {
        index += sequenceLength - 1;
      }
      continue;
    }

    if (char === '\r' || char === '\n') {
      const resolvedCwd = resolveCwdFromCommand(nextState);
      if (resolvedCwd) {
        nextState = updateSSHCwdTrackerFromRuntimeCwd(nextState, resolvedCwd);
        latestResolvedCwd = resolvedCwd;
      }

      nextState = {
        ...nextState,
        commandBuffer: '',
      };
      continue;
    }

    if (char === '\u007f' || char === '\b') {
      nextState = {
        ...nextState,
        commandBuffer: nextState.commandBuffer.slice(0, -1),
      };
      continue;
    }

    if (char === '\u0015') {
      nextState = {
        ...nextState,
        commandBuffer: '',
      };
      continue;
    }

    if (char === '\u0017') {
      nextState = {
        ...nextState,
        commandBuffer: nextState.commandBuffer.replace(/\S+\s*$/, ''),
      };
      continue;
    }

    if (char < ' ' && char !== '\t') {
      continue;
    }

    nextState = {
      ...nextState,
      commandBuffer: `${nextState.commandBuffer}${char}`,
    };
  }

  return {
    nextState,
    resolvedCwd: latestResolvedCwd,
  };
}

function mayContainRemoteCwdMarker(data: string): boolean {
  return data.includes(OSC_PREFIX)
    && (
      data.includes(']7;')
      || data.includes(']633;')
      || data.includes(']0;')
      || data.includes(']2;')
    );
}

function isSimpleCommandBufferAppend(data: string): boolean {
  if (!data || data.includes(BRACKETED_PASTE_START) || data.includes(BRACKETED_PASTE_END)) {
    return false;
  }

  for (let index = 0; index < data.length; index += 1) {
    const char = data[index];
    if (char === '\u001b' || char === '\u007f' || char === '\b') {
      return false;
    }

    if (char < ' ' && char !== '\t') {
      return false;
    }
  }

  return true;
}

function resolveCwdFromCommand(state: SSHCwdTrackerState): string | null {
  const command = state.commandBuffer.trim();
  if (!command) {
    return null;
  }

  const tokens = tokenizeShellWords(command);
  if (tokens.length === 0 || tokens[0] !== 'cd' || tokens.length > 2) {
    return null;
  }

  const target = tokens[1] ?? '';
  if (target === '-') {
    return state.previousCwd;
  }

  if (!target || target === '~') {
    return state.homeCwd ?? '~';
  }

  if (target.startsWith('~/')) {
    if (state.homeCwd) {
      return normalizeRemoteCwd(joinRemotePath(state.homeCwd, target.slice(2)));
    }

    return normalizeRemoteCwd(target);
  }

  if (target.startsWith('/')) {
    return normalizeRemoteCwd(target);
  }

  const basePath = state.cwd ?? state.homeCwd ?? '~';
  return normalizeRemoteCwd(joinRemotePath(basePath, target));
}

function tokenizeShellWords(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escaping = false;

  for (const char of command) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === '\\' && quote !== '\'') {
      escaping = true;
      continue;
    }

    if ((char === '"' || char === '\'') && (!quote || quote === char)) {
      quote = quote ? null : char;
      continue;
    }

    if (/\s/.test(char) && !quote) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

function joinRemotePath(basePath: string, relativePath: string): string {
  if (!relativePath) {
    return basePath;
  }

  const normalizedBase = normalizeRemoteCwd(basePath) ?? basePath;
  if (relativePath.startsWith('/')) {
    return relativePath;
  }

  if (normalizedBase === '/') {
    return `/${relativePath}`;
  }

  if (normalizedBase === '~') {
    return `~/${relativePath}`;
  }

  return `${normalizedBase}/${relativePath}`;
}

function normalizeRemoteCwd(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  const prefix = trimmed.startsWith('~') ? '~' : '/';
  const remainder = prefix === '~'
    ? trimmed === '~'
      ? ''
      : trimmed.slice(1)
    : trimmed;
  const segments = remainder.split('/').filter(Boolean);
  const normalizedSegments: string[] = [];

  for (const segment of segments) {
    if (segment === '.') {
      continue;
    }

    if (segment === '..') {
      if (normalizedSegments.length > 0) {
        normalizedSegments.pop();
      }
      continue;
    }

    normalizedSegments.push(segment);
  }

  if (prefix === '~') {
    return normalizedSegments.length > 0 ? `~/${normalizedSegments.join('/')}` : '~';
  }

  return normalizedSegments.length > 0 ? `/${normalizedSegments.join('/')}` : '/';
}

function deriveHomeCwd(currentCwd: string | null, runtimeCwd: string): string | null {
  if (!currentCwd || !runtimeCwd.startsWith('/')) {
    return null;
  }

  if (currentCwd === '~') {
    return runtimeCwd;
  }

  if (!currentCwd.startsWith('~/')) {
    return null;
  }

  const suffix = currentCwd.slice(1);
  if (!runtimeCwd.endsWith(suffix)) {
    return null;
  }

  const candidate = runtimeCwd.slice(0, runtimeCwd.length - suffix.length);
  return candidate || '/';
}

function parseFileUriPath(uri: string): string | null {
  if (!uri.startsWith('file://')) {
    return null;
  }

  try {
    const url = new URL(uri);
    return normalizeRemoteCwd(decodeURIComponent(url.pathname));
  } catch {
    return null;
  }
}

function parseTitlePath(title: string): string | null {
  const trimmed = title.trim();
  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(/(?:^|:\s?)(~(?:\/[^\r\n]*)?|\/[^\r\n]*)$/);
  if (!match?.[1]) {
    return null;
  }

  const normalized = normalizeRemoteCwd(match[1]);
  if (!normalized || !normalized.startsWith('/')) {
    return null;
  }

  return normalized;
}

function getTerminalEscapeSequenceLength(value: string): number {
  const csiMatch = value.match(/^\u001b\[[0-9;?]*[ -/]*[@-~]/);
  if (csiMatch) {
    return csiMatch[0].length;
  }

  const ss3Match = value.match(/^\u001bO./);
  if (ss3Match) {
    return ss3Match[0].length;
  }

  return 1;
}
