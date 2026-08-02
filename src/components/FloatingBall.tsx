import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import WaveAnimation from './WaveAnimation';
import './FloatingBall.css';

const RECORD_MS = 8000;

export default function FloatingBall() {
  const voiceState = useAppStore((s) => s.voiceState);
  const response = useAppStore((s) => s.response);
  const transcript = useAppStore((s) => s.transcript);
  const error = useAppStore((s) => s.error);
  const [recording, setRecording] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const mrRef = useRef<MediaRecorder | null>(null);
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

      const mr = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus' : 'audio/webm',
      });
      mrRef.current = mr;

      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

      mr.onstop = () => {
        setRecording(false);
        setCountdown(0);
        cleanup();
        const blob = new Blob(chunks, { type: 'audio/webm' });
        if (blob.size < 200) return;
        // Read raw bytes — NO decode, NO Web Audio API, NO string loop
        const reader = new FileReader();
        reader.onload = () => {
          window.electronAPI?.processAudio(reader.result as ArrayBuffer);
        };
        reader.readAsArrayBuffer(blob);
      };

      mr.start();
      setRecording(true);
      setCountdown(Math.ceil(RECORD_MS / 1000));

      timerRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) { mrRef.current?.stop(); return 0; }
          return prev - 1;
        });
      }, 1000);
    } catch (err) { console.error('[Ball] Mic failed:', err); cleanup(); }
  }, [cleanup]);

  useEffect(() => {
    window.electronAPI?.onStartListening(() => wake());
    return () => window.electronAPI?.removeAllListeners('start-listening');
  }, [wake]);

  const face = recording ? '\u{1F3A4}'
    : voiceState === 'thinking' ? '\u{1F914}'
    : voiceState === 'speaking' ? '\u{1F4AC}'
    : '\u{1F60A}';

  const cls = recording || voiceState === 'listening' ? 'ball-listening'
    : voiceState === 'thinking' ? 'ball-thinking'
    : voiceState === 'speaking' ? 'ball-speaking'
    : 'ball-idle';

  return (
    <div className="ball-wrapper">
      {(response || transcript || error) && (
        <div className="ball-bubble">
          {transcript && <div className="bb-transcript">"{transcript}"</div>}
          {response && <div className="bb-response">{response}</div>}
          {error && <div className="bb-error">{error}</div>}
        </div>
      )}
      <div className={`ball-body ${cls}`} onDoubleClick={wake}>
        <div className="ball-face">{face}</div>
        {recording && <div className="countdown-badge">{countdown}s</div>}
        {(recording || voiceState === 'listening') && <WaveAnimation />}
        {voiceState === 'thinking' && <div className="thinking-ring" />}
      </div>
    </div>
  );
}
