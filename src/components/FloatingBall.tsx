import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import { webmBlobToWavBase64 } from '../utils/audio';
import WaveAnimation from './WaveAnimation';
import './FloatingBall.css';

const RECORD_MS = 8000;

export default function FloatingBall() {
  const voiceState = useAppStore((s) => s.voiceState);
  const response = useAppStore((s) => s.response);
  const transcript = useAppStore((s) => s.transcript);
  const error = useAppStore((s) => s.error);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const setEnrollmentOpen = useAppStore((s) => s.setEnrollmentOpen);
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

    // Tell engine
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
        console.log('[Ball] Recording done, blob size:', blob.size);
        if (blob.size < 200) return;
        try {
          const wavBase64 = await webmBlobToWavBase64(blob);
          console.log('[Ball] WAV base64 length:', wavBase64.length);
          window.electronAPI?.processAudio(wavBase64);
        } catch (err) {
          console.error('[Ball] Convert error:', err);
        }
      };

      mr.start(100);
      setRecording(true);
      setCountdown(Math.ceil(RECORD_MS / 1000));
      console.log('[Ball] Recording started,', RECORD_MS, 'ms');

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
  // Ball is ALWAYS visible. State changes affect animation, not visibility.
  const showMic = recording;
  const showThinking = voiceState === 'thinking';
  const showSpeaking = voiceState === 'speaking';
  const highlight = recording || voiceState === 'listening';

  const face = recording ? '\u{1F3A4}'
    : voiceState === 'thinking' ? '\u{1F914}'
    : voiceState === 'speaking' ? '\u{1F4AC}'
    : '\u{1F60A}';

  const cls = highlight ? 'ball-listening'
    : voiceState === 'thinking' ? 'ball-thinking'
    : voiceState === 'speaking' ? 'ball-speaking'
    : 'ball-idle';

  return (
    <div className="ball-wrapper">
      {/* Speech bubble above ball */}
      {(response || transcript || error) && (
        <div className="ball-bubble">
          {transcript && <div className="bb-transcript">"{transcript}"</div>}
          {response && <div className="bb-response">{response}</div>}
          {error && <div className="bb-error">{error}</div>}
        </div>
      )}

      <div
        className={`ball-body ${cls}`}
        onDoubleClick={wake}
        onContextMenu={(e) => { e.preventDefault(); }}
      >
        <div className="ball-face">{face}</div>
        {recording && <div className="countdown-badge">{countdown}s</div>}
        {showMic && <WaveAnimation />}
        {showThinking && <div className="thinking-ring" />}
      </div>
    </div>
  );
}
