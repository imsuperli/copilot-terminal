import { useCallback, useEffect, useState } from 'react';
import type { SettingsPatch } from '../../shared/types/electron-api';
import type { KeyboardShortcutSettings } from '../../shared/types/keyboard-shortcuts';
import { normalizeKeyboardShortcuts } from '../../shared/utils/keyboardShortcuts';
import { WORKSPACE_SETTINGS_UPDATED_EVENT } from '../utils/settingsEvents';

export function useKeyboardShortcutSettings() {
  const [shortcuts, setShortcuts] = useState<KeyboardShortcutSettings>(normalizeKeyboardShortcuts());

  const loadShortcutSettings = useCallback(async () => {
    try {
      const response = await window.electronAPI.getSettings();
      if (response.success && response.data) {
        setShortcuts(normalizeKeyboardShortcuts(response.data.keyboardShortcuts));
      }
    } catch (error) {
      console.error('Failed to load keyboard shortcut settings:', error);
    }
  }, []);

  useEffect(() => {
    void loadShortcutSettings();
  }, [loadShortcutSettings]);

  useEffect(() => {
    const handleSettingsUpdated = (event: Event) => {
      const patch = (event as CustomEvent<SettingsPatch | undefined>).detail;
      if (patch?.keyboardShortcuts) {
        setShortcuts((currentShortcuts) => normalizeKeyboardShortcuts({
          ...currentShortcuts,
          ...patch.keyboardShortcuts,
        }));
        return;
      }

      if (!patch) {
        void loadShortcutSettings();
      }
    };

    window.addEventListener(WORKSPACE_SETTINGS_UPDATED_EVENT, handleSettingsUpdated);
    return () => {
      window.removeEventListener(WORKSPACE_SETTINGS_UPDATED_EVENT, handleSettingsUpdated);
    };
  }, [loadShortcutSettings]);

  return shortcuts;
}
