import { ClaudeStatusJSON, FormatOptions } from './types';

/**
 * 状态栏渲染器
 */
export class StatusLineRenderer {
  /**
   * 渲染状态栏
   */
  render(data: ClaudeStatusJSON, options: FormatOptions): string {
    const parts: string[] = [];

    // 提取模型信息
    const modelName = this.extractModelName(data.model);
    if (options.showModel && modelName) {
      if (options.format === 'full') {
        parts.push(`Model: ${modelName}`);
      } else {
        parts.push(modelName);
      }
    }

    // 上下文百分比
    if (options.showContext && data.context_window?.used_percentage != null) {
      const percentage = Math.round(data.context_window.used_percentage);
      if (options.format === 'full') {
        parts.push(`Context: ${percentage}%`);
      } else {
        parts.push(`${percentage}%`);
      }
    }

    // 成本
    if (options.showCost && data.cost?.total_cost_usd != null) {
      const cost = data.cost.total_cost_usd.toFixed(2);
      if (options.format === 'full') {
        parts.push(`Cost: $${cost}`);
      } else {
        parts.push(`$${cost}`);
      }
    }

    // 会话时长
    if (options.showTime && data.cost?.total_duration_ms != null) {
      const duration = this.formatDuration(data.cost.total_duration_ms);
      if (options.format === 'full') {
        parts.push(`Time: ${duration}`);
      } else {
        parts.push(duration);
      }
    }

    // Token 统计
    if (options.showTokens && data.context_window) {
      const inputTokens = this.formatTokens(data.context_window.total_input_tokens);
      const outputTokens = this.formatTokens(data.context_window.total_output_tokens);
      if (inputTokens && outputTokens) {
        if (options.format === 'full') {
          parts.push(`In: ${inputTokens} | Out: ${outputTokens}`);
        } else {
          parts.push(`${inputTokens}/${outputTokens}`);
        }
      }
    }

    // 连接各部分
    const separator = options.format === 'full' ? ' | ' : ' • ';
    return parts.join(separator);
  }

  /**
   * 提取模型名称
   */
  private extractModelName(model: ClaudeStatusJSON['model']): string | null {
    if (!model) return null;

    if (typeof model === 'string') {
      return this.simplifyModelName(model);
    }

    const displayName = model.display_name || model.id;
    return displayName ? this.simplifyModelName(displayName) : null;
  }

  /**
   * 简化模型名称
   */
  private simplifyModelName(name: string): string {
    // Claude Sonnet 4.6 → Sonnet 4.6
    // claude-sonnet-4-6 → Sonnet 4.6
    // Claude Opus 4.6 → Opus 4.6
    // codex → Codex

    // 移除 "Claude" 前缀
    name = name.replace(/^Claude\s+/i, '');

    // 转换 ID 格式: claude-sonnet-4-6 → Sonnet 4.6
    if (name.includes('-')) {
      const parts = name.split('-');
      if (parts.length >= 3) {
        const modelType = parts[1]; // sonnet, opus, haiku
        const version = parts.slice(2).join('.'); // 4.6
        return `${this.capitalize(modelType)} ${version}`;
      }
    }

    return name;
  }

  /**
   * 首字母大写
   */
  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  /**
   * 格式化时长
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * 格式化 Token 数量
   */
  private formatTokens(tokens?: number | null): string | null {
    if (tokens == null) return null;

    if (tokens >= 1000000) {
      return `${(tokens / 1000000).toFixed(1)}M`;
    } else if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}k`;
    } else {
      return tokens.toString();
    }
  }
}
