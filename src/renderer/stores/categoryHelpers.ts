import { CustomCategory } from '../../shared/types/custom-category';

/**
 * 更新 settings 中的 customCategories
 * 通过 IPC 调用保存到持久化存储
 */
export async function updateSettingsCategories(categories: CustomCategory[]): Promise<void> {
  if (!window.electronAPI) {
    console.warn('[CategoryHelpers] electronAPI not available');
    return;
  }

  try {
    const response = await window.electronAPI.updateSettings({
      customCategories: categories,
    });

    if (!response.success) {
      console.error('[CategoryHelpers] Failed to update settings:', response.error);
    }
  } catch (error) {
    console.error('[CategoryHelpers] Error updating settings:', error);
  }
}
