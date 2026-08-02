import { describe, it, expect, beforeEach } from 'vitest';
import { ActionRegistry, createActionRegistry } from './index';
import type { ActionResult } from '../types';

describe('ActionRegistry', () => {
  let registry: ActionRegistry;

  beforeEach(() => {
    registry = createActionRegistry();
  });

  it('should register and execute an action', async () => {
    registry.register({
      name: 'test_action',
      description: 'A test action',
      parameters: {
        type: 'object',
        properties: { message: { type: 'string' } },
        required: ['message'],
      },
      execute: async (args) => ({
        success: true,
        message: `Echo: ${args.message}`,
      }),
    });

    const result = await registry.execute('test_action', { message: 'hello' });
    expect(result.success).toBe(true);
    expect(result.message).toBe('Echo: hello');
  });

  it('should return all tool definitions as LLM tools format', () => {
    registry.register({
      name: 'open_app',
      description: 'Open an application',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string', description: 'App name' } },
        required: ['name'],
      },
      execute: async () => ({ success: true, message: 'ok' }),
    });

    const tools = registry.getToolDefinitions();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('open_app');
    expect(tools[0].description).toBe('Open an application');
  });

  it('should return error for unknown action', async () => {
    const result = await registry.execute('nonexistent', {});
    expect(result.success).toBe(false);
    expect(result.message).toContain('not found');
  });

  it('should list all registered actions', () => {
    registry.register({
      name: 'a1', description: 'First', parameters: { type: 'object', properties: {} },
      execute: async () => ({ success: true, message: 'ok' }),
    });
    registry.register({
      name: 'a2', description: 'Second', parameters: { type: 'object', properties: {} },
      execute: async () => ({ success: true, message: 'ok' }),
    });

    const names = registry.listActions();
    expect(names).toContain('a1');
    expect(names).toContain('a2');
  });
});
