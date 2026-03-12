import { existsSync, readdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { IDEConfig } from '../types/workspace';

/**
 * IDE 扫描配置
 */
interface IDEScanConfig {
  name: string;
  command: string;
  icon: string;
  searchPaths: string[];  // 可能的安装路径模式
  executableName: string; // 可执行文件名
  iconPaths?: string[];   // 可能的图标文件路径(相对于安装目录)
}

/**
 * 预定义的 IDE 扫描配置
 */
const IDE_SCAN_CONFIGS: IDEScanConfig[] = [
  {
    name: 'VS Code',
    command: 'code',
    icon: 'vscode',
    searchPaths: [
      'C:\\Program Files\\Microsoft VS Code',
      'D:\\Program Files\\Microsoft VS Code',
      'E:\\Program Files\\Microsoft VS Code',
      'C:\\Program Files (x86)\\Microsoft VS Code',
      'D:\\Program Files (x86)\\Microsoft VS Code',
      'E:\\Program Files (x86)\\Microsoft VS Code',
      'C:\\ProgramData\\Microsoft VS Code',
      'D:\\ProgramData\\Microsoft VS Code',
      'E:\\ProgramData\\Microsoft VS Code',
    ],
    executableName: 'Code.exe',
    iconPaths: ['resources/app/resources/win32/code_70x70.png'],
  },
  {
    name: 'IntelliJ IDEA',
    command: 'idea',
    icon: 'idea',
    searchPaths: [
      'C:\\Program Files\\JetBrains',
      'D:\\Program Files\\JetBrains',
      'E:\\Program Files\\JetBrains',
      'C:\\Program Files (x86)\\JetBrains',
      'D:\\Program Files (x86)\\JetBrains',
      'E:\\Program Files (x86)\\JetBrains',
      'C:\\ProgramData\\JetBrains',
      'D:\\ProgramData\\JetBrains',
      'E:\\ProgramData\\JetBrains',
    ],
    executableName: 'idea64.exe',
    iconPaths: ['bin/idea.ico'],
  },
  {
    name: 'PyCharm',
    command: 'pycharm',
    icon: 'pycharm',
    searchPaths: [
      'C:\\Program Files\\JetBrains',
      'D:\\Program Files\\JetBrains',
      'E:\\Program Files\\JetBrains',
      'C:\\Program Files (x86)\\JetBrains',
      'D:\\Program Files (x86)\\JetBrains',
      'E:\\Program Files (x86)\\JetBrains',
      'C:\\ProgramData\\JetBrains',
      'D:\\ProgramData\\JetBrains',
      'E:\\ProgramData\\JetBrains',
    ],
    executableName: 'pycharm64.exe',
    iconPaths: ['bin/pycharm.ico'],
  },
  {
    name: 'WebStorm',
    command: 'webstorm',
    icon: 'webstorm',
    searchPaths: [
      'C:\\Program Files\\JetBrains',
      'D:\\Program Files\\JetBrains',
      'E:\\Program Files\\JetBrains',
      'C:\\Program Files (x86)\\JetBrains',
      'D:\\Program Files (x86)\\JetBrains',
      'E:\\Program Files (x86)\\JetBrains',
      'C:\\ProgramData\\JetBrains',
      'D:\\ProgramData\\JetBrains',
      'E:\\ProgramData\\JetBrains',
    ],
    executableName: 'webstorm64.exe',
    iconPaths: ['bin/webstorm.ico'],
  },
  {
    name: 'Android Studio',
    command: 'studio',
    icon: 'androidstudio',
    searchPaths: [
      'C:\\Program Files\\Android\\Android Studio',
      'D:\\Program Files\\Android\\Android Studio',
      'E:\\Program Files\\Android\\Android Studio',
      'C:\\Program Files (x86)\\Android\\Android Studio',
      'D:\\Program Files (x86)\\Android\\Android Studio',
      'E:\\Program Files (x86)\\Android\\Android Studio',
      'C:\\ProgramData\\Android\\Android Studio',
      'D:\\ProgramData\\Android\\Android Studio',
      'E:\\ProgramData\\Android\\Android Studio',
    ],
    executableName: 'studio64.exe',
    iconPaths: ['bin/studio.ico'],
  },
  {
    name: 'Sublime Text',
    command: 'subl',
    icon: 'sublime',
    searchPaths: [
      'C:\\Program Files\\Sublime Text',
      'D:\\Program Files\\Sublime Text',
      'E:\\Program Files\\Sublime Text',
      'C:\\Program Files (x86)\\Sublime Text',
      'D:\\Program Files (x86)\\Sublime Text',
      'E:\\Program Files (x86)\\Sublime Text',
      'C:\\ProgramData\\Sublime Text',
      'D:\\ProgramData\\Sublime Text',
      'E:\\ProgramData\\Sublime Text',
    ],
    executableName: 'sublime_text.exe',
    iconPaths: ['sublime_text.exe'],
  },
];

/**
 * 扫描 JetBrains 产品目录
 */
function scanJetBrainsDirectory(basePath: string, productName: string, executableName: string): string | null {
  if (!existsSync(basePath)) {
    return null;
  }

  try {
    const dirs = readdirSync(basePath, { withFileTypes: true });

    // 查找匹配的产品目录（如 "IntelliJ IDEA 2024.3"）
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
 * 扫描IDE图标文件
 * @param installPath IDE安装路径(可执行文件路径)
 * @param config IDE配置
 * @returns 图标文件的完整路径,如果未找到则返回null
 */
function scanIconPath(installPath: string, config: IDEScanConfig): string | null {
  if (!config.iconPaths || config.iconPaths.length === 0) {
    return null;
  }

  // 获取IDE安装目录(去掉可执行文件名和bin目录)
  let installDir = dirname(installPath);
  if (basename(installDir) === 'bin') {
    installDir = dirname(installDir);
  }

  // 尝试查找图标文件
  for (const iconPath of config.iconPaths) {
    const fullIconPath = join(installDir, iconPath);

    if (existsSync(fullIconPath)) {
      return fullIconPath;
    }
  }

  console.warn(`Icon not found for ${config.name} under ${installDir}`);
  return null;
}

/**
 * 扫描单个 IDE
 */
function scanIDE(config: IDEScanConfig): { path: string | null; iconPath: string | null } {
  // 对于 JetBrains 产品，需要扫描子目录
  const isJetBrains = config.searchPaths.some(p => p.includes('JetBrains'));

  for (const searchPath of config.searchPaths) {
    let foundPath: string | null = null;

    if (isJetBrains) {
      // JetBrains 产品需要扫描版本目录
      const productName = config.name.split(' ')[0]; // 提取产品名称（如 "IntelliJ"）
      foundPath = scanJetBrainsDirectory(searchPath, productName, config.executableName);
    } else {
      // 其他 IDE 直接检查路径
      const fullPath = join(searchPath, config.executableName);
      if (existsSync(fullPath)) {
        foundPath = fullPath;
      } else {
        // 也检查 bin 子目录
        const binPath = join(searchPath, 'bin', config.executableName);
        if (existsSync(binPath)) {
          foundPath = binPath;
        }
      }
    }

    if (foundPath) {
      // 找到IDE后,扫描图标路径
      const iconPath = scanIconPath(foundPath, config);
      return { path: foundPath, iconPath };
    }
  }

  return { path: null, iconPath: null };
}

/**
 * 扫描所有已安装的 IDE
 * 只返回成功找到的IDE
 */
export function scanInstalledIDEs(): IDEConfig[] {
  const installedIDEs: IDEConfig[] = [];

  for (const config of IDE_SCAN_CONFIGS) {
    const { path: foundPath, iconPath } = scanIDE(config);

    // 只添加找到的IDE
    if (foundPath) {
      installedIDEs.push({
        id: config.command,
        name: config.name,
        command: config.command,
        path: foundPath,
        enabled: true, // 找到的IDE默认启用
        icon: iconPath || config.icon, // 优先使用扫描到的图标路径,否则使用默认标识符
      });
    }
  }

  return installedIDEs;
}

/**
 * 获取默认 IDE 配置（如果没有扫描到任何 IDE）
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
