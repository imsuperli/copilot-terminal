import { execFile } from 'child_process';
import { createDecipheriv, pbkdf2Sync } from 'crypto';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { app, session } from 'electron';
import type { BrowserSyncProfile, BrowserSyncState } from '../../shared/types/task';
import { readJsonFileOrDefault, writeJsonFileAtomic } from './ssh/storeUtils';

interface BrowserSyncStateDocument extends BrowserSyncState {
  schemaVersion: 1;
}

interface RawCookieRow {
  host_key: string;
  name: string;
  path: string;
  encrypted_value_hex: string;
  expires_utc: number;
  is_secure: number;
  is_httponly: number;
  samesite: number;
  has_expires: number;
}

const CHROME_BASE = path.join(
  os.homedir(),
  'Library',
  'Application Support',
  'Google',
  'Chrome',
);
const CHROME_SALT = 'saltysalt';
const CHROME_ITERATIONS = 1003;
const CHROME_KEY_LENGTH = 16;
const CHROME_IV = Buffer.alloc(16, 0x20);
const BROWSER_PARTITION = 'persist:synapse-browser';

function chromeTimeToUnix(chromeTime: number): number {
  if (!chromeTime || chromeTime === 0) {
    return 0;
  }

  const seconds = BigInt(chromeTime) / 1000000n - 11644473600n;
  return Number(seconds);
}

function sameSiteMap(value: number): 'unspecified' | 'no_restriction' | 'lax' | 'strict' {
  switch (value) {
    case 0:
      return 'no_restriction';
    case 1:
      return 'lax';
    case 2:
      return 'strict';
    default:
      return 'unspecified';
  }
}

