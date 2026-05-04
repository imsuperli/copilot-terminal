import { describe, expect, it } from 'vitest';
import { extractTaskPlan } from '../taskPlan';

describe('extractTaskPlan', () => {
  it('extracts checklist items and marks the first item running when the agent is still running', () => {
    const result = extractTaskPlan({
      assistantMessages: [
        'Plan:\n1. Check disk space\n2. Review nginx error log\n- Check disk space',
      ],
      agent: {
        taskId: 'task-1',
        paneId: 'pane-1',
        windowId: 'win-1',
        status: 'running',
        providerId: 'provider-1',
        model: 'claude-sonnet-4-5',
        linkedPaneId: undefined,
        sshContext: undefined,
        timeline: [],
        messages: [],
        offloadRefs: [],
        createdAt: '2026-05-04T10:00:00.000Z',
        updatedAt: '2026-05-04T10:02:00.000Z',
      },
    });

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      text: 'Check disk space',
      status: 'running',
    });
    expect(result.items[1]).toMatchObject({
      text: 'Review nginx error log',
      status: 'pending',
    });
    expect(result.source).toBe('assistant-message');
  });

  it('marks the last item completed when the agent is completed', () => {
    const result = extractTaskPlan({
      assistantMessages: [
        '- Gather logs\n- Write summary',
      ],
      agent: {
        taskId: 'task-1',
        paneId: 'pane-1',
        windowId: 'win-1',
        status: 'completed',
        providerId: 'provider-1',
        model: 'claude-sonnet-4-5',
        linkedPaneId: undefined,
        sshContext: undefined,
        timeline: [],
        messages: [],
        offloadRefs: [],
        createdAt: '2026-05-04T10:00:00.000Z',
        updatedAt: '2026-05-04T10:05:00.000Z',
      },
    });

    expect(result.items[0]?.status).toBe('pending');
    expect(result.items[1]).toMatchObject({
      text: 'Write summary',
      status: 'completed',
      updatedAt: '2026-05-04T10:05:00.000Z',
    });
  });
});
