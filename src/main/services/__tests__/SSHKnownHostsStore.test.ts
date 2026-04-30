import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SSHKnownHostsStore } from '../ssh/SSHKnownHostsStore';

describe('SSHKnownHostsStore', () => {
  let tempDir: string;
  let filePath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'synapse-known-hosts-'));
    filePath = path.join(tempDir, 'ssh-known-hosts.json');
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('upserts known host entries by host/port/algorithm', async () => {
    const store = new SSHKnownHostsStore({
      filePath,
      now: () => '2026-03-22T10:00:00.000Z',
    });

    const created = await store.upsert({
      host: '10.0.0.21',
      port: 22,
      algorithm: 'ssh-ed25519',
      digest: 'SHA256:first',
    });

    const updatedStore = new SSHKnownHostsStore({
      filePath,
      now: () => '2026-03-22T11:00:00.000Z',
    });

    const updated = await updatedStore.upsert({
      host: '10.0.0.21',
      port: 22,
      algorithm: 'ssh-ed25519',
      digest: 'SHA256:second',
    });

    expect(updated.id).toBe(created.id);
    expect(updated.createdAt).toBe('2026-03-22T10:00:00.000Z');
    expect(updated.updatedAt).toBe('2026-03-22T11:00:00.000Z');
    expect(updated.digest).toBe('SHA256:second');
    expect(await store.list()).toHaveLength(1);
  });

  it('finds and removes persisted entries', async () => {
    const store = new SSHKnownHostsStore({ filePath });
    const entry = await store.upsert({
      host: '10.0.0.21',
      port: 22,
      algorithm: 'ssh-ed25519',
      digest: 'SHA256:first',
    });

    expect(await store.find('10.0.0.21', 22, 'ssh-ed25519')).toMatchObject({
      id: entry.id,
      digest: 'SHA256:first',
    });

    await store.remove(entry.id);

    expect(await store.find('10.0.0.21', 22, 'ssh-ed25519')).toBeNull();
    expect(await store.list()).toEqual([]);
  });
});
