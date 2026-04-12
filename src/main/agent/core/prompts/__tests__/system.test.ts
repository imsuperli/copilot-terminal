import { describe, expect, it } from 'vitest';
import { buildAgentSystemPrompt } from '../system';
import { McpHub } from '../../../services/mcp/McpHub';
import { SkillsManager } from '../../../services/skills/SkillsManager';

describe('buildAgentSystemPrompt', () => {
  it('includes active skills and MCP tool summaries in the prompt', () => {
    const skillsManager = new SkillsManager();
    const mcpHub = new McpHub();
    mcpHub.registerTool({
      serverName: 'ops-kit',
      toolName: 'query_metrics',
      description: 'Read production metrics',
    });

    const prompt = buildAgentSystemPrompt({
      request: {
        paneId: 'pane-1',
        windowId: 'win-1',
        providerId: 'provider-1',
        model: 'claude-sonnet-4-5',
        text: '检查 nginx error log，并注意 sudo password 提示',
        sshContext: {
          host: '10.0.0.20',
          user: 'root',
          windowId: 'win-1',
          paneId: 'ssh-pane-1',
          cwd: '/srv/app',
        },
      },
      skillsManager,
      mcpHub,
    });

    expect(prompt).toContain('你是一个面向远端服务器排障的任务型 Agent');
    expect(prompt).toContain('Log Analysis');
    expect(prompt).toContain('Interactive Terminal');
    expect(prompt).toContain('ops-kit/query_metrics');
    expect(prompt).toContain('<thinking>');
  });
});
