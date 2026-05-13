import { describe, expect, it } from 'vitest';
import {
  formatKeyboardShortcut,
  getDefaultKeyboardShortcuts,
  getKeyboardShortcutInputValue,
  matchesKeyboardShortcut,
  normalizeKeyboardShortcuts,
} from '../keyboardShortcuts';

describe('keyboard shortcut utilities', () => {
  it('defaults quick navigation to double Ctrl', () => {
    expect(getDefaultKeyboardShortcuts().quickNav).toEqual({
      key: 'Control',
      doubleTap: true,
    });
  });

  it('normalizes double-tap aliases and display casing', () => {
    const shortcuts = normalizeKeyboardShortcuts({
      quickNav: {
        key: 'ctrl',
        doubleTap: true,
      },
    });

    expect(shortcuts.quickNav).toEqual({
      key: 'Control',
      doubleTap: true,
    });
    expect(getKeyboardShortcutInputValue(shortcuts.quickNav)).toBe('Double Ctrl');
    expect(formatKeyboardShortcut(shortcuts.quickNav, 'win32')).toBe('Double Ctrl');
  });

  it('recovers previously persisted double-tap text values', () => {
    const shortcuts = normalizeKeyboardShortcuts({
      quickNav: {
        key: 'double ctr',
      },
    });

    expect(shortcuts.quickNav).toEqual({
      key: 'Control',
      doubleTap: true,
    });

    const correctedShortcuts = normalizeKeyboardShortcuts({
      quickNav: {
        key: 'Double Ctrl',
      },
    });

    expect(correctedShortcuts.quickNav).toEqual({
      key: 'Control',
      doubleTap: true,
    });
  });

  it('matches browser Control key events for double Ctrl', () => {
    expect(matchesKeyboardShortcut({
      key: 'Control',
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false,
    }, {
      key: 'Control',
      doubleTap: true,
    })).toBe(true);
  });
});
