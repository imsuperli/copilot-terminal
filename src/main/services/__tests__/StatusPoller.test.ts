import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StatusPoller } from '../StatusPoller';
import { WindowStatus } from '../../../shared/types/window';

// Flush pending promise microtasks (no setTimeout — safe with fake timers)
async function flushPromises() {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

// Mock BrowserWindow
function makeMockMainWindow() {
  return {
    isDestroyed: vi.fn().mockReturnValue(false),
    webContents: {
      send: vi.fn(),
    },
  };
}

// Mock StatusDetector
function makeMockDetector(defaultStatus = WindowStatus.Running) {
  return {
    detectStatus: vi.fn().mockResolvedValue(defaultStatus),
    subscribeStatusChange: vi.fn().mockReturnValue(() => {}),
    trackPid: vi.fn(),
    untrackPid: vi.fn(),
    onPtyData: vi.fn(),
    onProcessExit: vi.fn(),
    destroy: vi.fn(),
  };
}

describe('StatusPoller', () => {
  let mainWindow: ReturnType<typeof makeMockMainWindow>;
  let detector: ReturnType<typeof makeMockDetector>;
  let poller: StatusPoller;

  beforeEach(() => {
    vi.useFakeTimers();
    mainWindow = makeMockMainWindow();
    detector = makeMockDetector();
    poller = new StatusPoller(detector as any, mainWindow as any);
  });

  afterEach(() => {
    poller.stopPolling();
    vi.useRealTimers();
  });

  // Task 1: startPolling / stopPolling
  it('starts polling and sets isPolling to true', () => {
    expect(poller.isPolling()).toBe(false);
    poller.startPolling();
    expect(poller.isPolling()).toBe(true);
  });

  it('stops polling and sets isPolling to false', () => {
    poller.startPolling();
    poller.stopPolling();
    expect(poller.isPolling()).toBe(false);
  });

  it('calling startPolling twice does not create duplicate intervals', () => {
    poller.startPolling();
    poller.startPolling();
    expect(poller.isPolling()).toBe(true);
    // Only one interval should be active — stopPolling once should clear it
    poller.stopPolling();
    expect(poller.isPolling()).toBe(false);
  });

  it('stopPolling is safe to call when not polling', () => {
    expect(() => poller.stopPolling()).not.toThrow();
  });

  // Task 1: addWindow / removeWindow
  it('addWindow increases tracked window count', () => {
    expect(poller.getTrackedWindowCount()).toBe(0);
    poller.addWindow('win-1', 1001);
    expect(poller.getTrackedWindowCount()).toBe(1);
  });

  it('removeWindow decreases tracked window count', () => {
    poller.addWindow('win-1', 1001);
    poller.removeWindow('win-1');
    expect(poller.getTrackedWindowCount()).toBe(0);
  });

  it('removeWindow on non-existent window does not throw', () => {
    expect(() => poller.removeWindow('non-existent')).not.toThrow();
  });

  // Task 1: setActiveWindow
  it('setActiveWindow marks only the specified window as active', () => {
    poller.addWindow('win-1', 1001);
    poller.addWindow('win-2', 1002);
    poller.setActiveWindow('win-1');
    // After setting win-2 active, win-1 should be inactive
    poller.setActiveWindow('win-2');
    // win-2 (active): interval=1s, win-1 (inactive): interval=5s
    // Advance 1s — win-2 should be checked, win-1 should not (needs 5s)
    poller.startPolling();
    vi.advanceTimersByTime(1000);
    expect(detector.detectStatus).toHaveBeenCalledWith(1002);
    expect(detector.detectStatus).not.toHaveBeenCalledWith(1001);
  });

  it('setActiveWindow on non-existent window does not throw', () => {
    expect(() => poller.setActiveWindow('non-existent')).not.toThrow();
  });

  // Task 2: IPC event push on status change
  it('sends pane-status-changed IPC event when status changes', async () => {
    detector.detectStatus.mockResolvedValue(WindowStatus.WaitingForInput);
    poller.addWindow('win-1', 1001);
    poller.setActiveWindow('win-1');
    poller.startPolling();

    vi.advanceTimersByTime(1000);
    await flushPromises();

    expect(mainWindow.webContents.send).toHaveBeenCalledWith(
      'pane-status-changed',
      expect.objectContaining({
        windowId: 'win-1',
        paneId: 'win-1',
        status: WindowStatus.WaitingForInput,
        timestamp: expect.any(String),
      })
    );
  });

  it('does not send IPC event when status has not changed', async () => {
    detector.detectStatus.mockResolvedValue(WindowStatus.Running);
    poller.addWindow('win-1', 1001);
    poller.setActiveWindow('win-1');
    poller.startPolling();

    // First check: Restoring → Running, fires event
    vi.advanceTimersByTime(1000);
    await flushPromises();
    expect(mainWindow.webContents.send).toHaveBeenCalledTimes(1);

    // Second check: Running → Running, no event
    vi.advanceTimersByTime(1000);
    await flushPromises();
    expect(mainWindow.webContents.send).toHaveBeenCalledTimes(1);
  });

  it('does not send IPC event when mainWindow is destroyed', async () => {
    mainWindow.isDestroyed.mockReturnValue(true);
    detector.detectStatus.mockResolvedValue(WindowStatus.WaitingForInput);
    poller.addWindow('win-1', 1001);
    poller.setActiveWindow('win-1');
    poller.startPolling();

    vi.advanceTimersByTime(1000);
    await flushPromises();

    expect(mainWindow.webContents.send).not.toHaveBeenCalled();
  });

  // Task 1 AC7: active vs inactive polling intervals
  it('checks inactive window only after 5s', async () => {
    detector.detectStatus.mockResolvedValue(WindowStatus.Running);
    poller.addWindow('win-1', 1001); // isActive=false by default
    poller.startPolling();

    // After 1s: inactive window should NOT be checked (interval=5000)
    vi.advanceTimersByTime(1000);
    await flushPromises();
    expect(detector.detectStatus).not.toHaveBeenCalled();

    // After 5s total: inactive window SHOULD be checked
    vi.advanceTimersByTime(4000);
    await flushPromises();
    expect(detector.detectStatus).toHaveBeenCalledWith(1001);
  });

  it('checks active window after 1s', async () => {
    detector.detectStatus.mockResolvedValue(WindowStatus.Running);
    poller.addWindow('win-1', 1001);
    poller.setActiveWindow('win-1');
    poller.startPolling();

    vi.advanceTimersByTime(1000);
    await flushPromises();
    expect(detector.detectStatus).toHaveBeenCalledWith(1001);
  });

  // IPC payload includes timestamp
  it('IPC payload includes ISO timestamp', async () => {
    detector.detectStatus.mockResolvedValue(WindowStatus.Completed);
    poller.addWindow('win-1', 1001);
    poller.setActiveWindow('win-1');
    poller.startPolling();

    vi.advanceTimersByTime(1000);
    await flushPromises();

    expect(mainWindow.webContents.send).toHaveBeenCalled();
    const call = mainWindow.webContents.send.mock.calls[0];
    const payload = call[1];
    expect(() => new Date(payload.timestamp)).not.toThrow();
    expect(new Date(payload.timestamp).toISOString()).toBe(payload.timestamp);
  });

  // detectStatus failure is silently ignored
  it('ignores detectStatus errors and continues polling', async () => {
    detector.detectStatus.mockRejectedValue(new Error('pid not found'));
    poller.addWindow('win-1', 1001);
    poller.setActiveWindow('win-1');
    poller.startPolling();

    vi.advanceTimersByTime(1000);
    await flushPromises();

    expect(mainWindow.webContents.send).not.toHaveBeenCalled();
  });
});
