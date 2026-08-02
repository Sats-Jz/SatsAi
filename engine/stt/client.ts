import type { STTResult } from '../types';

export type STTProvider = 'qwen' | 'openai' | 'groq';

export interface STTConfig {
  provider: STTProvider;
  apiKey: string;
  model?: string;
  language?: string;
}

const PROVIDER_CONFIGS: Record<STTProvider, { baseUrl: string; defaultModel: string }> = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'whisper-1',
  },
  // Groq: OpenAI-compatible Whisper API, free tier (no credit card needed)
  // https://console.groq.com
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'whisper-large-v3-turbo',
  },
  // Qwen Paraformer: async file transcription (submit + poll)
  // Uses DashScope native API, not compatible-mode
  qwen: {
    baseUrl: 'https://dashscope.aliyuncs.com/api/v1',
    defaultModel: 'paraformer-v2',
  },
};

export class STTClient {
  private config: STTConfig & { baseUrl: string };

  constructor(config: STTConfig) {
    const pc = PROVIDER_CONFIGS[config.provider];
    this.config = { ...config, model: config.model || pc.defaultModel, baseUrl: pc.baseUrl };
  }

  async transcribe(audioBuffer: Buffer): Promise<STTResult> {
    const wavBuffer = STTClient.pcmToWav(audioBuffer);

    if (this.config.provider === 'qwen') {
      return this.transcribeQwenAsync(wavBuffer);
    }

    // OpenAI / Groq: direct multipart file upload
    return this.transcribeOpenAI(wavBuffer);
  }

  /** OpenAI / Groq compatible: direct multipart upload */
  private async transcribeOpenAI(wavBuffer: Buffer): Promise<STTResult> {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(wavBuffer)], { type: 'audio/wav' });
    formData.append('file', blob, 'audio.wav');
    formData.append('model', this.config.model);
    if (this.config.language) formData.append('language', this.config.language);

    const url = `${this.config.baseUrl}/audio/transcriptions`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`STT API error (${response.status}): ${await response.text()}`);
    }

    const data = (await response.json()) as { text: string; language?: string };
    return { text: data.text || '', language: data.language || 'unknown', confidence: 0.95 };
  }

  /**
   * Qwen DashScope Paraformer: async task submission + polling.
   * Uses `oss://` data URLs — uploads as base64 data URL.
   */
  private async transcribeQwenAsync(wavBuffer: Buffer): Promise<STTResult> {
    // Step 1: Submit async transcription task
    // Paraformer accepts data URLs or OSS URLs
    const wavBase64 = wavBuffer.toString('base64');
    const dataUrl = `data:audio/wav;base64,${wavBase64}`;

    const submitUrl = `${this.config.baseUrl}/services/audio/asr/transcription`;
    const submitResp = await fetch(submitUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify({
        model: this.config.model,
        input: { file_urls: [dataUrl] },
        parameters: {
          language_hints: this.config.language ? [this.config.language] : undefined,
        },
      }),
    });

    if (!submitResp.ok) {
      const errText = await submitResp.text();
      // If data URL not supported, fall back to OpenAI format
      if (errText.includes('invalid') || errText.includes('file_urls')) {
        return this.transcribeOpenAI(wavBuffer);
      }
      throw new Error(`Qwen STT submit error (${submitResp.status}): ${errText}`);
    }

    const task = (await submitResp.json()) as {
      output?: { task_id?: string; task_status?: string };
    };
    const taskId = task.output?.task_id;
    if (!taskId) {
      throw new Error(`Qwen STT: no task_id returned`);
    }

    // Step 2: Poll for completion
    const pollUrl = `${this.config.baseUrl}/tasks/${taskId}`;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const pollResp = await fetch(pollUrl, {
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
      });
      if (!pollResp.ok) continue;

      const pollData = (await pollResp.json()) as {
        output?: {
          task_status?: string;
          results?: Array<{
            transcription_url?: string;
            sentences?: Array<{ text: string }>;
          }>;
        };
      };

      const status = pollData.output?.task_status;
      if (status === 'SUCCEEDED') {
        const sentences = pollData.output?.results?.[0]?.sentences;
        const text = sentences?.map((s) => s.text).join('') || '';
        return { text, language: 'zh', confidence: 0.95 };
      }
      if (status === 'FAILED') {
        throw new Error('Qwen STT: task failed');
      }
    }

    throw new Error('Qwen STT: polling timeout');
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
