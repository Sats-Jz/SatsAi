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
  onEngineEvent: (callback: (event: unknown) => void) => void;
  onTTSAudio: (callback: (audioBuffer: ArrayBuffer) => void) => void;
  removeAllListeners: (channel: string) => void;
}

contextBridge.exposeInMainWorld('electronAPI', {
  getStatus: () => ipcRenderer.invoke('get-status'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings: Record<string, unknown>) => ipcRenderer.invoke('save-settings', settings),
  getEnrollmentStatus: () => ipcRenderer.invoke('get-enrollment-status'),
  startEnrollment: () => ipcRenderer.invoke('start-enrollment'),
  submitEnrollmentAudio: (phraseIndex: number, audioBase64: string) =>
    ipcRenderer.invoke('submit-enrollment-audio', phraseIndex, audioBase64),
  onEngineEvent: (callback: (event: unknown) => void) => {
    ipcRenderer.on('engine-event', (_event, data) => callback(data));
  },
  onTTSAudio: (callback: (audioBuffer: ArrayBuffer) => void) => {
    ipcRenderer.on('tts-audio', (_event, buffer) => callback(buffer));
  },
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },
} as ElectronAPI);
