import path from 'path';
import { existsSync, accessSync, constants, realpathSync, statSync } from 'fs';

/**
 * 路径验证器
 * 提供安全的路径验证功能，防止路径遍历攻击和访问敏感系统目录
 */
export class PathValidator {
  /**
   * 敏感路径黑名单（Windows）
   */
  private static readonly SENSITIVE_PATHS_WINDOWS = [
    'C:\\Windows\\System32',
    'C:\\Windows\\SysWOW64',
    'C:\\Program Files',
    'C:\\Program Files (x86)',
    'C:\\ProgramData',
    'C:\\$Recycle.Bin',
  ];

  /**
   * 敏感路径黑名单（Unix/Linux/macOS）
   */
  private static readonly SENSITIVE_PATHS_UNIX = [
    '/etc',
    '/root',
    '/sys',
    '/proc',
    '/dev',
    '/boot',
    '/var/log',
  ];

  /**
   * 验证路径是否安全且可访问
   * @param pathToValidate 待验证的路径
   * @returns 验证结果
   */
  static validate(pathToValidate: string): { valid: boolean; reason?: string } {
    try {
      // 1. 检查空路径
      if (!pathToValidate || pathToValidate.trim() === '') {
        return { valid: false, reason: 'Empty path' };
      }

      // 2. 规范化路径（解析 . 和 ..）
      const normalizedPath = path.normalize(pathToValidate);

      // 3. 解析为绝对路径
      const resolvedPath = path.resolve(normalizedPath);

      // 4. 检查路径格式
      if (!this.isValidPathFormat(resolvedPath)) {
        return { valid: false, reason: 'Invalid path format' };
      }

      // 5. 检查是否为敏感路径
      if (this.isSensitivePath(resolvedPath)) {
        return { valid: false, reason: 'Sensitive system path' };
      }

      // 6. 检查路径是否存在
      if (!existsSync(resolvedPath)) {
        return { valid: false, reason: 'Path does not exist' };
      }

      // 7. 检查是否为目录
      const stats = statSync(resolvedPath);
      if (!stats.isDirectory()) {
        return { valid: false, reason: 'Path is not a directory' };
      }

      // 8. 检查符号链接（解析真实路径）
      const realPath = realpathSync(resolvedPath);

      // 如果真实路径与解析路径不同，说明是符号链接
      if (realPath !== resolvedPath) {
        // 再次检查真实路径是否为敏感路径
        if (this.isSensitivePath(realPath)) {
          return { valid: false, reason: 'Symlink points to sensitive path' };
        }
      }

      // 9. 检查读取和执行权限
      try {
        accessSync(realPath, constants.R_OK | constants.X_OK);
      } catch {
        return { valid: false, reason: 'No read/execute permission' };
      }

      // 所有检查通过
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        reason: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * 验证路径是否可安全创建。
   * 允许目标目录当前不存在，但要求其最近的已存在父目录可访问且可写。
   */
  static validateCreatable(pathToValidate: string): { valid: boolean; reason?: string } {
    try {
      if (!pathToValidate || pathToValidate.trim() === '') {
        return { valid: false, reason: 'Empty path' };
      }

      const normalizedPath = path.normalize(pathToValidate);
      const resolvedPath = path.resolve(normalizedPath);

      if (!this.isValidPathFormat(resolvedPath)) {
        return { valid: false, reason: 'Invalid path format' };
      }

      if (this.isSensitivePath(resolvedPath)) {
        return { valid: false, reason: 'Sensitive system path' };
      }

      if (existsSync(resolvedPath)) {
        const stats = statSync(resolvedPath);
        if (!stats.isDirectory()) {
          return { valid: false, reason: 'Path is not a directory' };
        }

        const realPath = realpathSync(resolvedPath);
        if (this.isSensitivePath(realPath)) {
          return { valid: false, reason: 'Symlink points to sensitive path' };
        }

        accessSync(realPath, constants.R_OK | constants.W_OK | constants.X_OK);
        return { valid: true };
      }

      const existingParent = this.findNearestExistingParent(resolvedPath);
      if (!existingParent) {
        return { valid: false, reason: 'Parent path does not exist' };
      }

      const realParentPath = realpathSync(existingParent);
      if (this.isSensitivePath(realParentPath)) {
        return { valid: false, reason: 'Parent path is sensitive' };
      }

      const parentStats = statSync(realParentPath);
      if (!parentStats.isDirectory()) {
        return { valid: false, reason: 'Parent path is not a directory' };
      }

      accessSync(realParentPath, constants.R_OK | constants.W_OK | constants.X_OK);
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        reason: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * 检查路径格式是否合法
   */
  private static isValidPathFormat(pathStr: string): boolean {
    // 检查是否包含非法字符（排除冒号，因为 Windows 驱动器需要）
    const illegalChars = /[<>"|?*\x00-\x1F]/;
    if (illegalChars.test(pathStr)) {
      return false;
    }

    // Windows: 检查是否为有效的驱动器路径
    if (process.platform === 'win32') {
      // 必须以驱动器字母开头（如 C:\）
      if (!/^[A-Za-z]:[\\\/]/.test(pathStr)) {
        return false;
      }
    } else {
      // Unix/Linux/macOS: 必须以 / 开头
      if (!pathStr.startsWith('/')) {
        return false;
      }
    }

    return true;
  }

  /**
   * 检查是否为敏感系统路径
   */
  private static isSensitivePath(pathStr: string): boolean {
    const sensitivePaths = process.platform === 'win32'
      ? this.SENSITIVE_PATHS_WINDOWS
      : this.SENSITIVE_PATHS_UNIX;

    // 规范化路径用于比较
    const normalizedPath = path.normalize(pathStr).toLowerCase();

    for (const sensitivePath of sensitivePaths) {
      const normalizedSensitive = path.normalize(sensitivePath).toLowerCase();

      // 检查是否为敏感路径或其子路径
      if (normalizedPath === normalizedSensitive ||
          normalizedPath.startsWith(normalizedSensitive + path.sep)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 获取安全的规范化路径
   * @param pathToNormalize 待规范化的路径
   * @returns 规范化后的绝对路径，如果无效则返回 null
   */
  static getSafePath(pathToNormalize: string): string | null {
    const result = this.validate(pathToNormalize);
    if (!result.valid) {
      return null;
    }

    try {
      const normalizedPath = path.normalize(pathToNormalize);
      const resolvedPath = path.resolve(normalizedPath);
      const realPath = realpathSync(resolvedPath);
      return realPath;
    } catch {
      return null;
    }
  }

  /**
   * 获取可安全创建的绝对路径。
   */
  static getCreatablePath(pathToNormalize: string): string | null {
    const result = this.validateCreatable(pathToNormalize);
    if (!result.valid) {
      return null;
    }

    try {
      const normalizedPath = path.normalize(pathToNormalize);
      return path.resolve(normalizedPath);
    } catch {
      return null;
    }
  }

  private static findNearestExistingParent(pathStr: string): string | null {
    let currentPath = pathStr;

    while (!existsSync(currentPath)) {
      const parentPath = path.dirname(currentPath);
      if (parentPath === currentPath) {
        return null;
      }
      currentPath = parentPath;
    }

    return currentPath;
  }
}
