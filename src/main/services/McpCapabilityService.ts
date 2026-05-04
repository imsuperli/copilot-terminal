import type { McpServerConfigSnapshot, McpToolSnapshot } from '../../shared/types/task';
import type { McpHub } from '../agent/services/mcp/McpHub';

export class McpCapabilityService {
  private readonly getHub: () => McpHub | null;

  constructor(getHub: () => McpHub | null) {
    this.getHub = getHub;
  }

  listServerSnapshots(): McpServerConfigSnapshot[] {
    const hub = this.getHub();
    if (!hub) {
      return [];
    }

    const grouped = new Map<string, McpToolSnapshot[]>();
    for (const tool of hub.listTools()) {
      const tools = grouped.get(tool.serverName) ?? [];
      tools.push({
        serverName: tool.serverName,
        toolName: tool.toolName,
        description: tool.description,
      });
      grouped.set(tool.serverName, tools);
    }

    return Array.from(grouped.entries())
      .map(([serverName, tools]) => ({
        serverName,
        toolCount: tools.length,
        tools: tools.sort((left, right) => left.toolName.localeCompare(right.toolName)),
      }))
      .sort((left, right) => left.serverName.localeCompare(right.serverName));
  }
}
