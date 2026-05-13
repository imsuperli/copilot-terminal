import type {
  KeyboardShortcutAction,
  KeyboardShortcutDefinition,
  KeyboardShortcutModifier,
  KeyboardShortcutSettings,
} from '../types/keyboard-shortcuts';

const VALID_MODIFIERS: KeyboardShortcutModifier[] = ['ctrl', 'meta', 'alt', 'shift'];
type KeyboardShortcutEventLike = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
};

const DEFAULT_KEYBOARD_SHORTCUTS: KeyboardShortcutSettings = {
  quickSwitcher: {
    key: 'Tab',
    modifiers: ['ctrl'],
  },
  quickNav: {
    key: 'Control',
    doubleTap: true,
  },
};

const KEY_ALIASES: Record<string, string> = {
  ctrl: 'Control',
  ctr: 'Control',
  control: 'Control',
  cmd: 'Meta',
  command: 'Meta',
  meta: 'Meta',
  option: 'Alt',
  alt: 'Alt',
  shift: 'Shift',
  tab: 'Tab',
  escape: 'Escape',
  esc: 'Escape',
  enter: 'Enter',
  return: 'Enter',
  space: ' ',
  spacebar: ' ',
};

export function normalizeKeyboardShortcutKey(key: string | undefined, fallback: string): string {
  const trimmedKey = typeof key === 'string' ? key.trim() : '';
  if (!trimmedKey) {
    return fallback;
  }

  const loweredKey = trimmedKey.toLowerCase();
  if (KEY_ALIASES[loweredKey] !== undefined) {
    return KEY_ALIASES[loweredKey];
  }

  if (loweredKey.startsWith('arrow') && loweredKey.length > 'arrow'.length) {
    return `Arrow${loweredKey.slice(5, 6).toUpperCase()}${loweredKey.slice(6)}`;
  }

  return trimmedKey.length === 1 ? trimmedKey.toUpperCase() : trimmedKey;
}

function normalizeModifiers(modifiers?: KeyboardShortcutModifier[]): KeyboardShortcutModifier[] | undefined {
  if (!Array.isArray(modifiers) || modifiers.length === 0) {
    return undefined;
  }

  const nextModifiers = Array.from(new Set(
    modifiers.filter((modifier): modifier is KeyboardShortcutModifier => VALID_MODIFIERS.includes(modifier)),
  ));

  if (nextModifiers.length === 0) {
    return undefined;
  }

  return VALID_MODIFIERS.filter((modifier) => nextModifiers.includes(modifier));
}

function normalizeDefinition(
  definition: KeyboardShortcutDefinition | undefined,
  fallback: KeyboardShortcutDefinition,
): KeyboardShortcutDefinition {
  if (!definition || typeof definition !== 'object') {
    return fallback;
  }

  const rawKey = typeof definition.key === 'string' ? definition.key.trim() : '';
  const recoveredDoubleTapKey = rawKey.match(/^double(?:\s+|\+)(.+)$/i)?.[1];
  const key = normalizeKeyboardShortcutKey(recoveredDoubleTapKey ?? rawKey, fallback.key);
  const modifiers = normalizeModifiers(definition.modifiers);

  if (definition.doubleTap || recoveredDoubleTapKey) {
    return {
      key,
      doubleTap: true,
    };
  }

  return {
    key,
    modifiers,
  };
}

export function getDefaultKeyboardShortcuts(): KeyboardShortcutSettings {
  return DEFAULT_KEYBOARD_SHORTCUTS;
}

export function normalizeKeyboardShortcuts(
  shortcuts?: Partial<KeyboardShortcutSettings>,
): KeyboardShortcutSettings {
  const defaults = getDefaultKeyboardShortcuts();

  return {
    quickSwitcher: normalizeDefinition(shortcuts?.quickSwitcher, defaults.quickSwitcher),
    quickNav: normalizeDefinition(shortcuts?.quickNav, defaults.quickNav),
  };
}

function matchesModifiers(event: KeyboardShortcutEventLike, modifiers?: KeyboardShortcutModifier[]): boolean {
  const expected = new Set(modifiers ?? []);

  return event.ctrlKey === expected.has('ctrl')
    && event.metaKey === expected.has('meta')
    && event.altKey === expected.has('alt')
    && event.shiftKey === expected.has('shift');
}

export function matchesKeyboardShortcut(
  event: KeyboardShortcutEventLike,
  definition: KeyboardShortcutDefinition,
): boolean {
  if (definition.doubleTap) {
    return event.key === definition.key;
  }

  return event.key === definition.key
    && matchesModifiers(event, definition.modifiers);
}

export function isKeyboardShortcutReservedInTerminal(
  definition: KeyboardShortcutDefinition,
): boolean {
  return definition.doubleTap || definition.key === 'Escape' || definition.key === 'Tab';
}

const MODIFIER_DISPLAY_LABELS: Record<KeyboardShortcutModifier, { mac: string; default: string }> = {
  ctrl: { mac: 'Ctrl', default: 'Ctrl' },
  meta: { mac: 'Cmd', default: 'Meta' },
  alt: { mac: 'Alt', default: 'Alt' },
  shift: { mac: 'Shift', default: 'Shift' },
};

const KEY_DISPLAY_LABELS: Record<KeyboardShortcutDefinition['key'], string> = {
  Control: 'Ctrl',
  Meta: 'Meta',
  Alt: 'Alt',
  Shift: 'Shift',
  Tab: 'Tab',
  Escape: 'Esc',
  Enter: 'Enter',
  ' ': 'Space',
};

export function getKeyboardShortcutInputValue(definition: KeyboardShortcutDefinition): string {
  if (definition.doubleTap) {
    return `Double ${KEY_DISPLAY_LABELS[definition.key] ?? definition.key}`;
  }

  const parts = [...(definition.modifiers ?? []), definition.key];
  return parts.map((part) => {
    if (VALID_MODIFIERS.includes(part as KeyboardShortcutModifier)) {
      return MODIFIER_DISPLAY_LABELS[part as KeyboardShortcutModifier].default;
    }
    return KEY_DISPLAY_LABELS[part] ?? part;
  }).join('+');
}

export function formatKeyboardShortcut(
  definition: KeyboardShortcutDefinition,
  platform: string | undefined,
): string {
  if (definition.doubleTap) {
    return `Double ${KEY_DISPLAY_LABELS[definition.key] ?? definition.key}`;
  }

  const isMac = platform === 'darwin';
  const parts = (definition.modifiers ?? []).map((modifier) => (
    isMac ? MODIFIER_DISPLAY_LABELS[modifier].mac : MODIFIER_DISPLAY_LABELS[modifier].default
  ));
  parts.push(KEY_DISPLAY_LABELS[definition.key] ?? definition.key);
  return parts.join('+');
}

export const KEYBOARD_SHORTCUT_ACTIONS: KeyboardShortcutAction[] = [
  'quickSwitcher',
  'quickNav',
];
