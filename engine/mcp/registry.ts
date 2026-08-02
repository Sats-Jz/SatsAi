import type { LLMToolDefinition } from '../actions/index';

export class MCPToolRegistry {
  private tools: Map<string, LLMToolDefinition> = new Map();

  registerServer(serverName: string, tools: LLMToolDefinition[]): void {
    for (const tool of tools) this.tools.set(`${serverName}__${tool.name}`, tool);
  }

  unregisterServer(serverName: string): void {
    for (const key of this.tools.keys()) {
      if (key.startsWith(`${serverName}__`)) this.tools.delete(key);
    }
  }

  getToolDefinitions(): LLMToolDefinition[] {
    return Array.from(this.tools.values());
  }

  listTools(): string[] {
    return Array.from(this.tools.keys());
  }
}
