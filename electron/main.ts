import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen, session } from 'electron';
import path from 'path';
import dotenv from 'dotenv';
import { Engine } from '../engine/index';
import type { EngineEvent } from '../engine/types';

// Load .env
dotenv.config({ path: path.join(process.cwd(), '.env'), override: false });
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), override: false });

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let engine: Engine | null = null;

const isDev = !app.isPackaged;
let isQuitting = false;

app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

function createWindow() {
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;
  mainWindow = new BrowserWindow({
    width: 200, height: 200,
    x: screenW - 208, y: screenH - 248,
    frame: false, transparent: true,
    alwaysOnTop: true, skipTaskbar: true, resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  });

  if (isDev) {
    const devUrl = (process.env as Record<string, string>).VITE_DEV_SERVER_URL || 'http://localhost:5173';
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('close', (e) => {
    if (!isQuitting) { e.preventDefault(); mainWindow?.hide(); }
  });
}

function createTray() {
  let icon: Electron.NativeImage;
  try {
    icon = nativeImage.createFromPath(path.join(__dirname, '../resources/assets/icon.png'));
  } catch {
    icon = nativeImage.createEmpty();
  }
  tray = new Tray(icon.resize({ width: 16, height: 16 }));

  const menu = Menu.buildFromTemplate([
    { label: '唤醒助手', click: () => mainWindow?.webContents.send('start-listening') },
    { type: 'separator' },
    { label: '设置', click: () => mainWindow?.webContents.send('open-settings') },
    { type: 'separator' },
    { label: '退出 SatsAi', click: () => { isQuitting = true; app.quit(); } },
  ]);
  tray.setToolTip('SatsAi');
  tray.setContextMenu(menu);
  tray.on('double-click', () => { mainWindow?.show(); mainWindow?.webContents.send('start-listening'); });
}

function initEngine() {
  const userDataPath = app.getPath('userData');
  const llmKey = process.env.SATSAI_LLM_API_KEY || '';
  const sttKey = process.env.SATSAI_STT_API_KEY || '';
  console.log('[Main] LLM key:', llmKey ? `yes (${llmKey.slice(0, 6)}...)` : 'NO');
  console.log('[Main] STT key:', sttKey ? `yes (${sttKey.slice(0, 6)}...)` : 'NO');

  engine = new Engine({
    dataDir: userDataPath,
    sttApiKey: sttKey,
    sttProvider: (process.env.SATSAI_STT_PROVIDER as 'qwen' | 'openai') || 'qwen',
    llmProvider: (process.env.SATSAI_LLM_PROVIDER as 'deepseek' | 'openai' | 'qwen' | 'claude') || 'deepseek',
    llmApiKey: llmKey,
  });

  engine.on('engine-event', (event: EngineEvent) => mainWindow?.webContents.send('engine-event', event));
  engine.on('tts-audio', (buf: Buffer) => mainWindow?.webContents.send('tts-audio', buf));
  engine.start().catch(console.error);
}

function setupIPC() {
  ipcMain.on('wake-word-detected', (_e, keyword: string, score: number) => {
    console.log(`[Main] Wake: "${keyword}" score=${score.toFixed(2)}`);
    engine?.triggerListening();
  });
  ipcMain.on('process-audio', async (_e, buf: ArrayBuffer) => engine?.processAudio(buf));

  ipcMain.handle('get-status', () => ({ state: engine?.getState() || 'idle' }));
  ipcMain.handle('get-settings', () => engine?.getStore().getSettings());
  ipcMain.handle('save-settings', (_e, s) => { engine?.getStore().saveSettings(s); return { success: true }; });
  ipcMain.handle('get-enrollment-status', () => engine?.getStore().getEnrollmentStatus());

  ipcMain.handle('start-enrollment', () => {
    const enroller = engine?.getSpeakerEnroller();
    if (!enroller) return { success: false, message: '引擎未初始化' };
    enroller.setPhrases(['生活不止眼前的苟且', '还有诗和远方的田野', '人工智能改变世界', '你好我是桌面助手', '请验证我的声音']);
    return { success: true, phrases: enroller.getPhrases() };
  });

  ipcMain.handle('submit-enrollment-audio', async (_e, idx: number, b64: string) => {
    const enroller = engine?.getSpeakerEnroller();
    if (!enroller) return { success: false };
    await enroller.submitAudio(idx, Buffer.from(b64, 'base64'));
    if (enroller.isComplete()) {
      const emb = enroller.getEmbedding();
      if (emb) { engine?.getStore().saveSpeakerEmbedding(emb); engine?.getStore().setEnrollmentStatus({ enrolled: true, enrolledAt: new Date().toISOString(), phraseCount: enroller.getPhrases().length }); }
    }
    return { success: true, progress: enroller.getProgress(), complete: enroller.isComplete() };
  });
}

app.whenReady().then(() => {
  // MUST be first — before any window loads
  session.defaultSession.setPermissionRequestHandler(
    (_wc: Electron.WebContents, permission: string, cb: (granted: boolean) => void) => cb(permission === 'media')
  );

  setupIPC();
  createWindow();
  createTray();
  initEngine();
});

app.on('before-quit', () => engine?.stop());
