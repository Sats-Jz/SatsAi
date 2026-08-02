import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import WaveAnimation from './WaveAnimation';
import './FloatingBall.css';

const MAX_MS = 8000;

export default function FloatingBall() {
  const voiceState = useAppStore((s) => s.voiceState);
  const response = useAppStore((s) => s.response);
  const transcript = useAppStore((s) => s.transcript);
  const error = useAppStore((s) => s.error);
  const [recording, setRecording] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const chunks = useRef<Int16Array[]>([]);

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

    let ctx: AudioContext | null = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      ctx = new AudioContext({ sampleRate: 16000 });
      ctxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      chunks.current = [];

      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        const i16 = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) i16[i] = Math.round(Math.max(-1, Math.min(1, input[i])) * 32767);
        chunks.current.push(i16);
      };

      source.connect(processor);
      processor.connect(ctx.destination);
      setRecording(true);
      setCountdown(Math.ceil(MAX_MS / 1000));

      timerRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            source.disconnect();
            processor.disconnect();
            cleanup();
            setRecording(false);

            const totalLen = chunks.current.reduce((s, c) => s + c.length, 0);
            if (totalLen > 500) {
              const merged = new Int16Array(totalLen);
              let off = 0;
              for (const c of chunks.current) { merged.set(c, off); off += c.length; }
              window.electronAPI?.processAudio(merged.buffer.slice(merged.byteOffset, merged.byteOffset + merged.byteLength));
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      console.error('[Ball] Mic:', err);
      cleanup();
      setRecording(false);
    }
  }, [cleanup]);

  useEffect(() => {
    window.electronAPI?.onStartListening(() => wake());
    return () => window.electronAPI?.removeAllListeners('start-listening');
  }, [wake]);

  const face = recording || voiceState === 'listening' ? '\u{1F3A4}'
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
