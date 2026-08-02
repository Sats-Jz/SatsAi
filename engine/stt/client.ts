import type { STTResult } from '../types';
import WebSocket from 'ws';

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
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'whisper-large-v3-turbo',
  },
  qwen: {
    baseUrl: 'wss://dashscope.aliyuncs.com/api-ws/v1/inference',
    defaultModel: 'paraformer-realtime-v2',
  },
};

export class STTClient {
  private config: STTConfig & { baseUrl: string };

  constructor(config: STTConfig) {
    const pc = PROVIDER_CONFIGS[config.provider];
    this.config = { ...config, model: config.model || pc.defaultModel, baseUrl: pc.baseUrl };
  }

  /**
   * Transcribe audio. Buffer is raw 16-bit PCM mono (16kHz).
   * The renderer already decoded WebM → PCM.
   */
  async transcribe(audioBuffer: Buffer): Promise<STTResult> {
    if (this.config.provider === 'qwen') {
      // Qwen WS accepts raw PCM directly
      return this.transcribeQwenRealtime(audioBuffer);
    }
    // OpenAI / Groq: transcribeOpenAI wraps raw PCM in WAV internally
    return this.transcribeOpenAI(audioBuffer);
  }

  /** OpenAI / Groq: HTTP multipart upload */
  private async transcribeOpenAI(audioBuffer: Buffer): Promise<STTResult> {
    const wavBuffer = STTClient.pcmToWav(audioBuffer);
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
   * Qwen Paraformer 实时语音识别 (WebSocket).
   *
   * Protocol: wss://dashscope.aliyuncs.com/api-ws/v1/inference
   * 1. Connect WebSocket with Bearer auth
   * 2. Send run-task header (model, parameters)
   * 3. Stream raw 16kHz 16-bit mono PCM audio
   * 4. Send finish-task
   * 5. Collect result-generated events → text
   */
  private transcribeQwenRealtime(pcmBuffer: Buffer): Promise<STTResult> {
    return new Promise((resolve, reject) => {
      const taskId = `satsai-${Date.now()}`;
      const texts: string[] = [];
      let completed = false;

      const ws = new WebSocket(this.config.baseUrl, {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
        },
      });

      const finish = (result: STTResult | Error) => {
        if (completed) return;
        completed = true;
        ws.close();
        if (result instanceof Error) reject(result);
        else resolve(result);
      };

      // Timeout after 30 seconds
      const timer = setTimeout(() => {
        finish(new Error('Qwen STT: WebSocket timeout'));
      }, 30000);

      ws.on('open', async () => {
        // Step 1: Send run-task header
        const runTask = {
          header: {
            task_id: taskId,
            task_group: 'audio',
            task: 'asr',
            function: 'recognition',
            model: this.config.model,
            action: 'run-task',
          },
          payload: {
            task_group: 'audio',
            task: 'asr',
            function: 'recognition',
            model: this.config.model,
            input: {},
            parameters: {
              format: 'pcm',
              sample_rate: 16000,
              ...(this.config.language ? { language_hints: [this.config.language] } : {}),
            },
          },
        };
        ws.send(JSON.stringify(runTask));

        // Brief delay for server to acknowledge run-task
        await new Promise((r) => setTimeout(r, 100));

        // Step 2: Stream audio as raw PCM (NOT WAV!)
        const chunkSize = 3200;
        let offset = 0;
        while (offset < pcmBuffer.length) {
          const chunk = pcmBuffer.subarray(offset, offset + chunkSize);
          ws.send(chunk);
          offset += chunkSize;
        }

        // Step 3: Signal end of audio
        const finishTask = {
          header: {
            task_id: taskId,
            task_group: 'audio',
            task: 'asr',
            function: 'recognition',
            action: 'finish-task',
          },
          payload: {
            task_group: 'audio',
            task: 'asr',
            function: 'recognition',
            model: this.config.model,
          },
        };
        ws.send(JSON.stringify(finishTask));
      });

      ws.on('message', (data: WebSocket.Data) => {
        const raw = data.toString();
        console.log('[Qwen WS] ←', raw.slice(0, 300));
        try {
          const msg = JSON.parse(raw) as {
            header?: { event?: string };
            payload?: { output?: { text?: string } };
          };

          // result-generated event contains transcription text
          if (msg.header?.event === 'result-generated') {
            const text = msg.payload?.output?.text;
            if (text) texts.push(text);
          }

          // task-finished event means transcription is complete
          if (msg.header?.event === 'task-finished') {
            clearTimeout(timer);
            finish({
              text: texts.join(''),
              language: this.config.language || 'zh',
              confidence: 0.95,
            });
          }

          // task-failed
          if (msg.header?.event === 'task-failed') {
            clearTimeout(timer);
            finish(new Error(`Qwen STT: task failed - ${JSON.stringify(msg)}`));
          }
        } catch {
          // Binary frame — ignore (we only sent audio, shouldn't receive binary)
        }
      });

      ws.on('error', (err) => {
        clearTimeout(timer);
        finish(new Error(`Qwen STT WebSocket error: ${err.message}`));
      });

      ws.on('close', () => {
        clearTimeout(timer);
        if (!completed) {
          finish(new Error('Qwen STT: WebSocket closed unexpectedly'));
        }
      });
    });
  }

  /** Extract raw PCM from a WAV buffer (skip 44-byte header) */
  static wavToPcm(wavBuffer: Buffer): Buffer {
    // WAV header is 44 bytes; data chunk starts after "data" + 4-byte size
    if (wavBuffer.length < 44) return wavBuffer;
    // Find "data" chunk ID at offset 36
    if (wavBuffer.toString('ascii', 36, 40) === 'data') {
      const dataOffset = 44;
      return wavBuffer.subarray(dataOffset);
    }
    // Fallback: just strip first 44 bytes
    return wavBuffer.subarray(44);
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
