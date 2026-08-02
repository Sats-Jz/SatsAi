import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import { webmBlobToWavBase64 } from '../utils/audio';
import WaveAnimation from './WaveAnimation';
import './FloatingBall.css';

const RECORD_MS = 8000;

export default function FloatingBall() {
  const voiceState = useAppStore((s) => s.voiceState);
  const response = useAppStore((s) => s.response);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const setEnrollmentOpen = useAppStore((s) => s.setEnrollmentOpen);
  const [showMenu, setShowMenu] = useState(false);
  const [recording, setRecording] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const mrRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const cleanup = useCallback(() => {
    clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    mrRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const wake = useCallback(async () => {
    if (mrRef.current?.state === 'recording') return;

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
        if (blob.size < 400) return;
        try {
          const wav = await webmBlobToWavBase64(blob);
          window.electronAPI?.processAudio(wav);
        } catch (err) {
          console.error('[Ball] Convert error:', err);
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
      console.error('[Ball] Mic failed:', err);
      cleanup();
    }
  }, [cleanup]);

  // Tray wake
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

  const statusClass = recording ? 'listening' :
    isListening ? 'listening' :
    isThinking ? 'thinking' :
    isSpeaking ? 'speaking' :
    'idle';

  return (
    <div className="ball-wrapper">
      <div
        className={`ball-body ball-${statusClass}`}
        onDoubleClick={wake}
        onContextMenu={(e) => { e.preventDefault(); setShowMenu(!showMenu); }}
      >
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

      {/* DialogBubble inline */}
      {isSpeaking && response && (
        <div className="dialog-bubble-inline">
          <div className="response-text">{response}</div>
        </div>
      )}
    </div>
  );
}
