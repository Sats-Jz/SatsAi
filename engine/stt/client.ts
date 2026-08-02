import type { STTResult } from '../types';
import WebSocket from 'ws';

export type STTProvider = 'qwen' | 'openai' | 'groq';

export interface STTConfig {
  provider: STTProvider;
  apiKey: string;
  model?: string;
  language?: string;
}

export class STTClient {
  private config: STTConfig & { model: string };

  constructor(config: STTConfig) {
    this.config = {
      model: config.provider === 'qwen' ? 'paraformer-realtime-v2' : 'whisper-1',
      language: 'zh',
      ...config,
    };
  }

  async transcribe(pcm: Buffer): Promise<STTResult> {
    if (this.config.provider === 'qwen') return this.qwenWS(pcm);
    return this.httpTranscribe(pcm);
  }

  private async httpTranscribe(pcm: Buffer): Promise<STTResult> {
    const wav = STTClient.pcm2wav(pcm);
    const fd = new FormData();
    fd.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'audio.wav');
    fd.append('model', this.config.model);
    if (this.config.language) fd.append('language', this.config.language);
    const base = this.config.provider === 'groq' ? 'https://api.groq.com/openai/v1' : 'https://api.openai.com/v1';
    const r = await fetch(`${base}/audio/transcriptions`, {
      method: 'POST', headers: { Authorization: `Bearer ${this.config.apiKey}` }, body: fd,
    });
    if (!r.ok) throw new Error(`STT ${r.status}`);
    const d = (await r.json()) as { text: string };
    return { text: d.text || '', language: 'unknown', confidence: 0.95 };
  }

  private qwenWS(pcm: Buffer): Promise<STTResult> {
    return new Promise((resolve, reject) => {
      const tid = `s-${Date.now()}`;
      let done = false;
      const texts: string[] = [];
      const ws = new WebSocket('wss://dashscope.aliyuncs.com/api-ws/v1/inference', {
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
      });
      const end = (r: STTResult | Error) => { if (done) return; done = true; try { ws.close(); } catch {} if (r instanceof Error) reject(r); else resolve(r); };
      setTimeout(() => end(new Error('WS timeout')), 20000);

      ws.on('open', () => {
        ws.send(JSON.stringify({
          header: { task_id: tid, task_group: 'audio', task: 'asr', function: 'recognition', model: this.config.model, action: 'run-task' },
          payload: { task_group: 'audio', task: 'asr', function: 'recognition', model: this.config.model, input: {}, parameters: { format: 'pcm', sample_rate: 16000 } },
        }));
        for (let i = 0; i < pcm.length; i += 3200) ws.send(pcm.subarray(i, i + 3200));
        ws.send(JSON.stringify({
          header: { task_id: tid, task_group: 'audio', task: 'asr', function: 'recognition', action: 'finish-task' },
          payload: { task_group: 'audio', task: 'asr', function: 'recognition', model: this.config.model },
        }));
      });

      ws.on('message', (d: WebSocket.Data) => {
        try {
          const m = JSON.parse(d.toString());
          if (m.header?.event === 'result-generated') texts.push(m.payload?.output?.text || '');
          if (m.header?.event === 'task-finished') end({ text: texts.join(''), language: 'zh', confidence: 0.95 });
          if (m.header?.event === 'task-failed') end(new Error('WS failed: ' + JSON.stringify(m).slice(0, 200)));
        } catch {}
      });
      ws.on('error', (e: Error) => end(e));
    });
  }

  static pcm2wav(pcm: Buffer, sr = 16000): Buffer {
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
