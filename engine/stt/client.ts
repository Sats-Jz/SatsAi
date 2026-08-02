import type { STTResult } from '../types';

export interface STTConfig {
  apiKey: string;
  model?: string;
  language?: string;
  baseUrl?: string;
}

export class STTClient {
  private config: STTConfig;

  constructor(config: STTConfig) {
    this.config = { model: 'whisper-1', baseUrl: 'https://api.openai.com/v1', ...config };
  }

  async transcribe(audioBuffer: Buffer): Promise<STTResult> {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(audioBuffer)], { type: 'audio/wav' });
    formData.append('file', blob, 'audio.wav');
    formData.append('model', this.config.model!);
    if (this.config.language) formData.append('language', this.config.language);

    const response = await fetch(`${this.config.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`STT API error (${response.status}): ${await response.text()}`);
    }

    const data = (await response.json()) as { text: string; language?: string };
    return { text: data.text, language: data.language || 'unknown', confidence: 0.95 };
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
