import fs from 'fs-extra';
import path from 'path';
import { app } from 'electron';
import { randomUUID } from 'crypto';
import { Workspace, Settings } from '../types/workspace';
import { LayoutNode, PaneNode, SplitNode, WindowStatus } from '../../shared/types/window';
import { AppLanguage, DEFAULT_LANGUAGE, normalizeLanguage } from '../../shared/i18n';
import { scanInstalledIDEs } from '../utils/ideScanner';
import { readProjectConfig } from '../utils/project-config';
import { normalizeShellProgram } from '../utils/shell';

/**
 * WorkspaceManager 接口
 * 负责工作区配置的保存和加载
 */
export interface IWorkspaceManager {
  saveWorkspace(workspace: Workspace): Promise<void>;
  loadWorkspace(): Promise<Workspace>;
  backupWorkspace(): Promise<void>;
  recoverFromCrash(): Promise<void>;
}

/**
 * WorkspaceManager 实现
 *
 * 功能：
 * - 保存工作区配置到本地 JSON 文件
 * - 加载工作区配置
 * - 原子写入机制（临时文件 + 重命名）
 * - 自动备份（保留最近 3 个版本）
 * - 崩溃恢复（检查临时文件）
 * - 数据校验（JSON 格式和版本）
 */
export class WorkspaceManagerImpl implements IWorkspaceManager {
  private workspacePath: string;
  private tempPath: string;
  private backupBasePath: string;

  constructor() {
    // 获取用户数据目录
    // Windows: %APPDATA%/copilot-terminal
    // macOS: ~/Library/Application Support/copilot-terminal
    const userDataPath = app.getPath('userData');
    this.workspacePath = path.join(userDataPath, 'workspace.json');
    this.tempPath = `${this.workspacePath}.tmp`;
    this.backupBasePath = `${this.workspacePath}.backup`;
  }

