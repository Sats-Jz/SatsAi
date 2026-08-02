import { create } from 'zustand';
import type { VoiceState, AppSettings } from '../types';

interface AppState {
  voiceState: VoiceState;
  setVoiceState: (state: VoiceState) => void;
  transcript: string;
  response: string;
  setTranscript: (text: string) => void;
  setResponse: (text: string) => void;
  settings: AppSettings | null;
  setSettings: (settings: AppSettings) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  ttsAudioUrl: string | null;
  setTtsAudio: (buffer: ArrayBuffer) => void;
  enrollmentOpen: boolean;
  setEnrollmentOpen: (open: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  voiceState: 'idle',
  setVoiceState: (state) => set({ voiceState: state }),
  transcript: '',
  response: '',
  setTranscript: (text) => set({ transcript: text }),
  setResponse: (text) => set({ response: text }),
  settings: null,
  setSettings: (settings) => set({ settings }),
  settingsOpen: false,
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  ttsAudioUrl: null,
  setTtsAudio: (buffer) => {
    const blob = new Blob([buffer], { type: 'audio/mp3' });
    const url = URL.createObjectURL(blob);
    set({ ttsAudioUrl: url });
  },
  enrollmentOpen: false,
  setEnrollmentOpen: (open) => set({ enrollmentOpen: open }),
  error: null,
  setError: (error) => set({ error }),
}));