async function getChromeKeychainPassword(): Promise<string> {
  return await new Promise((resolve, reject) => {
    execFile('security', ['find-generic-password', '-s', 'Chrome Safe Storage', '-w'], (error, stdout) => {
      if (error) {
        reject(new Error('Keychain access denied or Chrome Safe Storage not found'));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

function decryptChromeCookie(encryptedValue: Buffer, key: Buffer): string {
  if (!encryptedValue.length) {
    return '';
  }

  if (encryptedValue.slice(0, 3).toString() === 'v10') {
    const decipher = createDecipheriv('aes-128-cbc', key, CHROME_IV);
    const decrypted = Buffer.concat([decipher.update(encryptedValue.slice(3)), decipher.final()]);
    return decrypted.toString('utf8');
  }

  return encryptedValue.toString('utf8');
}

export class BrowserSyncService {
  private readonly stateFilePath = path.join(app.getPath('userData'), 'browser-sync-state.json');
  private readonly tempDir = path.join(app.getPath('userData'), 'browser-sync-temp');

  async listProfiles(): Promise<BrowserSyncProfile[]> {
    if (process.platform !== 'darwin') {
      return [];
    }

    const localStatePath = path.join(CHROME_BASE, 'Local State');
    if (!await fs.pathExists(localStatePath)) {
      return [];
    }

    try {
      const localState = await fs.readJson(localStatePath);
      const cache = localState?.profile?.info_cache;
      if (!cache || typeof cache !== 'object') {
        return [];
      }

      return Object.entries(cache).map(([profileId, info]) => {
        const typedInfo = info as Record<string, unknown>;
        return {
          id: profileId,
          name: typeof typedInfo.name === 'string' ? typedInfo.name : profileId,
          email: typeof typedInfo.user_name === 'string' ? typedInfo.user_name : undefined,
          source: 'chrome',
          supported: true,
        };
      });
    } catch {
      return [];
    }
  }

  async getState(): Promise<BrowserSyncState> {
    const stored = await readJsonFileOrDefault<BrowserSyncStateDocument>(this.stateFilePath, {
      schemaVersion: 1,
      enabled: false,
      platformSupported: process.platform === 'darwin',
    });
    return {
      enabled: stored.enabled,
      profileId: stored.profileId,
      profileName: stored.profileName,
      lastSyncedAt: stored.lastSyncedAt,
      lastSyncCount: stored.lastSyncCount,
      lastSyncError: stored.lastSyncError,
      platformSupported: process.platform === 'darwin',
    };
  }

  async syncProfile(profileId: string): Promise<BrowserSyncState> {
    if (process.platform !== 'darwin') {
      const unsupportedState: BrowserSyncState = {
        enabled: false,
        profileId,
        platformSupported: false,
        lastSyncError: 'Browser sync is currently only supported on macOS.',
      };
      await this.persistState(unsupportedState);
      return unsupportedState;
    }

    const profiles = await this.listProfiles();
    const profile = profiles.find((item) => item.id === profileId);
    if (!profile) {
      throw new Error(`Chrome profile not found: ${profileId}`);
    }

    await fs.ensureDir(this.tempDir);
    const sourceDbPath = path.join(CHROME_BASE, profileId, 'Cookies');
    if (!await fs.pathExists(sourceDbPath)) {
      throw new Error('Chrome Cookies database was not found');
    }

    const tempDbPath = path.join(this.tempDir, `cookies-${Date.now()}.sqlite`);
    await fs.copy(sourceDbPath, tempDbPath);

    try {
      const password = await getChromeKeychainPassword();
      const key = pbkdf2Sync(password, CHROME_SALT, CHROME_ITERATIONS, CHROME_KEY_LENGTH, 'sha1');
      const rows = await this.queryCookies(tempDbPath);
      const ses = session.fromPartition(BROWSER_PARTITION);
      const nowSeconds = Date.now() / 1000;
      let count = 0;

      for (const row of rows) {
        const value = decryptChromeCookie(Buffer.from(row.encrypted_value_hex, 'hex'), key);
        if (!value) {
          continue;
        }
        const expirationDate = chromeTimeToUnix(row.expires_utc);
        if (row.has_expires && expirationDate > 0 && expirationDate < nowSeconds) {
          continue;
        }

        const domain = row.host_key.startsWith('.') ? row.host_key.slice(1) : row.host_key;
        const url = `${row.is_secure ? 'https' : 'http'}://${domain}${row.path}`;
        try {
          await ses.cookies.set({
            url,
            name: row.name,
            value,
            domain: row.host_key,
            path: row.path,
            secure: Boolean(row.is_secure),
            httpOnly: Boolean(row.is_httponly),
            expirationDate: expirationDate > 0 ? expirationDate : undefined,
            sameSite: sameSiteMap(row.samesite),
          });
          count += 1;
        } catch {
          continue;
        }
      }

      const nextState: BrowserSyncState = {
        enabled: true,
        profileId: profile.id,
        profileName: profile.name,
        lastSyncedAt: new Date().toISOString(),
        lastSyncCount: count,
        platformSupported: true,
      };
      await this.persistState(nextState);
      return nextState;
    } catch (error) {
      const failedState: BrowserSyncState = {
        enabled: false,
        profileId: profile.id,
        profileName: profile.name,
        lastSyncedAt: new Date().toISOString(),
        lastSyncError: error instanceof Error ? error.message : String(error),
        platformSupported: true,
      };
      await this.persistState(failedState);
      return failedState;
    } finally {
      await fs.remove(tempDbPath).catch(() => {});
    }
  }

  private async persistState(state: BrowserSyncState): Promise<void> {
    await writeJsonFileAtomic(this.stateFilePath, {
      schemaVersion: 1,
      ...state,
    } satisfies BrowserSyncStateDocument);
  }

  private async queryCookies(sqlitePath: string): Promise<RawCookieRow[]> {
    const script = `
import sqlite3
import json
import sys
conn = sqlite3.connect(sys.argv[1])
conn.row_factory = sqlite3.Row
cur = conn.cursor()
rows = cur.execute(
  "select host_key, name, path, hex(encrypted_value) as encrypted_value, expires_utc, is_secure, is_httponly, samesite, has_expires from cookies"
).fetchall()
print(json.dumps([dict(row) for row in rows]))
`.trim();

    const stdout = await new Promise<string>((resolve, reject) => {
      execFile('python3', ['-c', script, sqlitePath], (error, result, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
          return;
        }
        resolve(result);
      });
    });

    const rows = JSON.parse(stdout) as Array<{
      host_key: string;
      name: string;
      path: string;
      encrypted_value: string;
      expires_utc: number;
      is_secure: number;
      is_httponly: number;
      samesite: number;
      has_expires: number;
    }>;
    return rows.map((row) => ({
      host_key: row.host_key,
      name: row.name,
      path: row.path,
      encrypted_value_hex: row.encrypted_value,
      expires_utc: row.expires_utc,
      is_secure: row.is_secure,
      is_httponly: row.is_httponly,
      samesite: row.samesite,
      has_expires: row.has_expires,
    }));
  }
}
