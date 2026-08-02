import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen } from 'electron';
import path from 'path';
import dotenv from 'dotenv';

import { Engine } from '../engine/index';
import type { EngineEvent } from '../engine/types';

// Load .env before creating Engine
dotenv.config({ path: path.join(process.cwd(), '.env'), override: false });
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), override: false });

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let engine: Engine | null = null;

const isDev = !app.isPackaged;
let isQuitting = false;

function createWindow() {
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;
  const winW = 200;
  const winH = 200;

  mainWindow = new BrowserWindow({
    width: winW,
    height: winH,
    x: screenW - winW - 8,
    y: screenH - winH - 48,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    const devUrl = (typeof process !== 'undefined' && (process.env as Record<string, string>).VITE_DEV_SERVER_URL)
      || 'http://localhost:5173';
    mainWindow.loadURL(devUrl);
    // mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });
}

function createTray() {
  // Use bundled icon or create a visible fallback
  let icon: Electron.NativeImage;
  const iconPath = path.join(__dirname, isDev ? '../resources/assets/icon.png' : '../resources/assets/icon.png');
  try {
    icon = nativeImage.createFromPath(iconPath);
  } catch {
    icon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAbwAAAG8B8aLcQwAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAEQSURBVDiNpZMxTsNAEEX/rNeOAwUlHVdA4gJcAokLUNDRcAQkLkCBuACXoOAIFIgLIJGQHdu7M0W8kR3HSZQn/fLuzO7M/NEKEXHOgYhgjAGAFQBEREQ89YAxBogI11rr5wSMMedMHAb4ewSAIYAbEcFZK/j3iIgY51zdA/AOYCAiEBHP/r4UERG8MUbXMz8mcfQPQETYi4ja5T+lgHMO1hiz5HIhvmOA5eLH54E454oIi2g9zgOcEPjNMXES4NQI1G0CKCWsa4CkBOsqwDoStkUStkVQHhnbMprLRHhVAAdAvY3bX+kW4o2dCveBkFlxTfe1pV2bM6O0Y+WUI4Czi3WUjhCOAG4PQYg7ImJ/xd7nd4GIOFG63wGQZho+f8nTbAAAAABJRU5ErkJggg=='
    );
  }
  tray = new Tray(icon.resize({ width: 16, height: 16 }));

  const contextMenu = Menu.buildFromTemplate([
    { label: '唤醒助手', click: () => mainWindow?.webContents.send('start-listening') },
    { type: 'separator' },
    { label: '设置', click: () => mainWindow?.webContents.send('open-settings') },
    { type: 'separator' },
    { label: '退出 SatsAi', click: () => { isQuitting = true; app.quit(); } },
  ]);

  tray.setToolTip('SatsAi - 桌面助手');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    mainWindow?.show();
    mainWindow?.webContents.send('start-listening');
  });
}

function initEngine() {
  const userDataPath = app.getPath('userData');

  const llmKey = process.env.SATSAI_LLM_API_KEY || '';
  const sttKey = process.env.SATSAI_STT_API_KEY || '';
  console.log('[Main] LLM key loaded:', llmKey ? `yes (${llmKey.slice(0, 6)}...)` : 'NO');
  console.log('[Main] STT key loaded:', sttKey ? `yes (${sttKey.slice(0, 6)}...)` : 'NO');

  engine = new Engine({
    dataDir: userDataPath,
    sttApiKey: sttKey,
    sttProvider: (process.env.SATSAI_STT_PROVIDER as 'qwen' | 'openai') || 'qwen',
    llmProvider: (process.env.SATSAI_LLM_PROVIDER as 'deepseek' | 'openai' | 'qwen' | 'claude') || 'deepseek',
    llmApiKey: llmKey,
  });

  engine.on('engine-event', (event: EngineEvent) => {
    mainWindow?.webContents.send('engine-event', event);
  });

  engine.on('tts-audio', (audioBuffer: Buffer) => {
    mainWindow?.webContents.send('tts-audio', audioBuffer);
  });

  engine.start().catch(console.error);
}

function setupIPC() {
  // Wake word detected by OpenWakeWord in renderer → trigger engine
  ipcMain.on('wake-word-detected', (_event, keyword: string, score: number) => {
    console.log(`[Main] Wake word: "${keyword}" (score: ${score.toFixed(2)})`);
    engine?.triggerListening();
  });

  // Audio from renderer (recorded via MediaRecorder after wake word)
  ipcMain.on('process-audio', async (_event, audioBuf: ArrayBuffer) => {
    await engine?.processAudio(audioBuf);
  });

  ipcMain.handle('get-status', () => {
    return { state: engine?.getState() || 'idle' };
  });

  ipcMain.handle('get-settings', () => {
    return engine?.getStore().getSettings();
  });

  ipcMain.handle('save-settings', (_event, settings) => {
    engine?.getStore().saveSettings(settings);
    return { success: true };
  });

  ipcMain.handle('get-enrollment-status', () => {
    return engine?.getStore().getEnrollmentStatus();
  });

  ipcMain.handle('start-enrollment', () => {
    const enroller = engine?.getSpeakerEnroller();
    if (!enroller) return { success: false, message: '引擎未初始化' };

    const phrases = [
      '生活不止眼前的苟且',
      '还有诗和远方的田野',
      '人工智能改变世界',
      '你好我是桌面助手',
      '请验证我的声音',
    ];

    enroller.setPhrases(phrases);
    return { success: true, phrases };
  });

  ipcMain.handle('submit-enrollment-audio', async (_event, phraseIndex: number, audioBase64: string) => {
    const enroller = engine?.getSpeakerEnroller();
    if (!enroller) return { success: false };

    const audioBuffer = Buffer.from(audioBase64, 'base64');
    await enroller.submitAudio(phraseIndex, audioBuffer);

    if (enroller.isComplete()) {
      const embedding = enroller.getEmbedding();
      if (embedding) {
        engine?.getStore().saveSpeakerEmbedding(embedding);
        engine?.getStore().setEnrollmentStatus({
          enrolled: true,
          enrolledAt: new Date().toISOString(),
          phraseCount: enroller.getPhrases().length,
        });
      }
    }

    return { success: true, progress: enroller.getProgress(), complete: enroller.isComplete() };
  });
}

// Disable disk cache to avoid write errors
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-http-cache');

app.whenReady().then(() => {
  setupIPC();
  createWindow();
  createTray();
  initEngine();

  // Grant microphone permission on this window
  mainWindow?.webContents.session.setPermissionRequestHandler(
    (_wc: Electron.WebContents, permission: string, callback: (granted: boolean) => void, details: { mediaTypes?: string[] }) => {
      if (permission === 'media' && details.mediaTypes?.includes('audio')) {
        callback(true);
      } else if (permission === 'media') {
        callback(true);  // Grant all media for simplicity
      } else {
        callback(false);
      }
    }
  );

  // Also pre-grant via default session
  const { session } = require('electron');
  session.defaultSession.setPermissionRequestHandler(
    (_wc: Electron.WebContents, permission: string, callback: (granted: boolean) => void) => {
      callback(permission === 'media');
    }
  );
});

app.on('window-all-closed', () => {
  // Don't quit on Windows
});

app.on('before-quit', () => {
  engine?.stop();
});
