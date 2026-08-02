import type { STTResult } from '../types';

export type STTProvider = 'qwen' | 'openai' | 'groq';

export interface STTConfig {
  provider: STTProvider;
  apiKey: string;
  model?: string;
  language?: string;
}

const PROVIDER_CONFIGS: Record<STTProvider, { baseUrl: string; defaultModel: string }> = {
  openai: { baseUrl: 'https://api.openai.com/v1', defaultModel: 'whisper-1' },
  groq: { baseUrl: 'https://api.groq.com/openai/v1', defaultModel: 'whisper-large-v3-turbo' },
  // Qwen DashScope compatible-mode — OpenAI-compatible HTTP API
  qwen: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', defaultModel: 'paraformer-v2' },
};

export class STTClient {
  private config: STTConfig & { baseUrl: string };

  constructor(config: STTConfig) {
    const pc = PROVIDER_CONFIGS[config.provider];
    this.config = { ...config, model: config.model || pc.defaultModel, baseUrl: pc.baseUrl };
  }

  /**
   * Transcribe audio. All providers use OpenAI-compatible HTTP multipart upload.
   * Buffer can be WebM, WAV, MP3, etc. — the API handles format detection.
   */
  async transcribe(audioBuffer: Buffer): Promise<STTResult> {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(audioBuffer)], { type: 'audio/webm' });
    formData.append('file', blob, 'audio.webm');
    formData.append('model', this.config.model);
    if (this.config.language) formData.append('language', this.config.language);

    const url = `${this.config.baseUrl}/audio/transcriptions`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`STT error (${response.status}): ${errText.slice(0, 200)}`);
    }

    const data = (await response.json()) as { text: string; language?: string };
    return { text: data.text || '', language: data.language || 'unknown', confidence: 0.95 };
  }

  static pcmToWav(pcmBuffer: Buffer, sampleRate = 16000): Buffer {
    const numChannels = 1, bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = pcmBuffer.length, headerSize = 44;
    const wavBuffer = Buffer.alloc(headerSize + dataSize);
    let offset = 0;
    wavBuffer.write('RIFF', offset); offset += 4;
    wavBuffer.writeUInt32LE(36 + dataSize, offset); offset += 4;
    wavBuffer.write('WAVE', offset); offset += 4;
    wavBuffer.write('fmt ', offset); offset += 4;
    wavBuffer.writeUInt32LE(16, offset); offset += 4;
    wavBuffer.writeUInt16LE(1, offset); offset += 2;
    wavBuffer.writeUInt16LE(numChannels, offset); offset += 2;
    wavBuffer.writeUInt32LE(sampleRate, offset); offset += 4;
    wavBuffer.writeUInt32LE(byteRate, offset); offset += 4;
    wavBuffer.writeUInt16LE(blockAlign, offset); offset += 2;
    wavBuffer.writeUInt16LE(bitsPerSample, offset); offset += 2;
    wavBuffer.write('data', offset); offset += 4;
    wavBuffer.writeUInt32LE(dataSize, offset); offset += 4;
    pcmBuffer.copy(wavBuffer, offset);
    return wavBuffer;
  }
}