  /**
   * 保存工作区配置
   * 使用原子写入机制确保数据完整性
   */
  async saveWorkspace(workspace: Workspace): Promise<void> {
    try {
      // 🔥 保存前检查：如果新数据明显少于旧数据，创建紧急备份
      if (await fs.pathExists(this.workspacePath)) {
        try {
          const oldWorkspace = await fs.readJson(this.workspacePath);
          const oldWindowCount = oldWorkspace.windows?.length || 0;
          const newWindowCount = workspace.windows?.length || 0;

          // 如果旧数据有窗口，但新数据为空，创建紧急备份
          if (oldWindowCount > 0 && newWindowCount === 0) {
            console.warn(`[WorkspaceManager] Attempting to save empty workspace (old: ${oldWindowCount} windows), creating emergency backup`);
            const emergencyBackupPath = `${this.workspacePath}.emergency.${Date.now()}`;
            await fs.copy(this.workspacePath, emergencyBackupPath);
            console.log(`[WorkspaceManager] Emergency backup created: ${emergencyBackupPath}`);
          }

          // 如果新数据比旧数据少很多（超过 50%），也创建警告备份
          if (oldWindowCount > 5 && newWindowCount < oldWindowCount * 0.5) {
            console.warn(`[WorkspaceManager] Significant data loss detected (old: ${oldWindowCount}, new: ${newWindowCount}), creating warning backup`);
            const warningBackupPath = `${this.workspacePath}.warning.${Date.now()}`;
            await fs.copy(this.workspacePath, warningBackupPath);
            console.log(`[WorkspaceManager] Warning backup created: ${warningBackupPath}`);
          }
        } catch (error) {
          // 读取旧数据失败不应该阻止保存
          console.error('[WorkspaceManager] Failed to read old workspace for comparison:', error);
        }
      }

      // 创建副本并添加时间戳（避免修改输入参数）
      const workspaceToSave = {
        ...workspace,
        lastSavedAt: new Date().toISOString(),
      };

      // 确保目录存在
      await fs.ensureDir(path.dirname(this.workspacePath));

      // 写入临时文件
      await fs.writeJson(this.tempPath, workspaceToSave, { spaces: 2 });

      // 原子重命名（如果目标文件存在，会被覆盖）
      await fs.rename(this.tempPath, this.workspacePath);

      // 创建备份
      await this.backupWorkspace();
    } catch (error) {
      // 清理临时文件
      await fs.remove(this.tempPath).catch(() => {});
      throw new Error(`Failed to save workspace: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 加载工作区配置
   * 如果文件不存在或损坏，尝试从备份恢复
   * 自动迁移旧版数据结构到新版
   * 加载后将所有窗格重置为暂停状态
   */
  async loadWorkspace(): Promise<Workspace> {
    try {
      // 检查工作区文件是否存在
      if (await fs.pathExists(this.workspacePath)) {
        const workspace = await fs.readJson(this.workspacePath);

        // 校验数据格式
        if (this.validateWorkspace(workspace)) {
          // 如果是旧版数据（version 1.0），迁移到新版
          if (workspace.version === '1.0') {
            console.log('Migrating workspace from version 1.0 to 2.0');
            const migratedWorkspace = this.migrateWorkspace(workspace);
            // 保存迁移后的数据
            await this.saveWorkspace(migratedWorkspace);
            return this.resetPaneStates(migratedWorkspace);
          }

          const hydratedWorkspace = this.hydrateWorkspace(workspace);
          if (JSON.stringify(hydratedWorkspace.settings) !== JSON.stringify(workspace.settings)) {
            await this.saveWorkspace(hydratedWorkspace);
          }

          return this.resetPaneStates(hydratedWorkspace);
        }

        // 校验失败，尝试从备份恢复
        console.warn('Workspace validation failed, attempting to restore from backup');
        return await this.restoreFromBackup();
      }

      // 文件不存在，返回默认工作区
      return this.getDefaultWorkspace();
    } catch (error) {
      console.error('Failed to load workspace:', error);

      // 尝试从备份恢复
      return await this.restoreFromBackup();
    }
  }

  /**
   * 重置所有窗格状态为暂停
   * 在加载工作区后调用，确保所有窗格都是暂停状态（不启动 PTY 进程）
   * 同时重新读取每个窗口的 copilot.json 配置
   */
  private resetPaneStates(workspace: Workspace): Workspace {
    const resetWindows = workspace.windows.map(window => {
      const resetLayout = this.resetLayoutPaneStates(window.layout);

      // 获取窗口的工作目录（从第一个窗格）
      const firstPane = this.getFirstPane(window.layout);
      const workingDirectory = firstPane?.cwd;

      // 重新读取 copilot.json 配置
      let projectConfig = window.projectConfig;
      if (workingDirectory) {
        const config = readProjectConfig(workingDirectory);
        if (config) {
          projectConfig = config;
        }
      }

      return {
        ...window,
        layout: resetLayout,
        projectConfig,
      };
    });

    return {
      ...workspace,
      windows: resetWindows,
    };
  }

  /**
   * 获取布局树中的第一个窗格
   */
  private getFirstPane(layout: LayoutNode): PaneNode['pane'] | null {
    if (layout.type === 'pane') {
      return layout.pane;
    } else {
      if (layout.children.length > 0) {
        return this.getFirstPane(layout.children[0]);
      }
      return null;
    }
  }

  /**
   * 递归重置布局树中所有窗格的状态
   */
  private resetLayoutPaneStates(layout: LayoutNode): LayoutNode {
    if (layout.type === 'pane') {
      return {
        ...layout,
        pane: {
          ...layout.pane,
          status: WindowStatus.Paused,
          pid: null,
        },
      };
    } else {
      return {
        ...layout,
        children: layout.children.map((child) => this.resetLayoutPaneStates(child)),
      };
    }
  }

  /**
   * 迁移旧版工作区到新版
   */
  private migrateWorkspace(oldWorkspace: Partial<Workspace> & { windows: any[] }): Workspace {
    const migratedWindows = oldWorkspace.windows.map((oldWindow: any) => {
      // 如果已经是新版格式，直接返回
      if (oldWindow.layout) {
        return oldWindow;
      }

      // 迁移旧版窗口到新版
      const paneId = randomUUID();
      const pane = {
        id: paneId,
        cwd: oldWindow.workingDirectory,
        command: oldWindow.command,
        status: oldWindow.status,
        pid: oldWindow.pid,
        lastOutput: oldWindow.lastOutput,
      };

      const layout: PaneNode = {
        type: 'pane' as const,
        id: paneId,
        pane,
      };

      return {
        id: oldWindow.id,
        name: oldWindow.name,
        layout,
        activePaneId: paneId,
        createdAt: oldWindow.createdAt,
        lastActiveAt: oldWindow.lastActiveAt,
        archived: oldWindow.archived,
      };
    });

    return {
      version: '2.0',
      windows: migratedWindows,
      settings: this.normalizeSettings(oldWorkspace.settings),
      lastSavedAt: oldWorkspace.lastSavedAt || new Date().toISOString(),
    };
  }

  /**
   * 备份工作区配置
   * 保留最近 3 个版本
   */
  async backupWorkspace(): Promise<void> {
    try {
      // 检查主文件是否存在
      if (!(await fs.pathExists(this.workspacePath))) {
        return;
      }

      // 删除最旧的备份（backup.3）
      const backup3 = `${this.backupBasePath}.3`;
      if (await fs.pathExists(backup3)) {
        await fs.remove(backup3);
      }

      // 轮转备份文件：backup.2 -> backup.3, backup.1 -> backup.2
      for (let i = 2; i >= 1; i--) {
        const oldPath = `${this.backupBasePath}.${i}`;
        const newPath = `${this.backupBasePath}.${i + 1}`;
        if (await fs.pathExists(oldPath)) {
          await fs.rename(oldPath, newPath);
        }
      }

      // 创建新备份（backup.1）
      await fs.copy(this.workspacePath, `${this.backupBasePath}.1`);
    } catch (error) {
      console.error('Failed to backup workspace:', error);
      // 备份失败不应该阻止主流程
    }
  }

  /**
   * 崩溃恢复
   * 启动时检查临时文件，恢复未完成的写入
   */
  async recoverFromCrash(): Promise<void> {
    try {
      // 检查临时文件是否存在
      if (await fs.pathExists(this.tempPath)) {
        console.log('Detected incomplete save operation, attempting recovery');

        try {
          // 尝试读取临时文件并验证
          const workspace = await fs.readJson(this.tempPath);

          if (this.validateWorkspace(workspace)) {
            // 临时文件有效，恢复到主文件
            await fs.rename(this.tempPath, this.workspacePath);
            console.log('Successfully recovered workspace from temporary file');
          } else {
            // 临时文件无效，删除它
            await fs.remove(this.tempPath);
            console.warn('Temporary file is invalid, removed');
          }
        } catch (error) {
          // 临时文件损坏，尝试从备份恢复
          console.error('Temporary file is corrupted, attempting backup recovery:', error);
          await fs.remove(this.tempPath);

          // 尝试从备份恢复
          const backup1 = `${this.backupBasePath}.1`;
          if (await fs.pathExists(backup1)) {
            await fs.copy(backup1, this.workspacePath);
            console.log('Recovered workspace from backup.1');
          }
        }
      }
    } catch (error) {
      console.error('Failed to recover from crash:', error);
      // 恢复失败不应该阻止应用启动
    }
  }

  /**
   * 从备份恢复工作区
   */
  private async restoreFromBackup(): Promise<Workspace> {
    // 尝试从 backup.1, backup.2, backup.3 依次恢复
    for (let i = 1; i <= 3; i++) {
      const backupPath = `${this.backupBasePath}.${i}`;

      if (await fs.pathExists(backupPath)) {
        try {
          const workspace = await fs.readJson(backupPath);

          if (this.validateWorkspace(workspace)) {
            // 恢复到主文件（使用 writeJson 而不是 copy，避免文件系统竞态）
            try {
              await fs.writeJson(this.workspacePath, workspace, { spaces: 2 });
              console.log(`Restored workspace from backup.${i}`);
              return this.resetPaneStates(workspace);
            } catch (writeError) {
              console.error(`Failed to write restored workspace from backup.${i}:`, writeError);
              // 继续尝试下一个备份
            }
          }
        } catch (error) {
          console.error(`Failed to restore from backup.${i}:`, error);
        }
      }
    }

    // 所有备份都失败，返回默认工作区
    console.warn('All backup restoration attempts failed, using default workspace');
    return this.getDefaultWorkspace();
  }

  /**
   * 校验工作区数据格式
   * 支持旧版和新版数据结构
   */
  private validateWorkspace(workspace: unknown): workspace is Workspace {
    if (!workspace || typeof workspace !== 'object') {
      return false;
    }

    const ws = workspace as Record<string, any>;

    // 检查必需字段
    if (typeof ws.version !== 'string') {
      return false;
    }

    if (!Array.isArray(ws.windows)) {
      return false;
    }

    // 验证每个窗口对象的基本结构
    for (const window of ws.windows) {
      if (!window || typeof window !== 'object') {
        return false;
      }
      if (typeof window.id !== 'string' ||
          typeof window.name !== 'string' ||
          typeof window.createdAt !== 'string' ||
          typeof window.lastActiveAt !== 'string') {
        return false;
      }

      // 检查是否是新版数据结构（有 layout 字段）
      if (window.layout) {
        // 新版数据结构：验证 layout 和 activePaneId
        if (!this.validateLayoutNode(window.layout)) {
          return false;
        }
        if (typeof window.activePaneId !== 'string') {
          return false;
        }
      } else {
        // 旧版数据结构：验证旧字段
        if (typeof window.workingDirectory !== 'string' ||
            typeof window.command !== 'string' ||
            typeof window.status !== 'string' ||
            (window.pid !== null && typeof window.pid !== 'number')) {
          return false;
        }
      }
    }

    if (!ws.settings || typeof ws.settings !== 'object') {
      return false;
    }

    // 检查 settings 字段
    const settings = ws.settings;
    if (
      typeof settings.notificationsEnabled !== 'boolean' ||
      (settings.theme !== 'dark' && settings.theme !== 'light') ||
      typeof settings.autoSave !== 'boolean' ||
      typeof settings.autoSaveInterval !== 'number'
    ) {
      return false;
    }

    // 版本检查（支持 1.0 和 2.0）
    if (ws.version !== '1.0' && ws.version !== '2.0') {
      console.warn(`Unsupported workspace version: ${ws.version}`);
      return false;
    }

    return true;
  }

  /**
   * 验证布局节点
   */
  private validateLayoutNode(node: unknown): node is LayoutNode {
    if (!node || typeof node !== 'object') {
      return false;
    }

    const n = node as Record<string, any>;

    if (n.type === 'pane') {
      // 验证 PaneNode
      if (typeof n.id !== 'string' || !n.pane) {
        return false;
      }
      const pane = n.pane;
      if (typeof pane.id !== 'string' ||
          typeof pane.cwd !== 'string' ||
          typeof pane.command !== 'string' ||
          typeof pane.status !== 'string') {
        return false;
      }
      // pid 字段可以不存在、为 null 或为 number
      if (pane.pid !== undefined && pane.pid !== null && typeof pane.pid !== 'number') {
        return false;
      }
      return true;
    } else if (n.type === 'split') {
      // 验证 SplitNode
      if ((n.direction !== 'horizontal' && n.direction !== 'vertical') ||
          !Array.isArray(n.sizes) ||
          !Array.isArray(n.children)) {
        return false;
      }
      // 递归验证子节点
      for (const child of n.children) {
        if (!this.validateLayoutNode(child)) {
          return false;
        }
      }
      return true;
    }

    return false;
  }

  /**
   * 获取默认工作区配置
   */
  private getDefaultWorkspace(): Workspace {
    return {
      version: '2.0',
      windows: [],
      settings: this.getDefaultSettings(),
      lastSavedAt: '',
    };
  }

  private hydrateWorkspace(workspace: Workspace): Workspace {
    return {
      ...workspace,
      settings: this.normalizeSettings(workspace.settings),
    };
  }

  private normalizeSettings(settings?: Partial<Settings>): Settings {
    const defaults = this.getDefaultSettings();

    return {
      ...defaults,
      ...settings,
      language: this.resolveLanguage(settings?.language),
      ides: settings?.ides ?? defaults.ides,
      terminal: {
        useBundledConptyDll: settings?.terminal?.useBundledConptyDll ?? defaults.terminal?.useBundledConptyDll ?? true,
        defaultShellProgram: normalizeShellProgram(settings?.terminal?.defaultShellProgram) ?? defaults.terminal?.defaultShellProgram ?? '',
      },
    };
  }

  private getDefaultSettings(): Settings {
    return {
      notificationsEnabled: true,
      theme: 'dark',
      autoSave: true,
      autoSaveInterval: 5,
      language: this.resolveLanguage(),
      ides: scanInstalledIDEs(),
      terminal: {
        useBundledConptyDll: true,
        defaultShellProgram: '',
      },
    };
  }

  private resolveLanguage(language?: AppLanguage | string | null): AppLanguage {
    if (typeof language === 'string') {
      return normalizeLanguage(language);
    }

    try {
      return normalizeLanguage(app.getLocale?.());
    } catch {
      return DEFAULT_LANGUAGE;
    }
  }
}
