import { useState, useEffect, useCallback } from 'react';
import type { IDEConfig } from '../../shared/types/workspace';

// 创建自定义事件用于通知IDE设置更新
const IDE_SETTINGS_UPDATED_EVENT = 'ide-settings-updated';

// 触发IDE设置更新事件
export function notifyIDESettingsUpdated() {
  window.dispatchEvent(new CustomEvent(IDE_SETTINGS_UPDATED_EVENT));
}

export function useIDESettings() {
  const [ides, setIDEs] = useState<IDEConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const loadIDEs = useCallback(async () => {
    try {
      const response = await window.electronAPI.getSettings();
      if (response.success && response.data) {
        setIDEs(response.data.ides || []);
      }
    } catch (error) {
      console.error('Failed to load IDE settings:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadIDEs();

    // 监听IDE设置更新事件
    const handleSettingsUpdated = () => {
      loadIDEs();
    };

    window.addEventListener(IDE_SETTINGS_UPDATED_EVENT, handleSettingsUpdated);

    return () => {
      window.removeEventListener(IDE_SETTINGS_UPDATED_EVENT, handleSettingsUpdated);
    };
  }, [loadIDEs]);

  const getEnabledIDEs = useCallback(() => {
    return ides.filter(ide => ide.enabled);
  }, [ides]);

  const refreshIDEs = useCallback(() => {
    loadIDEs();
  }, [loadIDEs]);

  return {
    ides,
    enabledIDEs: getEnabledIDEs(),
    loading,
    refreshIDEs,
  };
}
