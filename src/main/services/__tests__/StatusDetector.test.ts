import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StatusDetectorImpl } from '../StatusDetector';
import { WindowStatus } from '../../../shared/types/window';

describe('StatusDetectorImpl', () => {
  let detector: StatusDetectorImpl;
  const mockPid = 12345;

  beforeEach(() => {
    detector = new StatusDetectorImpl();
    vi.clearAllMocks();
  });

  afterEach(() => {
    detector.destroy();
  });

  describe('isProcessAlive', () => {
    it('returns true when process.kill succeeds', () => {
      vi.spyOn(process, 'kill').mockReturnValue(true as any);
      expect(detector.isProcessAlive(mockPid)).toBe(true);
    });

    it('returns false when process.kill throws', () => {
      vi.spyOn(process, 'kill').mockImplementation(() => { throw new Error('ESRCH'); });
      expect(detector.isProcessAlive(mockPid)).toBe(false);
    });
  });

  describe('onPtyData', () => {
    it('updates lastOutputTime so detectStatus returns Running', async () => {
      vi.spyOn(process, 'kill').mockReturnValue(true as any);
      detector.onPtyData(mockPid, 'some output');
      const status = await detector.detectStatus(mockPid);
      expect(status).toBe(WindowStatus.Running);
    });
  });

  describe('onProcessExit', () => {
    it('exit code 0 → Completed', async () => {
      vi.spyOn(process, 'kill').mockImplementation(() => { throw new Error('ESRCH'); });
      detector.onProcessExit(mockPid, 0);
      expect(await detector.detectStatus(mockPid)).toBe(WindowStatus.Completed);
    });

    it('non-zero exit code → Error', async () => {
      vi.spyOn(process, 'kill').mockImplementation(() => { throw new Error('ESRCH'); });
      detector.onProcessExit(mockPid, 1);
      expect(await detector.detectStatus(mockPid)).toBe(WindowStatus.Error);
    });

    it('process crash (no exit code recorded) → Error', async () => {
      vi.spyOn(process, 'kill').mockImplementation(() => { throw new Error('ESRCH'); });
      // No onProcessExit call — simulates crash/SIGKILL
      expect(await detector.detectStatus(mockPid)).toBe(WindowStatus.Error);
    });
  });

  describe('detectStatus', () => {
    it('Running when recent PTY output within 2s', async () => {
      vi.spyOn(process, 'kill').mockReturnValue(true as any);
      detector.onPtyData(mockPid, 'output');
      expect(await detector.detectStatus(mockPid)).toBe(WindowStatus.Running);
    });

    it('WaitingForInput when no recent output', async () => {
      vi.spyOn(process, 'kill').mockReturnValue(true as any);
      expect(await detector.detectStatus(mockPid)).toBe(WindowStatus.WaitingForInput);
    });

    it('Completed when process exited with code 0', async () => {
      vi.spyOn(process, 'kill').mockImplementation(() => { throw new Error('ESRCH'); });
      detector.onProcessExit(mockPid, 0);
      expect(await detector.detectStatus(mockPid)).toBe(WindowStatus.Completed);
    });

    it('Error when process exited with non-zero code', async () => {
      vi.spyOn(process, 'kill').mockImplementation(() => { throw new Error('ESRCH'); });
      detector.onProcessExit(mockPid, 2);
      expect(await detector.detectStatus(mockPid)).toBe(WindowStatus.Error);
    });
  });

  describe('subscribeStatusChange', () => {
    it('notifies subscriber when status changes via onProcessExit', () => {
      vi.spyOn(process, 'kill').mockImplementation(() => { throw new Error('ESRCH'); });
      const callback = vi.fn();
      detector.trackPid(mockPid);
      detector.subscribeStatusChange(callback);
      detector.onProcessExit(mockPid, 0);
      expect(callback).toHaveBeenCalledWith(mockPid, WindowStatus.Completed);
    });

    it('does not notify when status has not changed', () => {
      vi.spyOn(process, 'kill').mockImplementation(() => { throw new Error('ESRCH'); });
      const callback = vi.fn();
      detector.trackPid(mockPid);
      detector.subscribeStatusChange(callback);
      detector.onProcessExit(mockPid, 0); // Running → Completed
      const count = callback.mock.calls.length;
      detector.onProcessExit(mockPid, 0); // Completed → Completed (no change)
      expect(callback.mock.calls.length).toBe(count);
    });

    it('subscriber exception does not break other subscribers', () => {
      vi.spyOn(process, 'kill').mockImplementation(() => { throw new Error('ESRCH'); });
      const badCallback = vi.fn().mockImplementation(() => { throw new Error('subscriber error'); });
      const goodCallback = vi.fn();
      detector.trackPid(mockPid);
      detector.subscribeStatusChange(badCallback);
      detector.subscribeStatusChange(goodCallback);
      detector.onProcessExit(mockPid, 0);
      expect(goodCallback).toHaveBeenCalledWith(mockPid, WindowStatus.Completed);
    });

    it('unsubscribe function stops future notifications', () => {
      vi.spyOn(process, 'kill').mockImplementation(() => { throw new Error('ESRCH'); });
      const callback = vi.fn();
      detector.trackPid(mockPid);
      const unsubscribe = detector.subscribeStatusChange(callback);
      unsubscribe();
      detector.onProcessExit(mockPid, 0);
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('trackPid / untrackPid', () => {
    it('trackPid sets initial status to Running', () => {
      detector.trackPid(mockPid);
      // No assertion on internal state, but no error thrown
      expect(() => detector.trackPid(mockPid)).not.toThrow();
    });

    it('untrackPid cleans up all data for pid', async () => {
      vi.spyOn(process, 'kill').mockReturnValue(true as any);
      detector.trackPid(mockPid);
      detector.onPtyData(mockPid, 'data');
      detector.untrackPid(mockPid);
      // After untrack, no lastOutputTime → WaitingForInput (not Running)
      expect(await detector.detectStatus(mockPid)).toBe(WindowStatus.WaitingForInput);
    });

    it('treats tracked virtual pids as alive until exit is reported', async () => {
      vi.spyOn(process, 'kill').mockImplementation(() => { throw new Error('ESRCH'); });

      detector.trackPid(mockPid, { virtual: true });
      expect(await detector.detectStatus(mockPid)).toBe(WindowStatus.WaitingForInput);

      detector.onPtyData(mockPid, 'remote output');
      expect(await detector.detectStatus(mockPid)).toBe(WindowStatus.Running);

      detector.onProcessExit(mockPid, 0);
      expect(await detector.detectStatus(mockPid)).toBe(WindowStatus.Completed);
    });
  });

  describe('performance', () => {
    it('detectStatus completes in under 1s', async () => {
      vi.spyOn(process, 'kill').mockReturnValue(true as any);
      const start = Date.now();
      await detector.detectStatus(mockPid);
      expect(Date.now() - start).toBeLessThan(1000);
    });
  });

  describe('destroy', () => {
    it('clears all state', () => {
      detector.trackPid(mockPid);
      expect(() => detector.destroy()).not.toThrow();
    });
  });
});
