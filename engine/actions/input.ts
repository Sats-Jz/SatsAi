import { exec } from 'child_process';
import { promisify } from 'util';
import type { ActionDefinition } from './index';

const execAsync = promisify(exec);

function escapeForPS(text: string): string {
  return text.replace(/'/g, "''").replace(/"/g, '`"');
}

export const inputActions: ActionDefinition[] = [
  {
    name: 'type_text',
    description: 'Type text using keyboard simulation at the current cursor position',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The text to type' },
      },
      required: ['text'],
    },
    execute: async (args) => {
      const text = escapeForPS(args.text as string);
      try {
        const psScript = `
          Add-Type -AssemblyName System.Windows.Forms
          [System.Windows.Forms.SendKeys]::SendWait('${text}')
        `;
        await execAsync(`powershell -Command "${psScript.replace(/"/g, '\\"')}"`);
        return { success: true, message: `已输入文字` };
      } catch (err) {
        return { success: false, message: `输入失败: ${(err as Error).message}` };
      }
    },
  },
  {
    name: 'press_keys',
    description: 'Press a key combination like Ctrl+C, Alt+Tab, Win+D',
    parameters: {
      type: 'object',
      properties: {
        keys: { type: 'string', description: 'Key combination, e.g., "^c" for Ctrl+C, "%{TAB}" for Alt+Tab' },
      },
      required: ['keys'],
    },
    execute: async (args) => {
      const keys = escapeForPS(args.keys as string);
      try {
        const psScript = `
          Add-Type -AssemblyName System.Windows.Forms
          [System.Windows.Forms.SendKeys]::SendWait('${keys}')
        `;
        await execAsync(`powershell -Command "${psScript.replace(/"/g, '\\"')}"`);
        return { success: true, message: `已执行快捷键` };
      } catch (err) {
        return { success: false, message: `快捷键执行失败: ${(err as Error).message}` };
      }
    },
  },
];
