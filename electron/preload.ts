import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronAPI {
  getStatus: () => Promise<{ state: string }>;
  getSettings: () => Promise<Record<string, unknown>>;
  saveSettings: (settings: Record<string, unknown>) => Promise<{ success: boolean }>;
  getEnrollmentStatus: () => Promise<{ enrolled: boolean; enrolledAt: string | null; phraseCount: number }>;
  startEnrollment: () => Promise<{ success: boolean; phrases?: string[]; message?: string }>;
  submitEnrollmentAudio: (phraseIndex: number, audioBase64: string) => Promise<{
    success: boolean; progress?: number; complete?: boolean;
  }>;
  /** Notify main process that wake word was detected (from OpenWakeWord) */
  wakeWordDetected: (keyword: string, score: number) => void;
  /** Send recorded audio (base64) from renderer to main process for STT pipeline */
  processAudio: (audioBuf: ArrayBuffer) => void;
  onEngineEvent: (callback: (event: unknown) => void) => void;
  onTTSAudio: (callback: (audioBuffer: ArrayBuffer) => void) => void;
  onStartListening: (callback: () => void) => void;
  removeAllListeners: (channel: string) => void;
}

contextBridge.exposeInMainWorld('electronAPI', {
  getStatus: () => ipcRenderer.invoke('get-status'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (s: Record<string, unknown>) => ipcRenderer.invoke('save-settings', s),
  getEnrollmentStatus: () => ipcRenderer.invoke('get-enrollment-status'),
  startEnrollment: () => ipcRenderer.invoke('start-enrollment'),
  submitEnrollmentAudio: (i: number, b64: string) =>
    ipcRenderer.invoke('submit-enrollment-audio', i, b64),
  wakeWordDetected: (keyword: string, score: number) => {
    ipcRenderer.send('wake-word-detected', keyword, score);
  },
  processAudio: (audioBuf: ArrayBuffer) => {
    ipcRenderer.send('process-audio', audioBuf);
  },
  onEngineEvent: (cb: (event: unknown) => void) => {
    ipcRenderer.on('engine-event', (_e, data) => cb(data));
  },
  onTTSAudio: (cb: (audioBuffer: ArrayBuffer) => void) => {
    ipcRenderer.on('tts-audio', (_e, buf) => cb(buf));
  },
  onStartListening: (cb: () => void) => {
    ipcRenderer.on('start-listening', () => cb());
  },
  removeAllListeners: (ch: string) => {
    ipcRenderer.removeAllListeners(ch);
  },
} as ElectronAPI);
