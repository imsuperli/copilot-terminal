import { WindowStatus } from '../types/window';
import { TranslationKey } from '../i18n';

/**
 * 状态色映射表（常量，避免重复创建）
 */
const STATUS_COLOR_MAP: Record<WindowStatus, string> = {
  [WindowStatus.Running]: 'bg-green-500',
  [WindowStatus.WaitingForInput]: 'bg-[rgb(var(--primary))]',
  [WindowStatus.Completed]: 'bg-gray-400',
  [WindowStatus.Error]: 'bg-red-500',
  [WindowStatus.Restoring]: 'bg-gray-500',
  [WindowStatus.Paused]: 'bg-gray-400'
};

/**
 * 状态实际颜色值映射表（用于内联样式）
 */
const STATUS_COLOR_VALUE_MAP: Record<WindowStatus, string> = {
  [WindowStatus.Running]: '#16c60c',
  [WindowStatus.WaitingForInput]: '#a8aa58',
  [WindowStatus.Completed]: '#9ca3af', // gray-400
  [WindowStatus.Error]: '#ef4444', // red-500
  [WindowStatus.Restoring]: '#6b7280', // gray-500
  [WindowStatus.Paused]: '#9ca3af' // gray-400
};

/**
 * 状态文字色映射表（text-* 变体，用于文字和图标着色）
 */
const STATUS_TEXT_COLOR_MAP: Record<WindowStatus, string> = {
  [WindowStatus.Running]: 'text-green-500',
  [WindowStatus.WaitingForInput]: 'text-[rgb(var(--primary))]',
  [WindowStatus.Completed]: 'text-gray-400',
  [WindowStatus.Error]: 'text-red-500',
  [WindowStatus.Restoring]: 'text-gray-500',
  [WindowStatus.Paused]: 'text-gray-400'
};

/**
 * 状态标签映射表（常量，避免重复创建）
 */
const STATUS_LABEL_KEY_MAP: Record<WindowStatus, TranslationKey> = {
  [WindowStatus.Running]: 'status.running',
  [WindowStatus.WaitingForInput]: 'status.waitingInput',
  [WindowStatus.Completed]: 'status.notStarted',
  [WindowStatus.Error]: 'status.error',
  [WindowStatus.Restoring]: 'status.restoring',
  [WindowStatus.Paused]: 'status.notStarted'
};

/**
 * 获取窗口状态对应的颜色类名
 * @param status 窗口状态
 * @returns Tailwind CSS 颜色类名
 */
export function getStatusColor(status: WindowStatus): string {
  return STATUS_COLOR_MAP[status];
}

/**
 * 获取窗口状态对应的翻译 key
 * @param status 窗口状态
 * @returns 状态翻译 key
 */
export function getStatusLabelKey(status: WindowStatus): TranslationKey {
  return STATUS_LABEL_KEY_MAP[status];
}

/**
 * 获取窗口状态对应的文字颜色类名（text-* 变体）
 * @param status 窗口状态
 * @returns Tailwind CSS text-* 颜色类名
 */
export function getStatusTextColor(status: WindowStatus): string {
  return STATUS_TEXT_COLOR_MAP[status];
}

/**
 * 获取窗口状态对应的实际颜色值（用于内联样式）
 * @param status 窗口状态
 * @returns 十六进制颜色值
 */
export function getStatusColorValue(status: WindowStatus): string {
  return STATUS_COLOR_VALUE_MAP[status];
}
