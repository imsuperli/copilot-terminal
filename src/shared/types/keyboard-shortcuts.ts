export type KeyboardShortcutAction =
  | 'quickSwitcher'
  | 'quickNav';

export type KeyboardShortcutModifier =
  | 'ctrl'
  | 'meta'
  | 'alt'
  | 'shift';

export interface KeyboardShortcutDefinition {
  key: string;
  modifiers?: KeyboardShortcutModifier[];
  doubleTap?: boolean;
}

export type KeyboardShortcutSettings = Record<KeyboardShortcutAction, KeyboardShortcutDefinition>;
