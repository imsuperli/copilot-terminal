/**
 * ToolExecutor — 桥接 AI 工具调用与 SSH 基础设施
 * 通过已有 SSHPtySession.execCommand 执行远程操作
 */

import type { ToolCall, ToolResult, ChatSshContext } from '../../../shared/types/chat';
import type { IProcessManager } from '../../types/process';
import {
  chatDebugError,
  chatDebugInfo,
  previewText,
} from '../../utils/chatDebugLog';

/** 命令输出最大字符数，超出时截断 */
const MAX_OUTPUT_CHARS = 12000;
/** 截断时保留头部字符数 */
const TRUNCATE_HEAD = 8000;
/** 截断时保留尾部字符数 */
const TRUNCATE_TAIL = 3000;

function truncateOutput(output: string): string {
  if (output.length <= MAX_OUTPUT_CHARS) return output;
  const head = output.slice(0, TRUNCATE_HEAD);
  const tail = output.slice(-TRUNCATE_TAIL);
  const omitted = output.length - TRUNCATE_HEAD - TRUNCATE_TAIL;
  return `${head}\n\n... [输出过长，省略 ${omitted} 字符] ...\n\n${tail}`;
}

export class ToolExecutor {
  constructor(private processManager: IProcessManager) {}

  async execute(tool: ToolCall, sshContext: ChatSshContext): Promise<ToolResult> {
    try {
      chatDebugInfo('ToolExecutor', 'Starting tool execution', {
        toolCallId: tool.id,
        toolName: tool.name,
        params: tool.params,
        sshContext: {
          host: sshContext.host,
          user: sshContext.user,
          cwd: sshContext.cwd ?? null,
          windowId: sshContext.windowId,
          paneId: sshContext.paneId,
        },
      });

      let result: ToolResult;
      switch (tool.name) {
        case 'execute_command':
          result = await this.executeCommand(tool, sshContext);
          break;
        case 'read_file':
          result = await this.readFile(tool, sshContext);
          break;
        case 'glob_search':
          result = await this.globSearch(tool, sshContext);
          break;
        case 'grep_search':
          result = await this.grepSearch(tool, sshContext);
          break;
        case 'ask_followup_question':
        case 'attempt_completion':
          // 这两个工具由 Renderer 处理，主进程不执行
          result = { toolCallId: tool.id, content: '', isError: false };
          break;
        default:
          result = {
            toolCallId: tool.id,
            content: `未知工具: ${tool.name}`,
            isError: true,
          };
          break;
      }

      chatDebugInfo('ToolExecutor', 'Finished tool execution', {
        toolCallId: tool.id,
        toolName: tool.name,
        isError: result.isError ?? false,
        contentLength: result.content.length,
        contentPreview: previewText(result.content, 240),
      });

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      chatDebugError('ToolExecutor', 'Tool execution failed', {
        toolCallId: tool.id,
        toolName: tool.name,
        params: tool.params,
        sshContext: {
          host: sshContext.host,
          user: sshContext.user,
          cwd: sshContext.cwd ?? null,
          windowId: sshContext.windowId,
          paneId: sshContext.paneId,
        },
        error: err,
      });
      return { toolCallId: tool.id, content: `执行错误: ${message}`, isError: true };
    }
  }

  private async execRemote(command: string, sshContext: ChatSshContext): Promise<string> {
    chatDebugInfo('ToolExecutor', 'Dispatching remote SSH command', {
      commandPreview: previewText(command, 240),
      sshContext: {
        host: sshContext.host,
        user: sshContext.user,
        cwd: sshContext.cwd ?? null,
        windowId: sshContext.windowId,
        paneId: sshContext.paneId,
      },
    });
    return this.processManager.execSSHCommand(sshContext.windowId, sshContext.paneId, command);
  }

  private async executeCommand(tool: ToolCall, sshContext: ChatSshContext): Promise<ToolResult> {
    const command = String(tool.params.command ?? '');
    const cwd = sshContext.cwd;
    const fullCommand = cwd ? `cd ${JSON.stringify(cwd)} && ${command}` : command;

    const output = await this.execRemote(fullCommand, sshContext);
    return {
      toolCallId: tool.id,
      content: truncateOutput(output) || '(命令执行完成，无输出)',
    };
  }

  private async readFile(tool: ToolCall, sshContext: ChatSshContext): Promise<ToolResult> {
    const path = String(tool.params.path ?? '');
    const limit = Number(tool.params.limit ?? 200);
    const offset = Number(tool.params.offset ?? 0);

    if (!path) {
      return { toolCallId: tool.id, content: '缺少 path 参数', isError: true };
    }

    // 使用 sed 实现 offset + limit
    const sedCmd = offset > 0
      ? `sed -n '${offset + 1},${offset + limit}p' ${JSON.stringify(path)}`
      : `head -n ${limit} ${JSON.stringify(path)}`;

    const output = await this.execRemote(sedCmd, sshContext);
    return {
      toolCallId: tool.id,
      content: truncateOutput(output) || '(文件为空)',
    };
  }

  private async globSearch(tool: ToolCall, sshContext: ChatSshContext): Promise<ToolResult> {
    const pattern = String(tool.params.pattern ?? '');
    const basePath = String(tool.params.path ?? '.');
    const limit = Number(tool.params.limit ?? 100);

    if (!pattern) {
      return { toolCallId: tool.id, content: '缺少 pattern 参数', isError: true };
    }

    // 将 glob 模式转换为 find 命令
    const findName = pattern.split('/').pop() || '*';
    const cmd = `find ${JSON.stringify(basePath)} -name ${JSON.stringify(findName)} | head -n ${limit}`;

    const output = await this.execRemote(cmd, sshContext);
    return {
      toolCallId: tool.id,
      content: output.trim() || '(未找到匹配文件)',
    };
  }

  private async grepSearch(tool: ToolCall, sshContext: ChatSshContext): Promise<ToolResult> {
    const pattern = String(tool.params.pattern ?? '');
    const basePath = String(tool.params.path ?? '.');
    const include = tool.params.include ? String(tool.params.include) : '';
    const caseSensitive = tool.params.case_sensitive === true;
    const contextLines = Number(tool.params.context_lines ?? 0);
    const maxMatches = Number(tool.params.max_matches ?? 100);

    if (!pattern) {
      return { toolCallId: tool.id, content: '缺少 pattern 参数', isError: true };
    }

    const flags = [
      '-rn',
      caseSensitive ? '' : '-i',
      contextLines > 0 ? `-C ${contextLines}` : '',
      include ? `--include=${JSON.stringify(include)}` : '',
    ].filter(Boolean).join(' ');

    const cmd = `grep ${flags} -E ${JSON.stringify(pattern)} ${JSON.stringify(basePath)} | head -n ${maxMatches}`;

    const output = await this.execRemote(cmd, sshContext);
    return {
      toolCallId: tool.id,
      content: truncateOutput(output) || '(未找到匹配内容)',
    };
  }
}
