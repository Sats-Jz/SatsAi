import { useEffect, useRef, useCallback } from 'react';
import { WakeWordEngine } from 'openwakeword-wasm-browser';

export type WakeWordCallback = (keyword: string, score: number) => void;

interface UseWakeWordOptions {
  keywords?: string[];
  onDetect: WakeWordCallback;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onAudioChunk?: (chunk: Float32Array) => void;
  cooldownMs?: number;
  enabled?: boolean;
}

/**
 * React hook wrapping OpenWakeWord (free, open-source) for browser wake word detection.
 * Uses ONNX Runtime Web + Web Audio API in the Electron renderer process.
 *
 * Exposes speech-start/speech-end from OpenWakeWord's built-in Silero VAD,
 * allowing the UI/engine to capture audio while the user is speaking.
 */
export function useWakeWord({
  keywords = ['hey_jarvis'],
  onDetect,
  onSpeechStart,
  onSpeechEnd,
  onAudioChunk,
  cooldownMs = 2000,
  enabled = true,
}: UseWakeWordOptions) {
  const engineRef = useRef<WakeWordEngine | null>(null);
  const onDetectRef = useRef(onDetect);
  const onSpeechStartRef = useRef(onSpeechStart);
  const onSpeechEndRef = useRef(onSpeechEnd);
  onDetectRef.current = onDetect;
  onSpeechStartRef.current = onSpeechStart;
  onSpeechEndRef.current = onSpeechEnd;

  useEffect(() => {
    if (!enabled) return;

    const engine = new WakeWordEngine({
      activeKeywords: keywords,
      cooldownMs,
    });
    engineRef.current = engine;

    engine.on('detect', ({ keyword, score }) => {
      onDetectRef.current(keyword, score);
    });

    engine.on('speech-start', () => {
      onSpeechStartRef.current?.();
    });

    engine.on('speech-end', () => {
      onSpeechEndRef.current?.();
    });

    engine.on('error', (err) => {
      console.error('[OpenWakeWord] Error:', err);
    });

    engine
      .load()
      .then(() => engine.start())
      .then(() => {
        console.log('[OpenWakeWord] Listening for:', keywords.join(', '));
      })
      .catch((err) => {
        console.error('[OpenWakeWord] Failed to start:', err);
      });

    return () => {
      engine.stop?.();
    };
  }, [enabled, keywords.join(','), cooldownMs]);

  const setKeywords = useCallback((newKeywords: string[]) => {
    engineRef.current?.setActiveKeywords(newKeywords);
  }, []);

  return { setKeywords };
}
