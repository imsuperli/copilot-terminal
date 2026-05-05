import path from 'path';
import { tmpdir } from 'os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app, session } from 'electron';

const { mockHomedir } = vi.hoisted(() => ({
  mockHomedir: vi.fn(() => '/tmp'),
}));

vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os');
  return {
    ...actual,
    homedir: mockHomedir,
  };
});

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp'),
  },
  session: {
    fromPartition: vi.fn(() => ({
      cookies: {
        set: vi.fn(),
      },
    })),
  },
}));

describe('BrowserSyncService', () => {
  let rootPath: string;
  let originalPlatform: PropertyDescriptor | undefined;

  beforeEach(async () => {
    rootPath = await fs.mkdtemp(path.join(tmpdir(), 'browser-sync-service-'));
    vi.mocked(app.getPath).mockReturnValue(rootPath);
    vi.mocked(session.fromPartition).mockClear();
    mockHomedir.mockReturnValue(rootPath);
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  });

  afterEach(async () => {
    await fs.remove(rootPath);
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }
    vi.resetModules();
  });

  it('returns an unsupported state outside macOS', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    const { BrowserSyncService } = await import('../BrowserSyncService');
    const service = new BrowserSyncService();

    const state = await service.syncProfile('Profile 1');
    expect(state).toMatchObject({
      enabled: false,
      profileId: 'Profile 1',
      platformSupported: false,
    });

    const persisted = await service.getState();
    expect(persisted.platformSupported).toBe(false);
    expect(persisted.lastSyncError).toContain('only supported on macOS');
  });

  it('persists a failed state when the profile cannot be found on macOS', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    const { BrowserSyncService } = await import('../BrowserSyncService');
    const service = new BrowserSyncService();

    const state = await service.syncProfile('Missing Profile');
    expect(state).toMatchObject({
      enabled: false,
      profileId: 'Missing Profile',
      platformSupported: true,
    });
    expect(state.lastSyncError).toBe('Chrome profile not found: Missing Profile');

    const persisted = await service.getState();
    expect(persisted.lastSyncError).toBe('Chrome profile not found: Missing Profile');
  });

  it('persists a failed state when the Chrome cookies database is missing', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });

    const { BrowserSyncService } = await import('../BrowserSyncService');
    const service = new BrowserSyncService();
    vi.spyOn(service, 'listProfiles').mockResolvedValue([
      {
        id: 'Profile 1',
        name: 'Work',
        email: 'work@example.com',
        source: 'chrome',
        supported: true,
      },
    ]);

    const state = await service.syncProfile('Profile 1');
    expect(state).toMatchObject({
      enabled: false,
      profileId: 'Profile 1',
      profileName: 'Work',
      platformSupported: true,
      lastSyncError: 'Chrome Cookies database was not found',
    });

    const persisted = await service.getState();
    expect(persisted.lastSyncError).toBe('Chrome Cookies database was not found');
  });
});
