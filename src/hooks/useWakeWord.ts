import { useEffect, useRef, useCallback } from 'react';
import { WakeWordEngine } from 'openwakeword-wasm-browser';

export type WakeWordCallback = (keyword: string, score: number) => void;

interface UseWakeWordOptions {
  keywords?: string[];
  onDetect: WakeWordCallback;
  cooldownMs?: number;
  enabled?: boolean;
}

/**
 * React hook wrapping OpenWakeWord (free, open-source) for in-browser wake word detection.
 * Runs in the Electron renderer process using ONNX Runtime Web + Web Audio API.
 */
export function useWakeWord({
  keywords = ['hey_jarvis'],
  onDetect,
  cooldownMs = 2000,
  enabled = true,
}: UseWakeWordOptions) {
  const engineRef = useRef<WakeWordEngine | null>(null);
  const loadedRef = useRef(false);
  const onDetectRef = useRef(onDetect);
  onDetectRef.current = onDetect;

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

    engine.on('error', (err) => {
      console.error('[OpenWakeWord] Error:', err);
    });

    // Load models and start listening
    engine.load()
      .then(() => {
        loadedRef.current = true;
        console.log('[OpenWakeWord] Models loaded, starting...');
        return engine.start();
      })
      .then(() => {
        console.log('[OpenWakeWord] Listening for:', keywords.join(', '));
      })
      .catch((err) => {
        console.error('[OpenWakeWord] Failed to start:', err);
      });

    return () => {
      engine.stop?.();
      loadedRef.current = false;
    };
  }, [enabled, keywords.join(','), cooldownMs]);

  const setKeywords = useCallback((newKeywords: string[]) => {
    engineRef.current?.setActiveKeywords(newKeywords);
  }, []);

  return { setKeywords };
}
