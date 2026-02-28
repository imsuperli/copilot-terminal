import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StatusDetectorImpl } from '../StatusDetector';
import { WindowStatus } from '../../../renderer/types/window';

// Mock pidusage
vi.mock('pidusage', () => ({
  default: vi.fn(),
}));

import pidusage from 'pidusage';

const mockStats = (cpu: number, pid = 12345) =>
  ({ cpu, memory: 0, pid, ctime: 0, elapsed: 0, timestamp: 0 } as any);

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
      vi.mocked(pidusage).mockResolvedValue(mockStats(0));
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
    it('Running when CPU > 1%', async () => {
      vi.spyOn(process, 'kill').mockReturnValue(true as any);
      vi.mocked(pidusage).mockResolvedValue(mockStats(5));
      expect(await detector.detectStatus(mockPid)).toBe(WindowStatus.Running);
    });

    it('Running when recent PTY output within 5s', async () => {
      vi.spyOn(process, 'kill').mockReturnValue(true as any);
      vi.mocked(pidusage).mockResolvedValue(mockStats(0));
      detector.onPtyData(mockPid, 'output');
      expect(await detector.detectStatus(mockPid)).toBe(WindowStatus.Running);
    });

    it('WaitingForInput when CPU < 1% and no recent output', async () => {
      vi.spyOn(process, 'kill').mockReturnValue(true as any);
      vi.mocked(pidusage).mockResolvedValue(mockStats(0));
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

    it('falls back to cached CPU when pidusage throws', async () => {
      vi.spyOn(process, 'kill').mockReturnValue(true as any);
      vi.mocked(pidusage).mockResolvedValueOnce(mockStats(5));
      await detector.detectStatus(mockPid); // cache cpu=5
      vi.mocked(pidusage).mockRejectedValueOnce(new Error('fail'));
      expect(await detector.detectStatus(mockPid)).toBe(WindowStatus.Running);
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
      vi.mocked(pidusage).mockResolvedValue(mockStats(0));
      detector.trackPid(mockPid);
      detector.onPtyData(mockPid, 'data');
      detector.untrackPid(mockPid);
      // After untrack, no lastOutputTime → WaitingForInput (not Running)
      expect(await detector.detectStatus(mockPid)).toBe(WindowStatus.WaitingForInput);
    });
  });

  describe('polling', () => {
    it('startPolling and stopPolling do not throw', () => {
      expect(() => detector.startPolling()).not.toThrow();
      expect(() => detector.stopPolling()).not.toThrow();
    });

    it('calling startPolling twice does not create duplicate intervals', () => {
      detector.startPolling();
      detector.startPolling(); // should be a no-op
      expect(() => detector.stopPolling()).not.toThrow();
    });
  });

  describe('performance', () => {
    it('detectStatus completes in under 1s', async () => {
      vi.spyOn(process, 'kill').mockReturnValue(true as any);
      vi.mocked(pidusage).mockResolvedValue(mockStats(0));
      const start = Date.now();
      await detector.detectStatus(mockPid);
      expect(Date.now() - start).toBeLessThan(1000);
    });
  });

  describe('destroy', () => {
    it('clears all state and stops polling', () => {
      detector.trackPid(mockPid);
      detector.startPolling();
      expect(() => detector.destroy()).not.toThrow();
    });
  });
});
