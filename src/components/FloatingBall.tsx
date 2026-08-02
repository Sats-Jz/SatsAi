import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import { useDrag } from '../hooks/useDrag';
import { webmBlobToWavBase64 } from '../utils/audio';
import WaveAnimation from './WaveAnimation';
import './FloatingBall.css';

const RECORD_MS = 8000;

export default function FloatingBall() {
  const voiceState = useAppStore((s) => s.voiceState);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const setEnrollmentOpen = useAppStore((s) => s.setEnrollmentOpen);
  const [showMenu, setShowMenu] = useState(false);
  const [recording, setRecording] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const voiceRef = useRef(voiceState);
  voiceRef.current = voiceState;

  const mrRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const { isDragging, position, onMouseDown } = useDrag(
    window.screen.width - 140,
    window.screen.height - 200
  );

  const cleanup = useCallback(() => {
    clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    mrRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  /** Start mic + notify engine */
  const wake = useCallback(async () => {
    if (recording) return;

    // Notify engine
    window.electronAPI?.wakeWordDetected('manual', 1.0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1 },
      });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const mr = new MediaRecorder(stream, { mimeType });
      mrRef.current = mr;
      chunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = async () => {
        setRecording(false);
        setCountdown(0);
        cleanup();
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        if (blob.size < 400) return; // too short
        try {
          const wav = await webmBlobToWavBase64(blob);
          window.electronAPI?.processAudio(wav);
        } catch (err) {
          console.error('[FloatingBall] Convert error:', err);
        }
      };

      mr.start(100);
      setRecording(true);
      setCountdown(Math.ceil(RECORD_MS / 1000));

      timerRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            if (mrRef.current?.state === 'recording') mrRef.current.stop();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      console.error('[FloatingBall] Mic failed:', err);
      cleanup();
    }
  }, [recording, cleanup]);

  // Tray "wake" → start recording
  useEffect(() => {
    window.electronAPI?.onStartListening(() => wake());
    return () => window.electronAPI?.removeAllListeners('start-listening');
  }, [wake]);

  // --- visual state ---
  const isListening = recording || voiceState === 'listening';
  const isThinking = voiceState === 'thinking' && !recording;
  const isSpeaking = voiceState === 'speaking';

  const face = recording ? '\u{1F3A4}' :
    isListening ? '\u{1F3A4}' :
    isThinking ? '\u{1F914}' :
    isSpeaking ? '\u{1F4AC}' :
    '\u{1F60A}';

  const statusClass = recording ? 'ball-listening' :
    isListening ? 'ball-listening' :
    isThinking ? 'ball-thinking' :
    isSpeaking ? 'ball-speaking' :
    'ball-idle';

  return (
    <div
      className={`floating-ball ${statusClass} ${isDragging ? 'dragging' : ''}`}
      style={{ left: position.x, top: position.y }}
      onMouseDown={onMouseDown}
      onDoubleClick={wake}
      onContextMenu={(e) => { e.preventDefault(); setShowMenu(!showMenu); }}
    >
      <div className="ball-body">
        <div className="ball-face">{face}</div>
        {recording && <div className="countdown-badge">{countdown}s</div>}
        {isListening && <WaveAnimation />}
        {isThinking && <div className="thinking-ring" />}
      </div>

      {showMenu && (
        <div className="ball-context-menu">
          <div className="menu-item" onClick={() => { setSettingsOpen(true); setShowMenu(false); }}>Settings</div>
          <div className="menu-item" onClick={() => { setEnrollmentOpen(true); setShowMenu(false); }}>Voice ID</div>
          <div className="menu-separator" />
          <div className="menu-item" onClick={() => setShowMenu(false)}>Exit</div>
        </div>
      )}
    </div>
  );
}
