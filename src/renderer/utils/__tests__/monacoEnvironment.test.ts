import { afterEach, describe, expect, it } from 'vitest';
import { configureMonacoNls } from '../monacoEnvironment';

type MonacoGlobal = typeof globalThis & {
  _VSCODE_NLS_LANGUAGE?: string;
  _VSCODE_NLS_MESSAGES?: Array<string | null>;
};

const monacoGlobal = globalThis as MonacoGlobal;

describe('configureMonacoNls', () => {
  afterEach(() => {
    delete monacoGlobal._VSCODE_NLS_LANGUAGE;
    delete monacoGlobal._VSCODE_NLS_MESSAGES;
  });

  it('loads bundled Simplified Chinese messages before Monaco starts', async () => {
    await configureMonacoNls('zh-CN');

    expect(monacoGlobal._VSCODE_NLS_LANGUAGE).toBe('zh-cn');
    expect(monacoGlobal._VSCODE_NLS_MESSAGES).toContain('转到定义');
  });

  it('keeps Monaco in English when the app language is English', async () => {
    monacoGlobal._VSCODE_NLS_LANGUAGE = 'zh-cn';
    monacoGlobal._VSCODE_NLS_MESSAGES = ['转到定义'];

    await configureMonacoNls('en-US');

    expect(monacoGlobal._VSCODE_NLS_LANGUAGE).toBe('en');
    expect(monacoGlobal._VSCODE_NLS_MESSAGES).toBeUndefined();
  });
});
