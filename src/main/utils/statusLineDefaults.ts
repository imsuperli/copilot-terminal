import { StatusLineConfig } from '../types/workspace';

/**
 * StatusLine 默认配置
 */
export const DEFAULT_STATUSLINE_CONFIG: StatusLineConfig = {
  enabled: false,
  displayLocation: 'both',
  cliFormat: 'full',
  cardFormat: 'compact',
  showModel: true,
  showContext: true,
  showCost: true,
  showTime: false,
  showTokens: false,
};

/**
 * 获取 StatusLine 配置（带默认值）
 */
export function getStatusLineConfig(config?: Partial<StatusLineConfig>): StatusLineConfig {
  return {
    ...DEFAULT_STATUSLINE_CONFIG,
    ...config,
  };
}
