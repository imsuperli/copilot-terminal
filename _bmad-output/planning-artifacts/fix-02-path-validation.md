# 修复方案 #2: 路径验证不够严格（安全风险）

**问题编号**: FIX-002
**优先级**: 🔴 高（安全风险）
**预计工作量**: 1-2 小时
**风险等级**: 低（只是加强验证，不改变功能）

---

## 1. 问题分析

### 1.1 当前问题

**代码位置**: `src/main/index.ts` Line 617-631

```typescript
ipcMain.handle('validate-path', async (_event, pathToValidate: string) => {
  try {
    // 检查路径是否存在
    if (!existsSync(pathToValidate)) {
      return false;
    }

    // 检查是否有读取和执行权限
    try {
      accessSync(pathToValidate, constants.R_OK | constants.X_OK);
      return true;
    } catch {
      return false;
    }
  } catch (error) {
    return false;
  }
});
```

### 1.2 安全问题

1. **路径遍历攻击（Path Traversal）**
   - 没有规范化路径，可能包含 `..` 等相对路径
   - 攻击者可能访问系统敏感目录
   - 例如：`C:\Windows\System32\..\..\..\..\Users\Admin\Documents`

2. **符号链接攻击（Symlink Attack）**
   - 没有检查符号链接
   - 可能通过符号链接访问受限目录

3. **敏感路径访问**
   - 没有限制访问系统敏感目录
   - 例如：`C:\Windows\System32`, `/etc`, `/root`

4. **空路径或特殊字符**
   - 没有验证路径格式
   - 可能导致意外行为

### 1.3 影响范围

**使用 validate-path 的地方**:
- 创建窗口时验证工作目录
- 启动窗口时验证工作目录
- 用户选择目录时验证

**潜在风险**:
- 用户可能无意中访问系统目录
- 恶意用户可能利用路径遍历访问敏感文件
- 可能导致权限提升或信息泄露

---

## 2. 解决方案设计

### 2.1 核心原则

1. **路径规范化** - 解析所有相对路径和符号链接
2. **边界检查** - 限制访问范围（可选）
3. **敏感路径黑名单** - 禁止访问系统敏感目录
4. **格式验证** - 检查路径格式合法性

### 2.2 实施策略

```typescript
// 1. 路径规范化
const normalizedPath = path.normalize(pathToValidate);
const resolvedPath = path.resolve(normalizedPath);

// 2. 检查路径格式
if (!isValidPathFormat(resolvedPath)) {
  return false;
}

// 3. 检查敏感路径黑名单
if (isSensitivePath(resolvedPath)) {
  return false;
}

// 4. 检查符号链接（可选）
const realPath = fs.realpathSync(resolvedPath);
if (realPath !== resolvedPath) {
  // 符号链接，需要额外验证
}

// 5. 检查存在性和权限
if (!existsSync(resolvedPath)) {
  return false;
}

accessSync(resolvedPath, constants.R_OK | constants.X_OK);
return true;
```

---

## 3. 实施步骤

### 步骤 1: 创建路径验证工具类

**文件**: `src/main/utils/pathValidator.ts`

```typescript
import path from 'path';
import { existsSync, accessSync, constants, realpathSync, statSync } from 'fs';

/**
 * 路径验证器
 * 提供安全的路径验证功能，防止路径遍历攻击
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
   * 检查路径格式是否合法
   */
  private static isValidPathFormat(pathStr: string): boolean {
    // 检查是否包含非法字符
    const illegalChars = /[<>"|?*\x00-\x1F]/;
    if (illegalChars.test(pathStr)) {
      return false;
    }

    // Windows: 检查是否为有效的驱动器路径
    if (process.platform === 'win32') {
      // 必须以驱动器字母开头（如 C:\）
      if (!/^[A-Za-z]:\\/.test(pathStr)) {
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
}
```

### 步骤 2: 修改 validate-path handler

**修改文件**: `src/main/index.ts`

```typescript
// 在文件顶部添加导入
import { PathValidator } from './utils/pathValidator';

// 修改 validate-path handler (Line 617-631)
ipcMain.handle('validate-path', async (_event, pathToValidate: string) => {
  const result = PathValidator.validate(pathToValidate);

  if (process.env.NODE_ENV === 'development' && !result.valid) {
    console.log(`[PathValidator] Path validation failed: ${pathToValidate}, reason: ${result.reason}`);
  }

  return result.valid;
});
```

### 步骤 3: 加强 create-window 和 start-window 的路径验证

**修改 create-window handler** (Line 380-389):

```typescript
// 验证工作目录存在且可访问
const pathValidation = PathValidator.validate(config.workingDirectory);
if (!pathValidation.valid) {
  throw new Error(`工作目录无效: ${pathValidation.reason}`);
}

// 使用安全的规范化路径
const safePath = PathValidator.getSafePath(config.workingDirectory);
if (!safePath) {
  throw new Error('无法解析工作目录路径');
}

// 使用 safePath 而不是 config.workingDirectory
const handle = await processManager.spawnTerminal({
  workingDirectory: safePath,
  command: command,
  windowId: windowId,
  paneId: paneId,
});
```

**修改 start-window handler** (Line 489-497):

