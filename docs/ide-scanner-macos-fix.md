# IDE 扫描器 macOS 兼容性修复

## 修改日期
2026-03-15

## 问题描述
原有的 `src/main/utils/ideScanner.ts` 文件中,所有 IDE 扫描路径都硬编码为 Windows 路径,导致在 macOS 和 Linux 上完全无法使用 IDE 集成功能。

## 解决方案

### 1. 重构数据结构
将原有的单一配置结构改为平台特定的配置结构:

```typescript
interface IDEScanConfig {
  name: string;
  command: string;
  icon: string;
  win32?: PlatformIDEConfig;   // Windows 配置
  darwin?: PlatformIDEConfig;  // macOS 配置
  linux?: PlatformIDEConfig;   // Linux 配置
}
```

### 2. 添加平台检测逻辑
使用 `os.platform()` 动态选择当前平台的配置:

```typescript
function getPlatformConfig(config: IDEScanConfig): PlatformIDEConfig | null {
  const currentPlatform = platform();

  if (currentPlatform === 'win32' && config.win32) {
    return config.win32;
  }

  if (currentPlatform === 'darwin' && config.darwin) {
    return config.darwin;
  }

  if (currentPlatform === 'linux' && config.linux) {
    return config.linux;
  }

  return null;
}
```

### 3. 支持 macOS .app 包结构
添加专门的 macOS .app 包扫描函数:

```typescript
function scanMacOSApp(appPath: string, executableRelativePath: string): string | null {
  if (!existsSync(appPath)) {
    return null;
  }

  const executablePath = join(appPath, executableRelativePath);
  if (existsSync(executablePath)) {
    return executablePath;
  }

  return null;
}
```

### 4. 配置的 IDE 和路径

#### Windows
- VS Code: `C:\Program Files\Microsoft VS Code\Code.exe`
- IntelliJ IDEA: `C:\Program Files\JetBrains\IntelliJ IDEA *\bin\idea64.exe`
- PyCharm: `C:\Program Files\JetBrains\PyCharm *\bin\pycharm64.exe`
- WebStorm: `C:\Program Files\JetBrains\WebStorm *\bin\webstorm64.exe`
- Android Studio: `C:\Program Files\Android\Android Studio\bin\studio64.exe`
- Sublime Text: `C:\Program Files\Sublime Text\sublime_text.exe`

#### macOS
- VS Code: `/Applications/Visual Studio Code.app/Contents/MacOS/Electron`
- IntelliJ IDEA: `/Applications/IntelliJ IDEA.app/Contents/MacOS/idea`
- PyCharm: `/Applications/PyCharm.app/Contents/MacOS/pycharm`
- WebStorm: `/Applications/WebStorm.app/Contents/MacOS/webstorm`
- Android Studio: `/Applications/Android Studio.app/Contents/MacOS/studio`
- Sublime Text: `/Applications/Sublime Text.app/Contents/MacOS/sublime_text`

#### Linux
- VS Code: `/usr/share/code/code`
- IntelliJ IDEA: `/opt/idea/bin/idea.sh`
- PyCharm: `/opt/pycharm/bin/pycharm.sh`
- WebStorm: `/opt/webstorm/bin/webstorm.sh`
- Android Studio: `/opt/android-studio/bin/studio.sh`
- Sublime Text: `/opt/sublime_text/sublime_text`

## 向后兼容性
- Windows 平台的所有功能保持不变
- 原有的 JetBrains 版本目录扫描逻辑在 Windows 上继续工作
- 所有导出的函数签名保持不变

## 测试
创建了手动测试脚本 `src/main/utils/test-ide-scanner.ts`,可以通过以下命令运行:

```bash
npx tsx src/main/utils/test-ide-scanner.ts
```

## 注意事项
1. macOS 上的 IDE 图标路径为 `.icns` 文件
2. Linux 上的 JetBrains IDE 使用 `.sh` 脚本启动
3. 如果某个平台没有配置,`getPlatformConfig()` 会返回 `null`,该 IDE 在该平台上不会被扫描

## 后续优化建议
1. 添加对 JetBrains Toolbox 安装路径的支持(macOS/Linux)
2. 添加对用户自定义安装路径的支持
3. 考虑使用系统命令(如 `which`, `where`)来查找 IDE
