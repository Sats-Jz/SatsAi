import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen } from 'electron';
import path from 'path';
import { Engine } from '../engine/index';
import type { EngineEvent } from '../engine/types';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let engine: Engine | null = null;

const isDev = !app.isPackaged;
let isQuitting = false;

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: 120,
    height: 120,
    x: width - 140,
    y: height - 160,
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
    mainWindow.loadURL('http://localhost:5173');
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
  // Create a simple 16x16 tray icon programmatically
  const icon = nativeImage.createEmpty();
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

  engine = new Engine({
    dataDir: userDataPath,
    sttApiKey: process.env.SATSAI_STT_API_KEY || '',
    sttProvider: (process.env.SATSAI_STT_PROVIDER as 'qwen' | 'openai') || 'qwen',
    llmProvider: (process.env.SATSAI_LLM_PROVIDER as 'deepseek' | 'openai' | 'qwen' | 'claude') || 'deepseek',
    llmApiKey: process.env.SATSAI_LLM_API_KEY || '',
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
  ipcMain.on('process-audio', async (_event, audioBase64: string) => {
    await engine?.processAudio(audioBase64);
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

  ipcMain.handle('submit-enrollment-audio', (_event, phraseIndex: number, audioBase64: string) => {
    const enroller = engine?.getSpeakerEnroller();
    if (!enroller) return { success: false };

    const audioBuffer = Buffer.from(audioBase64, 'base64');
    enroller.submitAudio(phraseIndex, audioBuffer);

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

app.whenReady().then(() => {
  setupIPC();
  createWindow();
  createTray();
  initEngine();
});

app.on('window-all-closed', () => {
  // Don't quit on Windows
});

app.on('before-quit', () => {
  engine?.stop();
});
