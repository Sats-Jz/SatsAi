import { exec } from 'child_process';
import { promisify } from 'util';
import type { ActionDefinition } from './index';

const execAsync = promisify(exec);

export const webActions: ActionDefinition[] = [
  {
    name: 'open_url',
    description: 'Open a URL in the default web browser',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to open or a search query' },
      },
      required: ['url'],
    },
    execute: async (args) => {
      let url = args.url as string;
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        if (!url.includes('.')) {
          url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
        } else {
          url = `https://${url}`;
        }
      }
      try {
        await execAsync(`start "${url}"`, { shell: 'cmd.exe' });
        return { success: true, message: `已打开 ${url}` };
      } catch (err) {
        return { success: false, message: `打开网页失败: ${(err as Error).message}` };
      }
    },
  },
  {
    name: 'search_web',
    description: 'Search the web for information',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
      },
      required: ['query'],
    },
    execute: async (args) => {
      const query = encodeURIComponent(args.query as string);
      const url = `https://www.google.com/search?q=${query}`;
      try {
        await execAsync(`start "${url}"`, { shell: 'cmd.exe' });
        return { success: true, message: `已搜索: ${args.query}` };
      } catch (err) {
        return { success: false, message: `搜索失败: ${(err as Error).message}` };
      }
    },
  },
];
