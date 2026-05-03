import type { AgentSendRequest } from '../../../../shared/types/agent';
import type { McpHub } from '../../services/mcp/McpHub';
import type { SkillsManager } from '../../services/skills/SkillsManager';

interface BuildAgentSystemPromptOptions {
  request: AgentSendRequest;
  skillsManager: SkillsManager;
  mcpHub: McpHub;
}

export function buildAgentSystemPrompt({
  request,
  skillsManager,
  mcpHub,
}: BuildAgentSystemPromptOptions): string {
  const sshContext = request.sshContext;
  const environmentDetails = request.environmentDetails?.trim() || '无';
  const contextFragments = request.contextFragments ?? [];
  const skillInstructions = skillsManager.getSystemPromptAddendum({
    sshBound: Boolean(sshContext),
    userMessage: request.text,
  });
  const mcpSummary = mcpHub.describeAvailableTools();
  const contextSummary = contextFragments.length > 0
    ? [
        '附加文件上下文：',
        ...contextFragments.map((fragment) => (
          `文件 ${fragment.label} (${fragment.path})：\n${fragment.content}`
        )),
      ].join('\n\n')
    : '';

  return [
    '你是一个面向远端服务器排障的任务型 Agent，而不是普通聊天助手。',
    '你必须优先获取真实事实，再给结论。禁止伪造远端连接、命令执行、日志内容或检查结果。',
    '当需要说明你的分析过程时，使用 <thinking>...</thinking> 输出简短、面向用户可见的推理摘要；最终回答写在标签外。',
    '工具调用规则：',
    '- 需要真实远端事实时，直接调用工具，不要先说空话。',
    '- execute_command 用于真实执行远端命令；只读诊断命令 requires_approval=false；有副作用命令 requires_approval=true。',
    '- 如果命令可能需要用户交互、密码、确认、分页器或菜单选择，interactive=true。',
    '- 对已知文件内容搜索优先 grep_search；路径发现优先 glob_search；读取文件正文用 read_file。',
    '- 如果没有 SSH 绑定上下文，禁止声称已经连接服务器，只能明确说明缺少连接。',
    sshContext
      ? `当前绑定 SSH：host=${sshContext.host}, user=${sshContext.user}${sshContext.cwd ? `, cwd=${sshContext.cwd}` : ''}`
      : '当前没有绑定可执行 SSH 会话。',
    `环境探测：\n${environmentDetails}`,
    contextSummary,
    skillInstructions,
    mcpSummary,
    request.systemPrompt?.trim()
      ? `附加用户 system prompt：\n${request.systemPrompt.trim()}`
      : '',
  ].filter(Boolean).join('\n\n');
}
