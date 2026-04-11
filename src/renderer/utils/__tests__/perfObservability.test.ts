import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetPerfObservabilityForTests,
  createMountedTerminalObservationSnapshot,
  markTerminalSwitchStart,
  markTerminalSwitchVisible,
} from '../perfObservability';

describe('perfObservability', () => {
  beforeEach(() => {
    __resetPerfObservabilityForTests();
    vi.restoreAllMocks();
  });

  it('summarizes hidden running mounted terminals and pane counts', () => {
    const snapshot = createMountedTerminalObservationSnapshot({
      currentView: 'terminal',
      activeWindowId: 'win-1',
      activeGroupId: null,
      mountedWindowIds: ['win-1', 'win-2', 'win-3'],
      mountedWindowStatusKeys: [
        'win-1:running',
        'win-2:waiting',
        'win-3:paused',
      ],
      mountedWindowTerminalPaneCountKeys: [
        'win-1:2',
        'win-2:1',
        'win-3:3',
      ],
    });

    expect(snapshot).toMatchObject({
      mountedWindowCount: 3,
      hiddenMountedWindowCount: 2,
      hiddenRunningWindowCount: 1,
      mountedTerminalPaneCount: 6,
      hiddenMountedTerminalPaneCount: 4,
      hiddenMountedWindowIds: ['win-2', 'win-3'],
      hiddenRunningWindowIds: ['win-2'],
    });
  });

  it('treats all mounted terminals as hidden while a group surface is active', () => {
    const snapshot = createMountedTerminalObservationSnapshot({
      currentView: 'terminal',
      activeWindowId: 'win-1',
      activeGroupId: 'group-1',
      mountedWindowIds: ['win-1', 'win-2'],
      mountedWindowStatusKeys: [
        'win-1:running',
        'win-2:waiting',
      ],
      mountedWindowTerminalPaneCountKeys: [
        'win-1:1',
        'win-2:2',
      ],
    });

    expect(snapshot.hiddenMountedWindowIds).toEqual(['win-1', 'win-2']);
    expect(snapshot.hiddenRunningWindowIds).toEqual(['win-1', 'win-2']);
    expect(snapshot.hiddenMountedTerminalPaneCount).toBe(3);
  });

  it('measures terminal switch visibility duration once per pending switch', () => {
    vi.spyOn(performance, 'now')
      .mockReturnValueOnce(12)
      .mockReturnValueOnce(46.5);

    markTerminalSwitchStart('win-1');

    expect(markTerminalSwitchVisible('win-1')).toBeCloseTo(34.5);
    expect(markTerminalSwitchVisible('win-1')).toBeNull();
  });
});
