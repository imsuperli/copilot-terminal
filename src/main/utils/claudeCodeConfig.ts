import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Claude Code 配置管理
 */
export class ClaudeCodeConfig {
  private configPath: string;
  private backupPath: string;
  private originalStatusLinePath: string; // 保存原始 statusLine 配置

  constructor() {
    // Claude Code 配置文件路径
    const claudeDir = path.join(os.homedir(), '.claude');
    this.configPath = path.join(claudeDir, 'settings.json');
    this.backupPath = path.join(claudeDir, 'settings.json.backup');
    this.originalStatusLinePath = path.join(claudeDir, 'statusline.original.json');
  }

  /**
   * 检查 Claude Code 是否已安装
   */
  isClaudeCodeInstalled(): boolean {
    return fs.existsSync(path.dirname(this.configPath));
  }

  /**
   * 检查是否存在其他 statusLine 配置
   * @returns 如果存在其他配置，返回配置对象；否则返回 null
   */
  checkExistingStatusLine(): any | null {
    const config = this.getCurrentConfig();
    if (!config || !config.statusLine) {
      return null;
    }

    // 检查是否是我们自己的配置
    const command = config.statusLine.command || '';
    if ((command.includes('synapse') || command.includes('Synapse')) && command.includes('statusline')) {
      return null; // 是我们自己的配置，不算冲突
    }

    // 存在其他 statusLine 配置
    return config.statusLine;
  }

  /**
   * 配置 statusLine 插件
   * @param pluginPath 插件路径
   * @param force 是否强制覆盖现有配置（默认 true，直接覆盖）
   */
  async configure(pluginPath: string, force: boolean = true): Promise<void> {
    // 确保目录存在
    const claudeDir = path.dirname(this.configPath);
    if (!fs.existsSync(claudeDir)) {
      fs.mkdirSync(claudeDir, { recursive: true });
    }

    // 读取现有配置
    let config: any = {};
    if (fs.existsSync(this.configPath)) {
      const content = fs.readFileSync(this.configPath, 'utf-8');
      try {
        config = JSON.parse(content);
      } catch (error) {
        console.error('Failed to parse Claude Code settings:', error);
        config = {};
      }
    }

    // 检查是否存在其他 statusLine 配置
    const existingStatusLine = this.checkExistingStatusLine();

    // 如果存在其他配置，保存到专门的备份文件（无论是否强制覆盖）
    if (existingStatusLine) {
      try {
        fs.writeFileSync(
          this.originalStatusLinePath,
          JSON.stringify(existingStatusLine, null, 2),
          'utf-8'
        );
        console.log('[ClaudeCodeConfig] Saved original statusLine config to backup');
      } catch (error) {
        console.error('[ClaudeCodeConfig] Failed to save original config:', error);
      }
    }

    // 备份完整配置
    if (fs.existsSync(this.configPath)) {
      try {
        fs.copyFileSync(this.configPath, this.backupPath);
      } catch (error) {
        console.error('[ClaudeCodeConfig] Failed to backup settings:', error);
      }
    }

    // 配置 statusLine（确保格式正确，避免 Claude Code CLI 异常）
    config.statusLine = {
      type: 'command',
      command: `node "${pluginPath}"`,
      padding: 0,
    };

    // 写入配置
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8');

    console.log('[ClaudeCodeConfig] Configured statusLine plugin');
  }

  /**
   * 移除 statusLine 配置
   * @param restoreOriginal 是否恢复原始配置（默认 true）
   */
  async remove(restoreOriginal: boolean = true): Promise<void> {
    if (!fs.existsSync(this.configPath)) {
      return;
    }

    // 读取现有配置
    const content = fs.readFileSync(this.configPath, 'utf-8');
    let config: any = {};

    try {
      config = JSON.parse(content);
    } catch (error) {
      console.error('Failed to parse Claude Code settings:', error);
      return;
    }

    // 移除 statusLine 配置
    if (config.statusLine) {
      delete config.statusLine;

      // 如果存在原始配置备份，恢复它
      if (restoreOriginal && fs.existsSync(this.originalStatusLinePath)) {
        try {
          const originalContent = fs.readFileSync(this.originalStatusLinePath, 'utf-8');
          const originalStatusLine = JSON.parse(originalContent);
          config.statusLine = originalStatusLine;
          console.log('[ClaudeCodeConfig] Restored original statusLine config');

          // 删除备份文件
          fs.unlinkSync(this.originalStatusLinePath);
        } catch (error) {
          console.error('Failed to restore original statusLine config:', error);
        }
      }

      // 写入配置
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8');

      console.log('[ClaudeCodeConfig] Removed statusLine plugin');
    }
  }

  /**
   * 恢复备份配置
   */
  async restore(): Promise<void> {
    if (fs.existsSync(this.backupPath)) {
      fs.copyFileSync(this.backupPath, this.configPath);
      console.log('[ClaudeCodeConfig] Restored backup configuration');
    }
  }

  /**
   * 获取当前配置
   */
  getCurrentConfig(): any {
    if (!fs.existsSync(this.configPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(this.configPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.error('Failed to read Claude Code settings:', error);
      return null;
    }
  }

  /**
   * 检查是否已配置 statusLine
   */
  isConfigured(): boolean {
    const config = this.getCurrentConfig();
    return config && config.statusLine != null;
  }

  /**
   * 检查是否配置了我们的 statusLine 插件
   */
  isOurPluginConfigured(): boolean {
    const config = this.getCurrentConfig();
    if (!config || !config.statusLine) {
      return false;
    }

    const command = config.statusLine.command || '';
    return (command.includes('synapse') || command.includes('Synapse')) && command.includes('statusline');
  }
}
