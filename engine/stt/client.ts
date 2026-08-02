import type { STTResult } from '../types';
import WebSocket from 'ws';

export type STTProvider = 'qwen' | 'openai' | 'groq';

export interface STTConfig {
  provider: STTProvider;
  apiKey: string;
  model?: string;
  language?: string;
}

const CONFIG: Record<STTProvider, { baseUrl: string; defaultModel: string }> = {
  openai: { baseUrl: 'https://api.openai.com/v1', defaultModel: 'whisper-1' },
  groq: { baseUrl: 'https://api.groq.com/openai/v1', defaultModel: 'whisper-large-v3-turbo' },
  qwen: { baseUrl: 'wss://dashscope.aliyuncs.com/api-ws/v1/inference', defaultModel: 'paraformer-realtime-v2' },
};

export class STTClient {
  private config: STTConfig & { baseUrl: string };

  constructor(config: STTConfig) {
    const pc = CONFIG[config.provider];
    this.config = { ...config, model: config.model || pc.defaultModel, baseUrl: pc.baseUrl };
  }

  /** Transcribe PCM audio. Qwen: WebSocket. OpenAI/Groq: HTTP. */
  async transcribe(pcmBuffer: Buffer): Promise<STTResult> {
    if (this.config.provider === 'qwen') {
      return this.transcribeQwenWS(pcmBuffer);
    }
    return this.transcribeHTTP(pcmBuffer);
  }

  private async transcribeHTTP(audio: Buffer): Promise<STTResult> {
    const wav = STTClient.pcmToWav(audio);
    const fd = new FormData();
    fd.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'audio.wav');
    fd.append('model', this.config.model);
    if (this.config.language) fd.append('language', this.config.language);
    const r = await fetch(`${this.config.baseUrl}/audio/transcriptions`, {
      method: 'POST', headers: { Authorization: `Bearer ${this.config.apiKey}` }, body: fd,
    });
    if (!r.ok) throw new Error(`STT HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const d = (await r.json()) as { text: string };
    return { text: d.text || '', language: this.config.language || 'unknown', confidence: 0.95 };
  }

  /** Qwen real-time WebSocket: raw PCM in, text out */
  private transcribeQwenWS(pcm: Buffer): Promise<STTResult> {
    return new Promise((resolve, reject) => {
      const tid = `satsai-${Date.now()}`;
      let done = false;
      const texts: string[] = [];

      const ws = new WebSocket(this.config.baseUrl, {
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
      });

      const finish = (result: STTResult | Error) => {
        if (done) return; done = true;
        try { ws.close(); } catch {}
        if (result instanceof Error) reject(result); else resolve(result);
      };

      setTimeout(() => finish(new Error('Qwen WS timeout')), 30000);

      ws.on('open', () => {
        ws.send(JSON.stringify({
          header: { task_id: tid, task_group: 'audio', task: 'asr', function: 'recognition', model: this.config.model, action: 'run-task' },
          payload: { task_group: 'audio', task: 'asr', function: 'recognition', model: this.config.model, input: {}, parameters: { format: 'pcm', sample_rate: 16000 } },
        }));
        // Send PCM in chunks
        let off = 0;
        while (off < pcm.length) { ws.send(pcm.subarray(off, off + 3200)); off += 3200; }
        ws.send(JSON.stringify({
          header: { task_id: tid, task_group: 'audio', task: 'asr', function: 'recognition', action: 'finish-task' },
          payload: { task_group: 'audio', task: 'asr', function: 'recognition', model: this.config.model },
        }));
      });

      ws.on('message', (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.header?.event === 'result-generated') {
            texts.push(msg.payload?.output?.text || '');
          }
          if (msg.header?.event === 'task-finished') {
            finish({ text: texts.join(''), language: 'zh', confidence: 0.95 });
          }
          if (msg.header?.event === 'task-failed') {
            finish(new Error(`Qwen WS failed: ${JSON.stringify(msg).slice(0, 200)}`));
          }
        } catch {}
      });

      ws.on('error', (e: Error) => finish(new Error(`Qwen WS: ${e.message}`)));
      ws.on('close', () => { if (!done) finish(new Error('Qwen WS closed unexpectedly')); });
    });
  }

  static pcmToWav(pcm: Buffer, sr = 16000): Buffer {
    const nc = 1, bps = 16, br = sr * nc * 2, ba = nc * 2, ds = pcm.length;
    const w = Buffer.alloc(44 + ds); let o = 0;
    w.write('RIFF', o); o += 4; w.writeUInt32LE(36 + ds, o); o += 4;
    w.write('WAVE', o); o += 4; w.write('fmt ', o); o += 4;
    w.writeUInt32LE(16, o); o += 4; w.writeUInt16LE(1, o); o += 2;
    w.writeUInt16LE(nc, o); o += 2; w.writeUInt32LE(sr, o); o += 4;
    w.writeUInt32LE(br, o); o += 4; w.writeUInt16LE(ba, o); o += 2;
    w.writeUInt16LE(bps, o); o += 2; w.write('data', o); o += 4;
    w.writeUInt32LE(ds, o); o += 4; pcm.copy(w, o);
    return w;
  }
}
