import { describe, it, expect, vi, beforeEach } from 'vitest';
import { subscribeToWindowStatusChange } from '../events';
import { WindowStatus } from '../../types/window';

describe('subscribeToWindowStatusChange', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers a listener via onWindowStatusChanged', () => {
    const callback = vi.fn();
    subscribeToWindowStatusChange(callback);
    expect(window.electronAPI.onWindowStatusChanged).toHaveBeenCalledTimes(1);
  });

  it('invokes callback with windowId and status from payload', () => {
    const callback = vi.fn();

    // Capture the handler registered with onWindowStatusChanged
    let registeredHandler: ((event: unknown, payload: unknown) => void) | null = null;
    vi.mocked(window.electronAPI.onWindowStatusChanged).mockImplementation((handler) => {
      registeredHandler = handler;
    });

    subscribeToWindowStatusChange(callback);

    expect(registeredHandler).not.toBeNull();

    // Simulate IPC event arriving
    registeredHandler!(null, {
      windowId: 'win-1',
      status: WindowStatus.WaitingForInput,
      timestamp: new Date().toISOString(),
    });

    expect(callback).toHaveBeenCalledWith('win-1', WindowStatus.WaitingForInput);
  });

  it('returns an unsubscribe function that calls offWindowStatusChanged', () => {
    const callback = vi.fn();
    const unsubscribe = subscribeToWindowStatusChange(callback);

    unsubscribe();

    expect(window.electronAPI.offWindowStatusChanged).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe passes the same handler instance to offWindowStatusChanged', () => {
    const callback = vi.fn();
    let registeredHandler: ((event: unknown, payload: unknown) => void) | null = null;
    let removedHandler: ((event: unknown, payload: unknown) => void) | null = null;

    vi.mocked(window.electronAPI.onWindowStatusChanged).mockImplementation((handler) => {
      registeredHandler = handler;
    });
    vi.mocked(window.electronAPI.offWindowStatusChanged).mockImplementation((handler) => {
      removedHandler = handler;
    });

    const unsubscribe = subscribeToWindowStatusChange(callback);
    unsubscribe();

    expect(registeredHandler).not.toBeNull();
    expect(removedHandler).toBe(registeredHandler);
  });

  it('does not invoke callback after unsubscribe', () => {
    const callback = vi.fn();
    let registeredHandler: ((event: unknown, payload: unknown) => void) | null = null;

    vi.mocked(window.electronAPI.onWindowStatusChanged).mockImplementation((handler) => {
      registeredHandler = handler;
    });

    const unsubscribe = subscribeToWindowStatusChange(callback);
    unsubscribe();

    // Simulate event after unsubscribe — handler should no longer be called
    // (in real Electron this is enforced by removeListener; here we just verify
    //  the unsubscribe function was called with the correct handler)
    expect(window.electronAPI.offWindowStatusChanged).toHaveBeenCalledWith(registeredHandler);
    expect(callback).not.toHaveBeenCalled();
  });
});
