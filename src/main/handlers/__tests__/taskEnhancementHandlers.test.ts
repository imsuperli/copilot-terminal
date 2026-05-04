import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerTaskEnhancementHandlers } from '../taskEnhancementHandlers';
import type { HandlerContext } from '../HandlerContext';

const { mockIpcHandle } = vi.hoisted(() => ({
  mockIpcHandle: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: mockIpcHandle,
  },
}));

function getRegisteredHandler(channel: string) {
  const call = mockIpcHandle.mock.calls.find(([name]) => name === channel);
  expect(call, `IPC handler ${channel} should be registered`).toBeTruthy();
  return call?.[1] as (event: unknown, payload?: unknown) => Promise<unknown>;
}

describe('registerTaskEnhancementHandlers', () => {
  beforeEach(() => {
    mockIpcHandle.mockReset();
  });

  it('registers aggregation, artifact, browser sync, and MCP handlers', async () => {
    const ctx = {
      sessionAggregationService: {
        listSessions: vi.fn().mockResolvedValue([{ id: 'agg-1' }]),
        getSessionDetail: vi.fn().mockResolvedValue({ entry: { id: 'agg-1' }, messages: [] }),
        restoreSession: vi.fn().mockResolvedValue({ conversationId: 'conv-1', messages: [] }),
      },
      taskArtifactService: {
        saveArtifact: vi.fn().mockResolvedValue({ id: 'artifact-1' }),
        listArtifacts: vi.fn().mockResolvedValue([{ id: 'artifact-1' }]),
        deleteArtifact: vi.fn().mockResolvedValue(undefined),
      },
      browserSyncService: {
        listProfiles: vi.fn().mockResolvedValue([{ id: 'Profile 1' }]),
        getState: vi.fn().mockResolvedValue({ enabled: false, platformSupported: true }),
        syncProfile: vi.fn().mockResolvedValue({ enabled: true, profileId: 'Profile 1', platformSupported: true }),
      },
      mcpCapabilityService: {
        listServerSnapshots: vi.fn().mockReturnValue([{ serverName: 'filesystem', toolCount: 1, tools: [] }]),
      },
    } as unknown as HandlerContext;

    registerTaskEnhancementHandlers(ctx);

    const listSessions = getRegisteredHandler('list-aggregated-sessions');
    const saveArtifact = getRegisteredHandler('save-task-artifact');
    const getBrowserSyncState = getRegisteredHandler('get-browser-sync-state');
    const getMcpSnapshots = getRegisteredHandler('get-mcp-server-snapshots');

    await expect(listSessions({}, { cwd: '/tmp/demo', limit: 3 })).resolves.toEqual({
      success: true,
      data: [{ id: 'agg-1' }],
    });
    await expect(saveArtifact({}, { kind: 'conversation', title: 'Report' })).resolves.toEqual({
      success: true,
      data: { id: 'artifact-1' },
    });
    await expect(getBrowserSyncState({})).resolves.toEqual({
      success: true,
      data: { enabled: false, platformSupported: true },
    });
    await expect(getMcpSnapshots({})).resolves.toEqual({
      success: true,
      data: [{ serverName: 'filesystem', toolCount: 1, tools: [] }],
    });
  });

  it('returns IPC errors when a required service is missing', async () => {
    registerTaskEnhancementHandlers({} as HandlerContext);
    const listSessions = getRegisteredHandler('list-aggregated-sessions');

    await expect(listSessions({}, { cwd: '/tmp/demo' })).resolves.toEqual({
      success: false,
      error: 'SessionAggregationService not initialized',
    });
  });
});
