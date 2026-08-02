import { exec } from 'child_process';
import { promisify } from 'util';
import type { ActionDefinition } from './index';

const execAsync = promisify(exec);

export const appActions: ActionDefinition[] = [
  {
    name: 'open_app',
    description: 'Open/launch an application by name. E.g., "VS Code", "Notepad", "Chrome"',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The application name to open' },
      },
      required: ['name'],
    },
    execute: async (args) => {
      const appName = args.name as string;
      try {
        await execAsync(`start "" "${appName}"`, { shell: 'cmd.exe' });
        return { success: true, message: `已打开 ${appName}` };
      } catch {
        try {
          await execAsync(`start ${appName}`, { shell: 'cmd.exe' });
          return { success: true, message: `已打开 ${appName}` };
        } catch (err) {
          return { success: false, message: `无法打开 ${appName}: ${(err as Error).message}` };
        }
      }
    },
  },
  {
    name: 'close_app',
    description: 'Close an application window by its title or process name',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Window title or process name to close' },
      },
      required: ['name'],
    },
    execute: async (args) => {
      const name = args.name as string;
      try {
        await execAsync(`taskkill /FI "WINDOWTITLE eq ${name}" /F 2>nul || taskkill /IM "${name}.exe" /F 2>nul`, { shell: 'cmd.exe' });
        return { success: true, message: `已关闭 ${name}` };
      } catch {
        return { success: true, message: `${name} 可能已经关闭` };
      }
    },
  },
];
