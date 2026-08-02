import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import WaveAnimation from './WaveAnimation';
import './FloatingBall.css';

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
    if (mrRef.current) return;
    window.electronAPI?.wakeWordDetected('manual', 1.0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream);
      mrRef.current = mr;
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

      mr.onstop = async () => {
        cleanup();
        setRecording(false);
        setCountdown(0);
        const blob = new Blob(chunks);
        if (blob.size < 200) return;

        // Decode WebM → raw PCM via Web Audio API (one-shot, no ScriptProcessor)
        try {
          const arrayBuf = await blob.arrayBuffer();
          const ctx = new AudioContext({ sampleRate: 16000 });
          const audioBuf = await ctx.decodeAudioData(arrayBuf);
          ctx.close();
          const channel = audioBuf.getChannelData(0);
          // Float32 → Int16 PCM
          const pcm = new Int16Array(channel.length);
          for (let i = 0; i < channel.length; i++) {
            pcm[i] = Math.round(Math.max(-1, Math.min(1, channel[i])) * 32767);
          }
          window.electronAPI?.processAudio(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength));
        } catch (e) {
          console.error('[Ball] Decode error:', e);
        }
      };

      mr.start();
      setRecording(true);
      setCountdown(8);
      timerRef.current = setInterval(() => setCountdown((p) => {
        if (p <= 1) { mrRef.current?.stop(); return 0; }
        return p - 1;
      }), 1000);
    } catch (e) { console.error('[Ball]', e); cleanup(); setRecording(false); }
  }, [cleanup]);

  useEffect(() => {
    window.electronAPI?.onStartListening(() => wake());
    return () => window.electronAPI?.removeAllListeners('start-listening');
  }, [wake]);

  const face = recording || voiceState === 'listening' ? '\u{1F3A4}'
    : voiceState === 'thinking' ? '\u{1F914}'
    : voiceState === 'speaking' ? '\u{1F4AC}' : '\u{1F60A}';

  const cls = recording || voiceState === 'listening' ? 'ball-listening'
    : voiceState === 'thinking' ? 'ball-thinking'
    : voiceState === 'speaking' ? 'ball-speaking' : 'ball-idle';

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
