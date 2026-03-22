import type { SettingsPatch } from '../../shared/types/electron-api';

export const WORKSPACE_SETTINGS_UPDATED_EVENT = 'workspace-settings-updated';

export function notifyWorkspaceSettingsUpdated(patch?: SettingsPatch) {
  window.dispatchEvent(new CustomEvent<SettingsPatch | undefined>(WORKSPACE_SETTINGS_UPDATED_EVENT, {
    detail: patch,
  }));
}
