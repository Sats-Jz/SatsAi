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
  const chunks = useRef<Int16Array[]>([]);
  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const streamRef = useRef<MediaStream | null>(null);

  const cleanup = useCallback(() => {
    clearInterval(timerRef.current);
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const wake = useCallback(async () => {
    if (ctxRef.current) return;
    window.electronAPI?.wakeWordDetected('manual', 1.0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1 } });
      streamRef.current = stream;
      const ctx = new AudioContext({ sampleRate: 16000 });
      ctxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const proc = ctx.createScriptProcessor(4096, 1, 1);  // ~256ms frames
      chunks.current = [];

      proc.onaudioprocess = (e) => {
        const ch = e.inputBuffer.getChannelData(0);
        const i16 = new Int16Array(ch.length);
        for (let i = 0; i < ch.length; i++) i16[i] = Math.round(Math.max(-1, Math.min(1, ch[i])) * 32767);
        chunks.current.push(i16);
      };

      src.connect(proc);
      proc.connect(ctx.destination);
      setRecording(true);
      setCountdown(10);

      timerRef.current = setInterval(() => setCountdown((p) => {
        if (p <= 1) {
          src.disconnect(); proc.disconnect(); cleanup();
          setRecording(false); setCountdown(0);

          const total = chunks.current.reduce((s, c) => s + c.length, 0);
          if (total < 1600) return 0;
          const merged = new Int16Array(total);
          let off = 0;
          for (const c of chunks.current) { merged.set(c, off); off += c.length; }
          const buf = merged.buffer.slice(merged.byteOffset, merged.byteOffset + merged.byteLength);
          window.electronAPI?.processAudio(buf);
          return 0;
        }
        return p - 1;
      }), 1000);
    } catch (e) { console.error('[Ball]', e); cleanup(); setRecording(false); }
  }, [cleanup]);

  useEffect(() => {
    window.electronAPI?.onStartListening(() => wake());
    return () => window.electronAPI?.removeAllListeners('start-listening');
  }, [wake]);

  const bus = recording || voiceState === 'listening';
  const face = bus ? '\u{1F3A4}' : voiceState === 'thinking' ? '\u{1F914}' : voiceState === 'speaking' ? '\u{1F4AC}' : '\u{1F60A}';
  const cls = bus ? 'ball-listening' : voiceState === 'thinking' ? 'ball-thinking' : voiceState === 'speaking' ? 'ball-speaking' : 'ball-idle';

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
        {bus && <WaveAnimation />}
        {voiceState === 'thinking' && <div className="thinking-ring" />}
      </div>
    </div>
  );
}
