import type { STTResult } from '../types';

export type STTProvider = 'qwen' | 'openai' | 'groq';

export interface STTConfig {
  provider: STTProvider;
  apiKey: string;
  model?: string;
  language?: string;
}

export class STTClient {
  private config: STTConfig;

  constructor(config: STTConfig) {
    this.config = { model: 'paraformer-v2', language: 'zh', ...config };
  }

  /**
   * Transcribe audio. Accepts ANY format — WebM, WAV, MP3, etc.
   * Qwen compatible-mode handles format detection server-side.
   */
  async transcribe(audio: Buffer): Promise<STTResult> {
    const isQwen = this.config.provider === 'qwen';

    // Qwen compatible-mode (OpenAI-compatible HTTP)
    // Accepts: flac, m4a, mp3, mp4, mpeg, mpga, oga, ogg, wav, webm
    const baseUrl = isQwen
      ? 'https://dashscope.aliyuncs.com/compatible-mode/v1'
      : this.config.provider === 'groq'
        ? 'https://api.groq.com/openai/v1'
        : 'https://api.openai.com/v1';

    const fd = new FormData();
    fd.append('file', new Blob([new Uint8Array(audio)], { type: 'audio/webm' }), 'audio.webm');
    fd.append('model', this.config.model!);
    if (this.config.language) fd.append('language', this.config.language);

    const r = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
      body: fd,
    });

    if (!r.ok) {
      const errText = await r.text();
      throw new Error(`STT ${r.status}: ${errText.slice(0, 300)}`);
    }

    const d = (await r.json()) as { text: string; language?: string };
    console.log('[STT] Response:', JSON.stringify(d));
    return { text: d.text || '', language: d.language || 'zh', confidence: 0.95 };
  }
}
