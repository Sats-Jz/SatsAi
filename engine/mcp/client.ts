import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { MCPToolRegistry } from './registry';
import { builtinServers, type MCPServerConfig } from './servers';
import type { LLMToolDefinition } from '../actions/index';

export class MCPClientManager {
  private registry: MCPToolRegistry;
  private clients: Map<string, Client> = new Map();

  constructor(registry: MCPToolRegistry) {
    this.registry = registry;
  }

  async connectServer(config: MCPServerConfig): Promise<void> {
    try {
      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: config.env as Record<string, string> | undefined,
      });

      const client = new Client(
        { name: 'sats-ai', version: '0.1.0' },
        { capabilities: {} }
      );

      await client.connect(transport);

      const toolsResult = await client.listTools();
      const tools: LLMToolDefinition[] = toolsResult.tools.map((t) => ({
        name: t.name,
        description: t.description || '',
        input_schema: t.inputSchema as LLMToolDefinition['input_schema'],
      }));

      this.registry.registerServer(config.name, tools);
      this.clients.set(config.name, client);
    } catch (err) {
      console.error(`[MCP] Failed to connect to ${config.name}:`, err);
    }
  }

  async initializeBuiltin(): Promise<void> {
    for (const server of builtinServers) {
      if (server.enabled) await this.connectServer(server);
    }
  }

  disconnectServer(name: string): void {
    this.registry.unregisterServer(name);
    this.clients.delete(name);
  }

  async shutdown(): Promise<void> {
    for (const [name, client] of this.clients) await client.close();
    this.clients.clear();
  }

  getRegistry(): MCPToolRegistry { return this.registry; }
}
