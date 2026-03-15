import { existsSync, readdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { platform } from 'os';
import { IDEConfig } from '../types/workspace';

/**
 * 平台特定的 IDE 配置
 */
interface PlatformIDEConfig {
  searchPaths: string[];
  executableName: string;
  iconPaths?: string[];
}

/**
 * IDE 扫描配置
 */
interface IDEScanConfig {
  name: string;
  command: string;
  icon: string;
  win32?: PlatformIDEConfig;
  darwin?: PlatformIDEConfig;
  linux?: PlatformIDEConfig;
}

/**
 * 获取当前平台的配置
 */
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

/**
 * 预定义的 IDE 扫描配置
 */
const IDE_SCAN_CONFIGS: IDEScanConfig[] = [
  {
    name: 'VS Code',
    command: 'code',
    icon: 'vscode',
    win32: {
      searchPaths: [
        'C:\Program Files\Microsoft VS Code',
        'D:\Program Files\Microsoft VS Code',
        'E:\Program Files\Microsoft VS Code',
        'C:\Program Files (x86)\Microsoft VS Code',
        'D:\Program Files (x86)\Microsoft VS Code',
        'E:\Program Files (x86)\Microsoft VS Code',
      ],
      executableName: 'Code.exe',
      iconPaths: ['resources/app/resources/win32/code_70x70.png'],
    },
    darwin: {
      searchPaths: [
        '/Applications/Visual Studio Code.app',
      ],
      executableName: 'Contents/MacOS/Electron',
      iconPaths: ['Contents/Resources/Code.icns'],
    },
    linux: {
      searchPaths: [
        '/usr/share/code',
        '/opt/visual-studio-code',
      ],
      executableName: 'code',
    },
  },
  {
    name: 'IntelliJ IDEA',
    command: 'idea',
    icon: 'idea',
    win32: {
      searchPaths: [
        'C:\Program Files\JetBrains',
        'D:\Program Files\JetBrains',
        'E:\Program Files\JetBrains',
      ],
      executableName: 'idea64.exe',
      iconPaths: ['bin/idea.ico'],
    },
    darwin: {
      searchPaths: [
        '/Applications/IntelliJ IDEA.app',
        '/Applications/IntelliJ IDEA CE.app',
      ],
      executableName: 'Contents/MacOS/idea',
      iconPaths: ['Contents/Resources/idea.icns'],
    },
    linux: {
      searchPaths: [
        '/opt/idea',
      ],
      executableName: 'bin/idea.sh',
    },
  },
  {
    name: 'PyCharm',
    command: 'pycharm',
    icon: 'pycharm',
    win32: {
      searchPaths: [
        'C:\Program Files\JetBrains',
        'D:\Program Files\JetBrains',
        'E:\Program Files\JetBrains',
      ],
      executableName: 'pycharm64.exe',
      iconPaths: ['bin/pycharm.ico'],
    },
    darwin: {
      searchPaths: [
        '/Applications/PyCharm.app',
        '/Applications/PyCharm CE.app',
      ],
      executableName: 'Contents/MacOS/pycharm',
      iconPaths: ['Contents/Resources/pycharm.icns'],
    },
    linux: {
      searchPaths: [
        '/opt/pycharm',
      ],
      executableName: 'bin/pycharm.sh',
    },
  },
  {
    name: 'WebStorm',
    command: 'webstorm',
    icon: 'webstorm',
    win32: {
      searchPaths: [
        'C:\Program Files\JetBrains',
        'D:\Program Files\JetBrains',
        'E:\Program Files\JetBrains',
      ],
      executableName: 'webstorm64.exe',
      iconPaths: ['bin/webstorm.ico'],
    },
    darwin: {
      searchPaths: [
        '/Applications/WebStorm.app',
      ],
      executableName: 'Contents/MacOS/webstorm',
      iconPaths: ['Contents/Resources/webstorm.icns'],
    },
    linux: {
      searchPaths: [
        '/opt/webstorm',
      ],
      executableName: 'bin/webstorm.sh',
    },
  },
  {
    name: 'Android Studio',
    command: 'studio',
    icon: 'androidstudio',
    win32: {
      searchPaths: [
        'C:\Program Files\Android\Android Studio',
        'D:\Program Files\Android\Android Studio',
        'E:\Program Files\Android\Android Studio',
      ],
      executableName: 'studio64.exe',
      iconPaths: ['bin/studio.ico'],
    },
    darwin: {
      searchPaths: [
        '/Applications/Android Studio.app',
      ],
      executableName: 'Contents/MacOS/studio',
      iconPaths: ['Contents/Resources/studio.icns'],
    },
    linux: {
      searchPaths: [
        '/opt/android-studio',
      ],
      executableName: 'bin/studio.sh',
    },
  },
  {
    name: 'Sublime Text',
    command: 'subl',
    icon: 'sublime',
    win32: {
      searchPaths: [
        'C:\Program Files\Sublime Text',
        'D:\Program Files\Sublime Text',
        'E:\Program Files\Sublime Text',
      ],
      executableName: 'sublime_text.exe',
      iconPaths: ['sublime_text.exe'],
    },
    darwin: {
      searchPaths: [
        '/Applications/Sublime Text.app',
      ],
      executableName: 'Contents/MacOS/sublime_text',
      iconPaths: ['Contents/Resources/Sublime Text.icns'],
    },
    linux: {
      searchPaths: [
        '/opt/sublime_text',
      ],
      executableName: 'sublime_text',
    },
  },
];


/**
 * 扫描 JetBrains 产品目录 (Windows)
 */
function scanJetBrainsDirectory(basePath: string, productName: string, executableName: string): string | null {
  if (!existsSync(basePath)) {
    return null;
  }

  try {
    const dirs = readdirSync(basePath, { withFileTypes: true });

    for (const dir of dirs) {
      if (dir.isDirectory() && dir.name.includes(productName)) {
        const binPath = join(basePath, dir.name, 'bin', executableName);
        if (existsSync(binPath)) {
          return binPath;
        }
      }
    }
  } catch (error) {
    console.error(`Failed to scan JetBrains directory ${basePath}:`, error);
  }

  return null;
}

/**
 * 扫描 macOS .app 包
 */
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

/**
 * 扫描IDE图标文件
 */
function scanIconPath(installPath: string, platformConfig: PlatformIDEConfig): string | null {
  if (!platformConfig.iconPaths || platformConfig.iconPaths.length === 0) {
    return null;
  }

  let installDir = dirname(installPath);
  
  // macOS: 如果路径在 .app/Contents/MacOS 下，回退到 .app 根目录
  if (platform() === 'darwin' && installPath.includes('.app/Contents/MacOS')) {
    const appMatch = installPath.match(/^(.+\.app)\//);
    if (appMatch) {
      installDir = appMatch[1];
    }
  }
  
  // Windows: 如果在 bin 目录下，回退到上级目录
  if (platform() === 'win32' && basename(installDir) === 'bin') {
    installDir = dirname(installDir);
  }

  for (const iconPath of platformConfig.iconPaths) {
    const fullIconPath = join(installDir, iconPath);
    if (existsSync(fullIconPath)) {
      return fullIconPath;
    }
  }

  return null;
}

/**
 * 扫描单个 IDE
 */
function scanIDE(config: IDEScanConfig): { path: string | null; iconPath: string | null } {
  const platformConfig = getPlatformConfig(config);
  
  if (!platformConfig) {
    return { path: null, iconPath: null };
  }

  const currentPlatform = platform();
  const isJetBrains = platformConfig.searchPaths.some(p => p.includes('JetBrains'));

  for (const searchPath of platformConfig.searchPaths) {
    let foundPath: string | null = null;

    if (currentPlatform === 'win32' && isJetBrains) {
      // Windows JetBrains 产品需要扫描版本目录
      const productName = config.name.split(' ')[0];
      foundPath = scanJetBrainsDirectory(searchPath, productName, platformConfig.executableName);
    } else if (currentPlatform === 'darwin' && searchPath.endsWith('.app')) {
      // macOS .app 包
      foundPath = scanMacOSApp(searchPath, platformConfig.executableName);
    } else {
      // 其他情况：直接检查路径
      const fullPath = join(searchPath, platformConfig.executableName);
      if (existsSync(fullPath)) {
        foundPath = fullPath;
      }
    }

    if (foundPath) {
      const iconPath = scanIconPath(foundPath, platformConfig);
      return { path: foundPath, iconPath };
    }
  }

  return { path: null, iconPath: null };
}

/**
 * 扫描所有已安装的 IDE
 */
export function scanInstalledIDEs(): IDEConfig[] {
  const installedIDEs: IDEConfig[] = [];

  for (const config of IDE_SCAN_CONFIGS) {
    const { path: foundPath, iconPath } = scanIDE(config);

    if (foundPath) {
      installedIDEs.push({
        id: config.command,
        name: config.name,
        command: config.command,
        path: foundPath,
        enabled: true,
        icon: iconPath || config.icon,
      });
    }
  }

  return installedIDEs;
}

/**
 * 获取默认 IDE 配置
 */
export function getDefaultIDEConfigs(): IDEConfig[] {
  return IDE_SCAN_CONFIGS.map(config => ({
    id: config.command,
    name: config.name,
    command: config.command,
    path: undefined,
    enabled: false,
    icon: config.icon,
  }));
}

/**
 * 扫描特定 IDE
 */
export function scanSpecificIDE(ideName: string): string | null {
  const config = IDE_SCAN_CONFIGS.find(c => c.name === ideName || c.command === ideName);
  if (!config) {
    return null;
  }

  const { path: foundPath } = scanIDE(config);
  return foundPath;
}

/**
 * 获取所有支持的 IDE 名称列表
 */
export function getSupportedIDENames(): string[] {
  return IDE_SCAN_CONFIGS.map(c => c.name);
}
