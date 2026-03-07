/**
 * Claude Code 传递的状态 JSON 结构
 */
export interface ClaudeStatusJSON {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  model?: string | {
    id?: string;
    display_name?: string;
  };
  version?: string;
  cost?: {
    total_cost_usd?: number;
    total_duration_ms?: number;
  };
  context_window?: {
    context_window_size?: number;
    total_input_tokens?: number;
    total_output_tokens?: number;
    used_percentage?: number;
  };
}

/**
 * 格式化选项
 */
export interface FormatOptions {
  format: 'full' | 'compact';
  showModel: boolean;
  showContext: boolean;
  showCost: boolean;
  showTime: boolean;
  showTokens: boolean;
}
