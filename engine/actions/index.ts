import type { ActionResult } from '../types';

export interface ActionDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description?: string; enum?: string[] }>;
    required?: string[];
  };
  execute: (args: Record<string, unknown>) => Promise<ActionResult>;
}

export interface LLMToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export class ActionRegistry {
  private actions: Map<string, ActionDefinition> = new Map();

  register(action: ActionDefinition): void {
    this.actions.set(action.name, action);
  }

  async execute(name: string, args: Record<string, unknown>): Promise<ActionResult> {
    const action = this.actions.get(name);
    if (!action) {
      return { success: false, message: `Action "${name}" not found` };
    }
    try {
      return await action.execute(args);
    } catch (err) {
      return { success: false, message: `Action "${name}" failed: ${(err as Error).message}` };
    }
  }

  getToolDefinitions(): LLMToolDefinition[] {
    return Array.from(this.actions.values()).map((action) => ({
      name: action.name,
      description: action.description,
      input_schema: action.parameters,
    }));
  }

  listActions(): string[] {
    return Array.from(this.actions.keys());
  }
}

export function createActionRegistry(): ActionRegistry {
  return new ActionRegistry();
}
