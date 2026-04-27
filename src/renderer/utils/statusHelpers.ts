import { WindowStatus } from '../types/window';
import { TranslationKey } from '../i18n';

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
  switch (status) {
    case WindowStatus.Running:
      return 'bg-[rgb(var(--appearance-running-accent-rgb))]';
    case WindowStatus.WaitingForInput:
      return 'bg-[rgb(var(--primary))]';
    case WindowStatus.Completed:
    case WindowStatus.Paused:
      return 'bg-[rgb(var(--muted-foreground))]';
    case WindowStatus.Error:
      return 'bg-[rgb(var(--error))]';
    case WindowStatus.Restoring:
      return 'bg-[rgb(var(--warning))]';
    default:
      return 'bg-[rgb(var(--border))]';
  }
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
  switch (status) {
    case WindowStatus.Running:
      return 'text-[rgb(var(--appearance-running-accent-rgb))]';
    case WindowStatus.WaitingForInput:
      return 'text-[rgb(var(--primary))]';
    case WindowStatus.Completed:
    case WindowStatus.Paused:
      return 'text-[rgb(var(--muted-foreground))]';
    case WindowStatus.Error:
      return 'text-[rgb(var(--error))]';
    case WindowStatus.Restoring:
      return 'text-[rgb(var(--warning))]';
    default:
      return 'text-[rgb(var(--border))]';
  }
}

/**
 * 获取窗口状态对应的实际颜色值（用于内联样式）
 * @param status 窗口状态
 * @returns 十六进制颜色值
 */
export function getStatusColorValue(status: WindowStatus): string {
  switch (status) {
    case WindowStatus.Running:
      return 'rgb(var(--appearance-running-accent-rgb))';
    case WindowStatus.WaitingForInput:
      return 'rgb(var(--primary))';
    case WindowStatus.Completed:
    case WindowStatus.Paused:
      return 'rgb(var(--muted-foreground))';
    case WindowStatus.Error:
      return 'rgb(var(--error))';
    case WindowStatus.Restoring:
      return 'rgb(var(--warning))';
    default:
      return 'rgb(var(--border))';
  }
}
