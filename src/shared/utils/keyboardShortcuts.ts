import type {
  KeyboardShortcutAction,
  KeyboardShortcutDefinition,
  KeyboardShortcutModifier,
  KeyboardShortcutSettings,
} from '../types/keyboard-shortcuts';

const VALID_MODIFIERS: KeyboardShortcutModifier[] = ['ctrl', 'meta', 'alt', 'shift'];
const DEFAULT_KEYBOARD_SHORTCUTS: KeyboardShortcutSettings = {
  quickSwitcher: {
    key: 'Tab',
    modifiers: ['ctrl'],
  },
  quickNav: {
    key: 'Shift',
    doubleTap: true,
  },
};

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

  const key = typeof definition.key === 'string' && definition.key.trim().length > 0
    ? definition.key
    : fallback.key;
  const modifiers = normalizeModifiers(definition.modifiers);

  if (definition.doubleTap) {
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

function matchesModifiers(event: KeyboardEvent, modifiers?: KeyboardShortcutModifier[]): boolean {
  const expected = new Set(modifiers ?? []);

  return event.ctrlKey === expected.has('ctrl')
    && event.metaKey === expected.has('meta')
    && event.altKey === expected.has('alt')
    && event.shiftKey === expected.has('shift');
}

export function matchesKeyboardShortcut(
  event: KeyboardEvent,
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
  Shift: 'Shift',
  Tab: 'Tab',
};

export function formatKeyboardShortcut(
  definition: KeyboardShortcutDefinition,
  platform: string | undefined,
): string {
  if (definition.doubleTap) {
    return `Double ${definition.key}`;
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
