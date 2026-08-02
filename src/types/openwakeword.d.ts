declare module 'openwakeword-wasm-browser' {
  export class WakeWordEngine {
    constructor(options?: {
      activeKeywords?: string[];
      cooldownMs?: number;
      ortWasmPath?: string;
      modelPath?: string;
    });
    load(): Promise<void>;
    start(options?: { deviceId?: string; gain?: number }): Promise<void>;
    stop(): void;
    setActiveKeywords(keywords: string[]): void;
    setGain(value: number): void;
    on(event: 'detect', callback: (result: { keyword: string; score: number }) => void): void;
    on(event: 'speech-start' | 'speech-end', callback: () => void): void;
    on(event: 'error', callback: (err: Error) => void): void;
    runWav(arrayBuffer: ArrayBuffer): Promise<Array<{ keyword: string; score: number }>>;
  }
}
