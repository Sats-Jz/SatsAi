export interface MCPServerConfig {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  enabled: boolean;
}

export const builtinServers: MCPServerConfig[] = [
  {
    name: 'filesystem',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '%USERPROFILE%'],
    enabled: false,
  },
  {
    name: 'sqlite',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sqlite'],
    enabled: false,
  },
  {
    name: 'github',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: '' },
    enabled: false,
  },
];

export interface CustomMCPServer {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export function loadCustomServers(): CustomMCPServer[] {
  return [];
}
