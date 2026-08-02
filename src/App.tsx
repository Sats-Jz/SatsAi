import { useEffect } from 'react';
import { useAppStore } from './stores/appStore';
import FloatingBall from './components/FloatingBall';
import DialogBubble from './components/DialogBubble';
import SettingsPanel from './components/SettingsPanel';
import VoiceEnrollment from './components/VoiceEnrollment';
import type { EngineEvent } from '../engine/types';

export default function App() {
  const {
    voiceState, setVoiceState,
    transcript, setTranscript,
    response, setResponse,
    settingsOpen, setSettingsOpen,
    enrollmentOpen, setEnrollmentOpen,
    setTtsAudio, setError,
  } = useAppStore();

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.onEngineEvent((event: unknown) => {
        const e = event as EngineEvent;
        switch (e.type) {
          case 'state-changed':
            setVoiceState(e.state);
            if (e.state === 'idle') {
              setTranscript('');
              setResponse('');
            }
            break;
          case 'transcript':
            setTranscript(e.text);
            break;
          case 'response':
            setResponse(e.text);
            break;
          case 'error':
            setError(e.message);
            break;
        }
      });

      window.electronAPI.onTTSAudio((buffer: ArrayBuffer) => {
        setTtsAudio(buffer);
      });
    }

    return () => {
      if (window.electronAPI) {
        window.electronAPI.removeAllListeners('engine-event');
        window.electronAPI.removeAllListeners('tts-audio');
      }
    };
  }, []);

  return (
    <div className="app-root">
      <FloatingBall />
      <DialogBubble />
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      {enrollmentOpen && <VoiceEnrollment onClose={() => setEnrollmentOpen(false)} />}
    </div>
  );
}
