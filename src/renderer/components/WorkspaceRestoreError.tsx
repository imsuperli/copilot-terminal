import React from 'react';
import { useI18n } from '../i18n';

/**
 * WorkspaceRestoreError 组件属性
 */
interface WorkspaceRestoreErrorProps {
  error: string;
  onRetry?: () => void;
  onRecoverFromBackup?: () => void;
}

/**
 * WorkspaceRestoreError 组件
 *
 * 功能：
 * - 显示工作区加载失败的错误提示
 * - 提供"重试"按钮
 * - 提供"从备份恢复"按钮
 */
export const WorkspaceRestoreError: React.FC<WorkspaceRestoreErrorProps> = ({
  error,
  onRetry,
  onRecoverFromBackup,
}) => {
  const { t } = useI18n();

  return (
    <div className="workspace-restore-error">
      <div className="error-icon">⚠️</div>
      <h2 className="error-title">{t('workspaceRestore.title')}</h2>
      <p className="error-message">{error}</p>
      <div className="error-actions">
        {onRetry && (
          <button className="btn-retry" onClick={onRetry}>
            {t('common.retry')}
          </button>
        )}
        {onRecoverFromBackup && (
          <button className="btn-recover" onClick={onRecoverFromBackup}>
            {t('common.recoverFromBackup')}
          </button>
        )}
      </div>
    </div>
  );
};
