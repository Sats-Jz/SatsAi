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
  private config: STTConfig;

  constructor(config: STTConfig) {
    this.config = { model: 'paraformer-realtime-v2', language: 'zh', ...config };
  }

  /** Transcribe raw PCM — tries WS first (real-time), falls back to async HTTP */
  async transcribe(pcm: Buffer): Promise<STTResult> {
    if (this.config.provider === 'qwen') {
      // Primary: WebSocket real-time (now we have valid PCM from prism-media)
      try { return await this.qwenWS(pcm); }
      catch (e) { console.log('[STT] WS failed, trying HTTP async:', (e as Error).message.slice(0, 100)); }

      // Fallback: async HTTP API
      return this.qwenAsync(pcm);
    }
    return this.httpTranscribe(pcm);
  }

  /** OpenAI / Groq — HTTP multipart with WAV */
  private async httpTranscribe(pcm: Buffer): Promise<STTResult> {
    const wav = STTClient.pcm2wav(pcm);
    const fd = new FormData();
    fd.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'audio.wav');
    fd.append('model', this.config.model!);
    if (this.config.language) fd.append('language', this.config.language);
    const r = await fetch(
      this.config.provider === 'groq'
        ? 'https://api.groq.com/openai/v1/audio/transcriptions'
        : 'https://api.openai.com/v1/audio/transcriptions',
      { method: 'POST', headers: { Authorization: `Bearer ${this.config.apiKey}` }, body: fd }
    );
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = (await r.json()) as { text: string };
    return { text: d.text || '', language: 'unknown', confidence: 0.95 };
  }

  /** Qwen WebSocket real-time — we now send valid PCM */
  private qwenWS(pcm: Buffer): Promise<STTResult> {
    return new Promise((resolve, reject) => {
      const tid = `s-${Date.now()}`;
      let done = false;
      const texts: string[] = [];
      const ws = new WebSocket('wss://dashscope.aliyuncs.com/api-ws/v1/inference', {
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
      });
      const end = (r: STTResult | Error) => {
        if (done) return; done = true;
        try { ws.close(); } catch {}
        if (r instanceof Error) reject(r); else resolve(r);
      };
      setTimeout(() => end(new Error('WS timeout')), 20000);

      ws.on('open', () => {
        // run-task
        ws.send(JSON.stringify({
          header: { task_id: tid, task_group: 'audio', task: 'asr', function: 'recognition', model: this.config.model, action: 'run-task' },
          payload: { task_group: 'audio', task: 'asr', function: 'recognition', model: this.config.model, input: {}, parameters: { format: 'pcm', sample_rate: 16000 } },
        }));
        // Chunk PCM at 100ms intervals
        const chunk = 3200;
        for (let i = 0; i < pcm.length; i += chunk) ws.send(pcm.subarray(i, i + chunk));
        // finish-task
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
          if (m.header?.event === 'task-failed') end(new Error(`WS: ${JSON.stringify(m).slice(0, 200)}`));
        } catch {}
      });
      ws.on('error', (e: Error) => end(e));
    });
  }

  /** Qwen async HTTP — data URL upload */
  private async qwenAsync(pcm: Buffer): Promise<STTResult> {
    const wav = STTClient.pcm2wav(pcm);
    const b64 = wav.toString('base64');
    const url = `data:audio/wav;base64,${b64}`;

    const r = await fetch('https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.config.apiKey}`, 'Content-Type': 'application/json', 'X-DashScope-Async': 'enable' },
      body: JSON.stringify({ model: 'paraformer-v2', input: { file_urls: [url] } }),
    });
    if (!r.ok) throw new Error(`Qwen async ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const task = (await r.json()) as { output?: { task_id?: string } };
    const tid = task.output?.task_id;
    if (!tid) throw new Error('No task_id from Qwen');

    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const pr = await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${tid}`, {
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
      });
      const pd = (await pr.json()) as { output?: { task_status?: string; results?: Array<{ sentences?: Array<{ text: string }> }> } };
      if (pd.output?.task_status === 'SUCCEEDED') {
        const text = pd.output.results?.[0]?.sentences?.map(s => s.text).join('') || '';
        console.log('[STT] Async result:', text || '(empty)');
        return { text, language: 'zh', confidence: 0.95 };
      }
      if (pd.output?.task_status === 'FAILED') {
        throw new Error(`Qwen task failed: ${JSON.stringify(pd.output).slice(0, 300)}`);
      }
    }
    throw new Error('Qwen poll timeout');
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
