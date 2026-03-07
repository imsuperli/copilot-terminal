/**
 * 快捷导航类型定义
 */

/**
 * 快捷导航项类型
 */
export type QuickNavType = 'url' | 'folder';

/**
 * 快捷导航项接口
 */
export interface QuickNavItem {
  id: string;           // 唯一标识符
  name: string;         // 显示名称（可编辑）
  type: QuickNavType;   // 类型：url 或 folder
  path: string;         // URL 地址或文件夹路径
  icon?: string;        // 自定义图标（可选）
  order: number;        // 排序顺序
}

/**
 * 快捷导航配置接口
 */
export interface QuickNavConfig {
  items: QuickNavItem[];
}
