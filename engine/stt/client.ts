import type { STTResult } from '../types';

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
  qwen: { baseUrl: 'https://dashscope.aliyuncs.com/api/v1', defaultModel: 'paraformer-v2' },
};

export class STTClient {
  private config: STTConfig & { baseUrl: string };

  constructor(config: STTConfig) {
    const pc = CONFIG[config.provider];
    this.config = { ...config, model: config.model || pc.defaultModel, baseUrl: pc.baseUrl };
  }

  async transcribe(pcmBuffer: Buffer): Promise<STTResult> {
    if (this.config.provider === 'qwen') {
      return this.transcribeQwen(pcmBuffer);
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

  /** Qwen DashScope async file transcription: upload WAV → submit task → poll */
  private async transcribeQwen(pcm: Buffer): Promise<STTResult> {
    // Write WAV to temp file and use data URL
    const wav = STTClient.pcmToWav(pcm);
    // Use compatible-mode HTTP endpoint which handles WAV uploads
    try {
      const fd = new FormData();
      fd.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'audio.wav');
      fd.append('model', 'paraformer-v2');
      const r = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/audio/transcriptions', {
        method: 'POST', headers: { Authorization: `Bearer ${this.config.apiKey}` }, body: fd,
      });
      if (r.ok) {
        const d = (await r.json()) as { text: string };
        return { text: d.text || '', language: 'zh', confidence: 0.95 };
      }
      console.log('[STT] Compatible-mode failed:', r.status, await r.text().then(t => t.slice(0, 200)));
    } catch (e) {
      console.log('[STT] Compatible-mode exception:', (e as Error).message);
    }

    // Fallback: DashScope native async API with data URL
    const b64 = wav.toString('base64');
    const dataUrl = `data:audio/wav;base64,${b64}`;

    const submitR = await fetch(`${this.config.baseUrl}/services/audio/asr/transcription`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify({
        model: this.config.model,
        input: { file_urls: [dataUrl] },
        parameters: { language_hints: this.config.language ? [this.config.language] : undefined },
      }),
    });

    if (!submitR.ok) {
      const err = await submitR.text();
      throw new Error(`Qwen submit failed (${submitR.status}): ${err.slice(0, 300)}`);
    }

    const task = (await submitR.json()) as { output?: { task_id?: string }; request_id?: string };
    const tid = task.output?.task_id;
    console.log('[STT] Qwen task submitted:', tid);

    // Poll
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const pr = await fetch(`${this.config.baseUrl}/tasks/${tid}`, {
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
      });
      const pd = (await pr.json()) as {
        output?: { task_status?: string; results?: Array<{ sentences?: Array<{ text: string }> }> };
      };
      const status = pd.output?.task_status;
      if (status === 'SUCCEEDED') {
        const text = pd.output?.results?.[0]?.sentences?.map(s => s.text).join('') || '';
        return { text, language: 'zh', confidence: 0.95 };
      }
      if (status === 'FAILED') {
        throw new Error(`Qwen task FAILED: ${JSON.stringify(pd.output).slice(0, 300)}`);
      }
    }
    throw new Error('Qwen: polling timeout (30s)');
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
