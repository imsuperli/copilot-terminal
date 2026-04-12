import { describe, expect, it } from 'vitest';
import { resolveToolApprovalDecision } from '../ToolApprovalPolicy';
import type { ToolCall } from '../../../../shared/types/chat';

function createExecuteCommandToolCall(
  command: string,
  requiresApproval = false,
): ToolCall {
  return {
    id: 'tool-1',
    name: 'execute_command',
    params: {
      command,
      requires_approval: requiresApproval,
    },
    status: 'pending',
  };
}

describe('resolveToolApprovalDecision', () => {
  it('allows safe execute_command calls by default', () => {
    const decision = resolveToolApprovalDecision(
      createExecuteCommandToolCall('systemctl status nginx --no-pager'),
    );

    expect(decision).toEqual({ action: 'allow' });
  });

  it('asks for approval when the model marks a command as requiring confirmation', () => {
    const decision = resolveToolApprovalDecision(
      createExecuteCommandToolCall('systemctl restart nginx', true),
      { commandSecurityEnabled: false },
    );

    expect(decision).toEqual({
      action: 'ask',
      reason: '模型将该命令标记为需要确认',
    });
  });

  it('blocks dangerous commands when command security is enabled', () => {
    const decision = resolveToolApprovalDecision(
      createExecuteCommandToolCall('rm -rf /'),
      { commandSecurityEnabled: true },
    );

    expect(decision.action).toBe('block');
    expect(decision.reason).toContain('命令被安全策略阻止');
  });

  it('skips pattern-based blocking when command security is disabled', () => {
    const decision = resolveToolApprovalDecision(
      createExecuteCommandToolCall('rm -rf /'),
      { commandSecurityEnabled: false },
    );

    expect(decision).toEqual({ action: 'allow' });
  });
});
