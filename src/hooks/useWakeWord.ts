import { useEffect, useRef, useCallback } from 'react';

export type WakeWordCallback = (keyword: string, score: number) => void;

interface UseWakeWordOptions {
  keywords?: string[];
  onDetect: WakeWordCallback;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  cooldownMs?: number;
  enabled?: boolean;
}

/**
 * React hook wrapping OpenWakeWord for wake word detection.
 * Falls back gracefully if the module can't load (e.g., in Electron without wasm).
 * In that case, double-click on the floating ball still triggers manually.
 */
export function useWakeWord({
  keywords = ['hey_jarvis'],
  onDetect,
  onSpeechStart,
  onSpeechEnd,
  cooldownMs = 2000,
  enabled = true,
}: UseWakeWordOptions) {
  const onDetectRef = useRef(onDetect);
  const onSpeechStartRef = useRef(onSpeechStart);
  const onSpeechEndRef = useRef(onSpeechEnd);
  onDetectRef.current = onDetect;
  onSpeechStartRef.current = onSpeechStart;
  onSpeechEndRef.current = onSpeechEnd;

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    // Pre-configure ONNX wasm path to CDN (Vite dev server can't serve .wasm)
    const onnxVersion = '1.27.0';
    (globalThis as Record<string, unknown>).ortWasmPath =
      `https://cdn.jsdelivr.net/npm/onnxruntime-web@${onnxVersion}/dist/`;

    import('openwakeword-wasm-browser')
      .then(({ WakeWordEngine }) => {
        if (cancelled) return;

        const engine = new WakeWordEngine({
          activeKeywords: keywords,
          cooldownMs,
          ortWasmPath: `https://cdn.jsdelivr.net/npm/onnxruntime-web@${onnxVersion}/dist/`,
        });

        engine.on('detect', ({ keyword, score }) => {
          onDetectRef.current(keyword, score);
        });

        engine.on('speech-start', () => {
          onSpeechStartRef.current?.();
        });

        engine.on('speech-end', () => {
          onSpeechEndRef.current?.();
        });

        engine.on('error', (err: Error) => {
          console.warn('[OpenWakeWord] Error:', err.message);
        });

        return engine.load().then(() => engine.start());
      })
      .then((engine) => {
        if (!cancelled && engine) {
          console.log('[OpenWakeWord] Active, keywords:', keywords.join(', '));
        }
      })
      .catch((err) => {
        console.warn('[OpenWakeWord] Failed to load (double-click instead):', err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, keywords.join(','), cooldownMs]);

  const setKeywords = useCallback((_newKeywords: string[]) => {
    // Not supported in fallback mode
  }, []);

  return { setKeywords };
}