```typescript
// 验证工作目录存在且可访问
const pathValidation = PathValidator.validate(workingDirectory);
if (!pathValidation.valid) {
  throw new Error(`工作目录无效: ${pathValidation.reason}`);
}

// 使用安全的规范化路径
const safePath = PathValidator.getSafePath(workingDirectory);
if (!safePath) {
  throw new Error('无法解析工作目录路径');
}

// 使用 safePath
const handle = await processManager.spawnTerminal({
  workingDirectory: safePath,
  command: shellCommand,
  windowId: windowId,
  paneId: paneId,
});
```

---

## 4. 测试计划

### 4.1 单元测试

创建 `src/main/utils/pathValidator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { PathValidator } from './pathValidator';
import path from 'path';
import os from 'os';

describe('PathValidator', () => {
  describe('validate', () => {
    it('should accept valid user directory', () => {
      const userHome = os.homedir();
      const result = PathValidator.validate(userHome);
      expect(result.valid).toBe(true);
    });

    it('should reject empty path', () => {
      const result = PathValidator.validate('');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Empty path');
    });

    it('should reject non-existent path', () => {
      const result = PathValidator.validate('/nonexistent/path/12345');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Path does not exist');
    });

    it('should reject path traversal attempts', () => {
      const maliciousPath = path.join(os.homedir(), '..', '..', '..', 'etc');
      const result = PathValidator.validate(maliciousPath);
      // 应该被规范化并检查
      expect(result.valid).toBe(false);
    });

    if (process.platform === 'win32') {
      it('should reject Windows system paths', () => {
        const result = PathValidator.validate('C:\\Windows\\System32');
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('Sensitive system path');
      });
    } else {
      it('should reject Unix system paths', () => {
        const result = PathValidator.validate('/etc');
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('Sensitive system path');
      });
    }
  });

  describe('getSafePath', () => {
    it('should return normalized path for valid directory', () => {
      const userHome = os.homedir();
      const safePath = PathValidator.getSafePath(userHome);
      expect(safePath).toBeTruthy();
      expect(path.isAbsolute(safePath!)).toBe(true);
    });

    it('should return null for invalid path', () => {
      const safePath = PathValidator.getSafePath('/nonexistent/path');
      expect(safePath).toBeNull();
    });
  });
});
```

### 4.2 集成测试场景

**场景 1: 正常路径**
1. 创建窗口，使用用户主目录
2. ✅ 验证：窗口创建成功

**场景 2: 路径遍历攻击**
1. 尝试创建窗口，使用 `C:\Users\..\..\Windows\System32`
2. ✅ 验证：创建失败，显示错误信息

**场景 3: 符号链接**
1. 创建符号链接指向敏感目录
2. 尝试使用该符号链接创建窗口
3. ✅ 验证：创建失败

**场景 4: 相对路径**
1. 尝试使用相对路径 `../../etc`
2. ✅ 验证：被规范化并检查，如果指向敏感路径则拒绝

---

## 5. 安全考虑

### 5.1 敏感路径黑名单

**Windows**:
- `C:\Windows\System32` - 系统核心文件
- `C:\Windows\SysWOW64` - 32位系统文件
- `C:\Program Files` - 程序安装目录
- `C:\ProgramData` - 应用数据
- `C:\$Recycle.Bin` - 回收站

**Unix/Linux/macOS**:
- `/etc` - 系统配置
- `/root` - root 用户主目录
- `/sys` - 系统信息
- `/proc` - 进程信息
- `/dev` - 设备文件
- `/boot` - 启动文件
- `/var/log` - 系统日志

### 5.2 可配置的黑名单（可选）

如果需要更灵活的配置，可以将黑名单移到配置文件：

```typescript
// src/main/config/security.ts
export const SecurityConfig = {
  pathBlacklist: {
    windows: [
      'C:\\Windows\\System32',
      // ...
    ],
    unix: [
      '/etc',
      // ...
    ],
  },
  allowSymlinks: false, // 是否允许符号链接
};
```

---

## 6. 向后兼容性

### 6.1 现有工作区

- 现有工作区中的路径会在加载时重新验证
- 如果路径无效，窗口保持暂停状态
- 用户需要手动选择新的有效路径

### 6.2 错误处理

- 提供清晰的错误信息
- 在开发模式下记录详细日志
- 在生产模式下隐藏敏感信息

---

## 7. 性能影响

### 7.1 额外开销

- 路径规范化：< 1ms
- 符号链接解析：< 5ms
- 权限检查：< 1ms
- **总计**：< 10ms（可忽略）

### 7.2 优化建议

- 缓存验证结果（可选）
- 异步验证（已经是异步）

---

## 8. 验收标准

- [ ] PathValidator 类创建完成
- [ ] 所有单元测试通过
- [ ] validate-path handler 使用 PathValidator
- [ ] create-window handler 加强路径验证
- [ ] start-window handler 加强路径验证
- [ ] 路径遍历攻击被正确阻止
- [ ] 敏感路径访问被正确阻止
- [ ] 符号链接正确处理
- [ ] 现有功能不受影响
- [ ] 错误信息清晰友好

---

## 9. 文档更新

需要更新以下文档：

1. **CLAUDE.md** - 添加安全路径验证说明
2. **README.md** - 添加安全特性说明（如果有）
3. **代码注释** - 添加安全考虑的注释

---

**准备开始实施？请确认后我将开始修改代码。**
