import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../stores/appStore';
import { useDrag } from '../hooks/useDrag';
import { useWakeWord } from '../hooks/useWakeWord';
import { webmBlobToWavBase64 } from '../utils/audio';
import WaveAnimation from './WaveAnimation';
import './FloatingBall.css';

export default function FloatingBall() {
  const voiceState = useAppStore((s) => s.voiceState);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const setEnrollmentOpen = useAppStore((s) => s.setEnrollmentOpen);
  const [showMenu, setShowMenu] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const { isDragging, position, onMouseDown } = useDrag(
    window.screen.width - 140,
    window.screen.height - 200
  );

  /** Send recorded audio to main process for STT → LLM → TTS */
  const sendAudioToEngine = async (audioBlob: Blob) => {
    try {
      // Convert WebM/Opus → WAV PCM (16kHz mono) via Web Audio API
      const wavBase64 = await webmBlobToWavBase64(audioBlob);
      window.electronAPI?.processAudio(wavBase64);
    } catch (err) {
      console.error('[FloatingBall] Audio send error:', err);
    }
  };

  // Init OpenWakeWord — free, open-source, no API key needed
  useWakeWord({
    keywords: ['hey_jarvis'],
    onDetect: (keyword, score) => {
      console.log(`[WakeWord] Detected: "${keyword}" score=${score.toFixed(2)}`);
      if (window.electronAPI) {
        window.electronAPI.wakeWordDetected(keyword, score);
      }
    },
    onSpeechStart: () => {
      // Start recording user's voice command via MediaRecorder
      navigator.mediaDevices
        .getUserMedia({ audio: { sampleRate: 16000, channelCount: 1 } })
        .then((stream) => {
          const recorder = new MediaRecorder(stream, {
            mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
              ? 'audio/webm;codecs=opus'
              : 'audio/webm',
          });
          mediaRecorderRef.current = recorder;
          audioChunksRef.current = [];

          recorder.ondataavailable = (e) => {
            if (e.data.size > 0) audioChunksRef.current.push(e.data);
          };

          recorder.onstop = () => {
            const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            sendAudioToEngine(blob);
            // Release mic
            stream.getTracks().forEach((t) => t.stop());
          };

          recorder.start(100); // 100ms chunks
          console.log('[FloatingBall] Recording started');
        })
        .catch((err) => {
          console.error('[FloatingBall] Mic access failed:', err);
        });
    },
    onSpeechEnd: () => {
      // Stop recording when user stops speaking
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
        console.log('[FloatingBall] Recording stopped');
      }
    },
    cooldownMs: 2000,
    enabled: voiceState === 'idle',
  });

  // Handle tray double-click / manual trigger
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.onStartListening(() => {
        window.electronAPI.wakeWordDetected('manual', 1.0);
      });
    }
    return () => {
      window.electronAPI?.removeAllListeners('start-listening');
    };
  }, []);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowMenu(!showMenu);
  };

  const handleDoubleClick = () => {
    window.electronAPI?.wakeWordDetected('manual', 1.0);
  };

  const getFaceExpression = (): string => {
    switch (voiceState) {
      case 'idle': return '\u{1F60A}';
      case 'listening': return '\u{1F3A4}';
      case 'thinking': return '\u{1F914}';
      case 'speaking': return '\u{1F4AC}';
      default: return '\u{1F60A}';
    }
  };

  return (
    <div
      className={`floating-ball ball-${voiceState} ${isDragging ? 'dragging' : ''}`}
      style={{ left: position.x, top: position.y }}
      onMouseDown={onMouseDown}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
    >
      <div className="ball-body">
        <div className="ball-face">
          <span className="face-expression">{getFaceExpression()}</span>
        </div>
        {voiceState === 'listening' && <WaveAnimation />}
        {voiceState === 'thinking' && <div className="thinking-ring" />}
      </div>

      {showMenu && (
        <div className="ball-context-menu">
          <div className="menu-item" onClick={() => { setSettingsOpen(true); setShowMenu(false); }}>
            Settings
          </div>
          <div className="menu-item" onClick={() => { setEnrollmentOpen(true); setShowMenu(false); }}>
            Voice ID
          </div>
          <div className="menu-separator" />
          <div className="menu-item" onClick={() => setShowMenu(false)}>
            Exit
          </div>
        </div>
      )}
    </div>
  );
}
