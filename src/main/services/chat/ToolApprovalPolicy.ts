import type { ToolCall } from '../../../shared/types/chat';
import { checkCommandSecurity, type SecurityCheckResult } from './CommandSecurityCheck';

export interface ResolveToolApprovalOptions {
  commandSecurityEnabled?: boolean;
}

export function resolveToolApprovalDecision(
  toolCall: ToolCall,
  options?: ResolveToolApprovalOptions,
): SecurityCheckResult {
  if (toolCall.name !== 'execute_command') {
    return { action: 'allow' };
  }

  const commandSecurityEnabled = options?.commandSecurityEnabled ?? true;
  const requiresApproval = toolCall.params.requires_approval === true;

  if (commandSecurityEnabled) {
    const securityResult = checkCommandSecurity(String(toolCall.params.command ?? ''));
    if (securityResult.action !== 'allow') {
      return securityResult;
    }
  }

  if (requiresApproval) {
    return {
      action: 'ask',
      reason: '模型将该命令标记为需要确认',
    };
  }

  return { action: 'allow' };
}
