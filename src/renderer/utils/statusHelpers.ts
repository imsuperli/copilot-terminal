import { WindowStatus } from '../types/window';

/**
 * 获取窗口状态对应的颜色类名
 * @param status 窗口状态
 * @returns Tailwind CSS 颜色类名
 */
export function getStatusColor(status: WindowStatus): string {
  const statusColorMap: Record<WindowStatus, string> = {
    [WindowStatus.Running]: 'bg-blue-500',
    [WindowStatus.WaitingForInput]: 'bg-amber-500',
    [WindowStatus.Completed]: 'bg-green-500',
    [WindowStatus.Error]: 'bg-red-500',
    [WindowStatus.Restoring]: 'bg-gray-500'
  };

  return statusColorMap[status];
}

/**
 * 获取窗口状态对应的中文标签
 * @param status 窗口状态
 * @returns 中文状态标签
 */
export function getStatusLabel(status: WindowStatus): string {
  const statusLabelMap: Record<WindowStatus, string> = {
    [WindowStatus.Running]: '运行中',
    [WindowStatus.WaitingForInput]: '等待输入',
    [WindowStatus.Completed]: '已完成',
    [WindowStatus.Error]: '出错',
    [WindowStatus.Restoring]: '恢复中'
  };

  return statusLabelMap[status];
}
