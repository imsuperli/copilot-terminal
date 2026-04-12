export interface McpRegisteredTool {
  serverName: string;
  toolName: string;
  description?: string;
}

export class McpHub {
  private readonly tools = new Map<string, McpRegisteredTool>();

  registerTool(tool: McpRegisteredTool): void {
    this.tools.set(`${tool.serverName}:${tool.toolName}`, tool);
  }

  listTools(): McpRegisteredTool[] {
    return [...this.tools.values()];
  }

  describeAvailableTools(): string {
    const tools = this.listTools();
    if (tools.length === 0) {
      return '当前没有启用任何 MCP tools。';
    }

    return [
      '已启用 MCP tools：',
      ...tools.map((tool) => `- ${tool.serverName}/${tool.toolName}${tool.description ? `: ${tool.description}` : ''}`),
    ].join('\n');
  }
}
