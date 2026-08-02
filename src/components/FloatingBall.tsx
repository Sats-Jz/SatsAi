import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../stores/appStore';
import { useDrag } from '../hooks/useDrag';
import { webmBlobToWavBase64 } from '../utils/audio';
import WaveAnimation from './WaveAnimation';
import './FloatingBall.css';

const RECORD_DURATION_MS = 8000; // Max 8 seconds per command

export default function FloatingBall() {
  const voiceState = useAppStore((s) => s.voiceState);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const setEnrollmentOpen = useAppStore((s) => s.setEnrollmentOpen);
  const [showMenu, setShowMenu] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const { isDragging, position, onMouseDown } = useDrag(
    window.screen.width - 140,
    window.screen.height - 200
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording();
      clearInterval(timerRef.current);
    };
  }, []);

  const stopRecording = () => {
    clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCountdown(0);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1 },
      });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      setCountdown(Math.ceil(RECORD_DURATION_MS / 1000));

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stopRecording();
        if (blob.size > 0) {
          try {
            const wavBase64 = await webmBlobToWavBase64(blob);
            window.electronAPI?.processAudio(wavBase64);
          } catch (err) {
            console.error('[FloatingBall] Audio conversion failed:', err);
          }
        }
      };

      recorder.start(100);
      console.log('[FloatingBall] Recording...');

      // Auto-stop after RECORD_DURATION_MS
      timerRef.current = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) {
            if (mediaRecorderRef.current?.state === 'recording') {
              mediaRecorderRef.current.stop();
              console.log('[FloatingBall] Auto-stopped recording');
            }
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    } catch (err) {
      console.error('[FloatingBall] Mic access denied:', err);
      stopRecording();
    }
  };

  const handleWake = () => {
    if (voiceState !== 'idle') return;

    // Tell engine we're listening
    window.electronAPI?.wakeWordDetected('manual', 1.0);
    // Start recording mic
    startRecording();
  };

  // Tray "wake" → start recording
  useEffect(() => {
    window.electronAPI?.onStartListening(() => {
      handleWake();
    });
    return () => {
      window.electronAPI?.removeAllListeners('start-listening');
    };
  }, [voiceState]);

  const handleDoubleClick = () => {
    handleWake();
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowMenu(!showMenu);
  };

  const getFaceExpression = (): string => {
    if (countdown > 0) return '\u{1F3A4}';
    switch (voiceState) {
      case 'idle': return '\u{1F60A}';
      case 'listening': return '\u{1F3A4}';
      case 'thinking': return '\u{1F914}';
      case 'speaking': return '\u{1F4AC}';
      default: return '\u{1F60A}';
    }
  };

  const getStatusClass = (): string => {
    if (countdown > 0) return 'ball-listening';
    return `ball-${voiceState}`;
  };

  return (
    <div
      className={`floating-ball ${getStatusClass()} ${isDragging ? 'dragging' : ''}`}
      style={{ left: position.x, top: position.y }}
      onMouseDown={onMouseDown}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
    >
      <div className="ball-body">
        <div className="ball-face">
          <span className="face-expression">{getFaceExpression()}</span>
        </div>
        {countdown > 0 && (
          <div className="countdown-badge">{countdown}s</div>
        )}
        {(voiceState === 'listening' || countdown > 0) && <WaveAnimation />}
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
