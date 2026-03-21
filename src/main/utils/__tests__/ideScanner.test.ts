import { describe, expect, it } from 'vitest';
import {
  getDefaultIDEConfigs,
  getOpenInIDEArgs,
  getSupportedIDENames,
  isImageFile,
} from '../ideScanner';

describe('ideScanner helpers', () => {
  it('exposes a broad built-in IDE catalog', () => {
    const supported = getSupportedIDENames();

    expect(supported).toContain('VS Code');
    expect(supported).toContain('Cursor');
    expect(supported).toContain('IntelliJ IDEA');
    expect(supported).toContain('PyCharm');
    expect(supported).toContain('Android Studio');
    expect(supported).toContain('Eclipse');
  });

  it('builds disabled default configs from the catalog', () => {
    const defaults = getDefaultIDEConfigs();
    const vscode = defaults.find(ide => ide.id === 'vscode');

    expect(vscode).toMatchObject({
      id: 'vscode',
      command: 'code',
      enabled: false,
      detected: false,
      isCustom: false,
      catalogId: 'vscode',
    });
  });

  it('returns launch args for detected catalog IDEs and custom IDEs', () => {
    expect(getOpenInIDEArgs({ id: 'vscode', catalogId: 'vscode' }, '/tmp/project')).toEqual(['/tmp/project']);
    expect(getOpenInIDEArgs({ id: 'custom-ide', catalogId: undefined }, '/tmp/project')).toEqual(['/tmp/project']);
  });

  it('recognizes image icon files', () => {
    expect(isImageFile('/tmp/icon.png')).toBe(true);
    expect(isImageFile('/tmp/icon.ico')).toBe(true);
    expect(isImageFile('/tmp/icon.exe')).toBe(false);
  });
});
