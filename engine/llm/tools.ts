import type { ActionRegistry, LLMToolDefinition } from '../actions/index';

export function buildLLMTools(
  actionRegistry: ActionRegistry,
  mcpRegistry?: { getToolDefinitions(): LLMToolDefinition[] }
): LLMToolDefinition[] {
  const tools: LLMToolDefinition[] = [];
  tools.push(...actionRegistry.getToolDefinitions());
  if (mcpRegistry) tools.push(...mcpRegistry.getToolDefinitions());
  return tools;
}
