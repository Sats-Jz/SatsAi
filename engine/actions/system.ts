import { exec } from 'child_process';
import { promisify } from 'util';
import type { ActionDefinition } from './index';

const execAsync = promisify(exec);

export const systemActions: ActionDefinition[] = [
  {
    name: 'set_volume',
    description: 'Set system volume level (0-100) or mute/unmute',
    parameters: {
      type: 'object',
      properties: {
        level: { type: 'number', description: 'Volume level 0-100, or -1 to mute' },
      },
      required: ['level'],
    },
    execute: async (args) => {
      const level = args.level as number;
      try {
        if (level === -1) {
          await execAsync('powershell -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]173)"');
          return { success: true, message: '已静音' };
        }
        const psScript = `
          $wshShell = New-Object -ComObject WScript.Shell
          for ($i = 0; $i -lt 50; $i++) { $wshShell.SendKeys([char]174) }
          for ($i = 0; $i -lt ${Math.round(level / 2)}; $i++) { $wshShell.SendKeys([char]175) }
        `;
        await execAsync(`powershell -Command "${psScript}"`);
        return { success: true, message: `音量已设置为 ${level}%` };
      } catch (err) {
        return { success: false, message: `音量调节失败: ${(err as Error).message}` };
      }
    },
  },
  {
    name: 'screenshot',
    description: 'Take a screenshot and save to the Pictures folder',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async () => {
      try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const savePath = `%USERPROFILE%\\Pictures\\satsai-screenshot-${timestamp}.png`;
        const psScript = `
          Add-Type -AssemblyName System.Windows.Forms
          Add-Type -AssemblyName System.Drawing
          $screen = [System.Windows.Forms.Screen]::PrimaryScreen
          $bitmap = New-Object System.Drawing.Bitmap $screen.Bounds.Width, $screen.Bounds.Height
          $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
          $graphics.CopyFromScreen($screen.Bounds.X, $screen.Bounds.Y, 0, 0, $bitmap.Size)
          $bitmap.Save([Environment]::ExpandEnvironmentVariables('${savePath}'))
          $graphics.Dispose()
          $bitmap.Dispose()
        `;
        await execAsync(`powershell -Command "${psScript}"`);
        return { success: true, message: `截图已保存到 ${savePath}` };
      } catch (err) {
        return { success: false, message: `截图失败: ${(err as Error).message}` };
      }
    },
  },
  {
    name: 'system_info',
    description: 'Get current system information like CPU, memory, battery',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to query: "cpu", "memory", "battery", "all"' },
      },
      required: ['query'],
    },
    execute: async (args) => {
      const query = args.query as string;
      try {
        let cmd = '';
        if (query === 'battery') {
          cmd = 'powershell -Command "Get-WmiObject Win32_Battery | Select-Object EstimatedChargeRemaining, BatteryStatus | Format-List"';
        } else if (query === 'memory') {
          cmd = 'powershell -Command "Get-WmiObject Win32_OperatingSystem | Select-Object @{N=\'TotalGB\';E={[math]::Round($_.TotalVisibleMemorySize/1MB,1)}},@{N=\'FreeGB\';E={[math]::Round($_.FreePhysicalMemory/1MB,1)}} | Format-List"';
        } else {
          cmd = 'powershell -Command "Get-WmiObject Win32_Processor | Select-Object Name, LoadPercentage | Format-List; Get-WmiObject Win32_OperatingSystem | Select-Object @{N=\'TotalRAM_GB\';E={[math]::Round($_.TotalVisibleMemorySize/1MB,1)}} | Format-List"';
        }
        const { stdout } = await execAsync(cmd);
        return { success: true, message: stdout.trim() };
      } catch (err) {
        return { success: false, message: `查询失败: ${(err as Error).message}` };
      }
    },
  },
];
