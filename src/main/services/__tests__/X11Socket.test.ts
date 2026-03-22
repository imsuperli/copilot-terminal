import { describe, expect, it, vi } from 'vitest';
import { describeX11DisplaySpec, resolveX11DisplaySpec } from '../ssh/X11Socket';

describe('X11Socket', () => {
  it('resolves unix DISPLAY sockets on non-Windows platforms', () => {
    const platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');

    expect(resolveX11DisplaySpec('unix:2')).toEqual({
      path: '/tmp/.X11-unix/X2',
    });
    expect(describeX11DisplaySpec('unix:2')).toBe('/tmp/.X11-unix/X2');

    platformSpy.mockRestore();
  });

  it('defaults to localhost on Windows when no DISPLAY is provided', () => {
    const platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
    vi.stubEnv('DISPLAY', '');
    vi.stubEnv('COPILOT_TERMINAL_X11_DISPLAY', '');

    expect(resolveX11DisplaySpec('')).toEqual({
      host: 'localhost',
      port: 6000,
    });
    expect(describeX11DisplaySpec('')).toBe('localhost:6000');

    vi.unstubAllEnvs();
    platformSpy.mockRestore();
  });
});
