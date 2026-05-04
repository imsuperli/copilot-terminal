import { describe, expect, it } from 'vitest';
import { buildTaskActivityStream } from '../taskActivity';

describe('buildTaskActivityStream', () => {
  it('merges manual events, transcript messages, canvas activity, and artifacts in timestamp order', () => {
    const result = buildTaskActivityStream({
      conversationId: 'conv-1',
      messages: [
        {
          id: 'msg-1',
          role: 'user',
          content: 'check disk',
          timestamp: '2026-05-04T10:00:00.000Z',
        },
        {
          id: 'msg-2',
          role: 'assistant',
          content: '1. inspect disk\n2. inspect logs',
          timestamp: '2026-05-04T10:01:00.000Z',
        },
      ],
      canvasEvents: [
        {
          id: 'canvas-1',
          workspaceId: 'ws-1',
          windowId: 'win-1',
          paneId: 'pane-1',
          timestamp: '2026-05-04T10:03:00.000Z',
          type: 'agent-error',
          title: 'Agent failed',
          message: 'stderr output',
        },
      ],
      artifacts: [
        {
          id: 'artifact-1',
          title: 'Disk report',
          kind: 'conversation',
          createdAt: '2026-05-04T10:04:00.000Z',
        },
      ],
      manualEvents: [
        {
          id: 'manual-1',
          timestamp: '2026-05-04T09:59:00.000Z',
          kind: 'history-restored',
          title: 'Restored external session',
          message: 'Previous nginx investigation',
        },
      ],
    });

    expect(result.map((item) => item.id)).toEqual([
      'manual-1',
      'message:msg-1',
      'message:msg-2',
      'canvas:canvas-1',
      'artifact:artifact-1',
    ]);
    expect(result[0]).toMatchObject({
      kind: 'history-restored',
      title: 'Restored external session',
    });
    expect(result[4]).toMatchObject({
      kind: 'artifact-saved',
      title: 'Disk report',
      message: 'conversation',
    });
  });
});
