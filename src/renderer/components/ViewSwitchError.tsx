import React from 'react';
import { AppNotice, type AppNoticeProps } from './AppNotice';

export type ViewSwitchErrorProps = AppNoticeProps;

/**
 * 兼容旧名称，内部委托给通用的 AppNotice 组件。
 */
export const ViewSwitchError: React.FC<ViewSwitchErrorProps> = ({ message, tone = 'error' }) => {
  return <AppNotice message={message} tone={tone} />;
};

ViewSwitchError.displayName = 'ViewSwitchError';
