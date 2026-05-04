import { describe, expect, it } from 'vitest';
import { McpCapabilityService } from '../McpCapabilityService';

describe('McpCapabilityService', () => {
  it('groups tools by server and sorts servers and tool names', () => {
    const service = new McpCapabilityService(() => ({
      listTools: () => [
        { serverName: 'filesystem', toolName: 'write_file', description: 'write' },
        { serverName: 'filesystem', toolName: 'read_file', description: 'read' },
        { serverName: 'github', toolName: 'list_prs', description: 'prs' },
      ],
    } as any));

    expect(service.listServerSnapshots()).toEqual([
      {
        serverName: 'filesystem',
        toolCount: 2,
        tools: [
          { serverName: 'filesystem', toolName: 'read_file', description: 'read' },
          { serverName: 'filesystem', toolName: 'write_file', description: 'write' },
        ],
      },
      {
        serverName: 'github',
        toolCount: 1,
        tools: [
          { serverName: 'github', toolName: 'list_prs', description: 'prs' },
        ],
      },
    ]);
  });

  it('returns an empty snapshot list when no MCP hub is available', () => {
    const service = new McpCapabilityService(() => null);
    expect(service.listServerSnapshots()).toEqual([]);
  });
});
