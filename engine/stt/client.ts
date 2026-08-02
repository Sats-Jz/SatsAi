import type { STTResult } from '../types';

export type STTProvider = 'qwen' | 'openai';

export interface STTConfig {
  provider: STTProvider;
  apiKey: string;
  model?: string;
  language?: string;
}

const PROVIDER_CONFIGS: Record<STTProvider, { baseUrl: string; defaultModel: string; transcribePath: string }> = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'whisper-1',
    transcribePath: '/audio/transcriptions',
  },
  qwen: {
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'paraformer-v2',
    transcribePath: '/audio/transcriptions',
  },
};

export class STTClient {
  private config: STTConfig & { baseUrl: string; transcribePath: string };

  constructor(config: STTConfig) {
    const providerConfig = PROVIDER_CONFIGS[config.provider];
    this.config = {
      ...config,
      model: config.model || providerConfig.defaultModel,
      baseUrl: providerConfig.baseUrl,
      transcribePath: providerConfig.transcribePath,
    };
  }

  async transcribe(audioBuffer: Buffer): Promise<STTResult> {
    // Convert PCM buffer to WAV format (common for all providers)
    const wavBuffer = STTClient.pcmToWav(audioBuffer);

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(wavBuffer)], { type: 'audio/wav' });
    formData.append('file', blob, 'audio.wav');
    formData.append('model', this.config.model);
    if (this.config.language) {
      formData.append('language', this.config.language);
    }

    const url = `${this.config.baseUrl}${this.config.transcribePath}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`STT API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as { text: string; language?: string };

    return {
      text: data.text || '',
      language: data.language || 'unknown',
      confidence: 0.95,
    };
  }

  static pcmToWav(pcmBuffer: Buffer, sampleRate = 16000): Buffer {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = pcmBuffer.length;
    const headerSize = 44;

    const wavBuffer = Buffer.alloc(headerSize + dataSize);
    let offset = 0;
    wavBuffer.write('RIFF', offset); offset += 4;
    wavBuffer.writeUInt32LE(36 + dataSize, offset); offset += 4;
    wavBuffer.write('WAVE', offset); offset += 4;
    wavBuffer.write('fmt ', offset); offset += 4;
    wavBuffer.writeUInt32LE(16, offset); offset += 4;
    wavBuffer.writeUInt16LE(1, offset); offset += 2; // PCM
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
