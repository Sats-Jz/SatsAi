import type { STTResult } from '../types';

export type STTProvider = 'qwen' | 'openai' | 'groq';

export interface STTConfig {
  provider: STTProvider;
  apiKey: string;
  appkey?: string;
  model?: string;
  language?: string;
}

export class STTClient {
  private config: Required<Pick<STTConfig, 'provider'>> & STTConfig;

  constructor(config: STTConfig) {
    this.config = { provider: 'qwen', model: 'paraformer-v2', language: 'zh', ...config };
  }

  /**
   * Transcribe audio. Accepts ANY format — WebM, WAV, MP3, etc.
   * Qwen: file transcription REST (async submit + poll)
   */
  async transcribe(audio: Buffer): Promise<STTResult> {
    if (this.config.provider === 'qwen') {
      return this.qwenFile(audio);
    }
    return this.httpRaw(audio);
  }

  /** OpenAI / Groq — HTTP multipart */
  private async httpRaw(audio: Buffer): Promise<STTResult> {
    const base = this.config.provider === 'groq' ? 'https://api.groq.com/openai/v1' : 'https://api.openai.com/v1';
    const fd = new FormData();
    fd.append('file', new Blob([new Uint8Array(audio)], { type: 'audio/webm' }), 'audio.webm');
    fd.append('model', this.config.model!);
    const r = await fetch(`${base}/audio/transcriptions`, {
      method: 'POST', headers: { Authorization: `Bearer ${this.config.apiKey}` }, body: fd,
    });
    if (!r.ok) throw new Error(`STT ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const d = (await r.json()) as { text: string };
    return { text: d.text || '', language: 'unknown', confidence: 0.95 };
  }

  /**
   * Qwen DashScope file transcription REST API.
   * Submits a task → polls for result.
   * Supports WebM/Opus input natively (no PCM conversion needed).
   */
  private async qwenFile(audio: Buffer): Promise<STTResult> {
    // Use DashScope file transcription API
    // Upload audio as base64 data URL
    const mime = audio[0] === 0x52 && audio[1] === 0x49 ? 'audio/wav' : 'audio/webm';
    const b64 = audio.toString('base64');
    const dataUrl = `data:${mime};base64,${b64}`;

    console.log('[STT] Qwen file transcription, size:', audio.length, 'mime:', mime);

    // Submit async task
    const submitUrl = 'https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription';
    const submitR = await fetch(submitUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify({
        model: this.config.model,
        input: { file_urls: [dataUrl] },
        parameters: { language_hints: this.config.language ? [this.config.language] : ['zh', 'en'] },
      }),
    });

    if (!submitR.ok) {
      const errText = await submitR.text();
      throw new Error(`Qwen submit ${submitR.status}: ${errText.slice(0, 300)}`);
    }

    const task = (await submitR.json()) as {
      output?: { task_id?: string; task_status?: string };
    };
    const tid = task.output?.task_id;
    if (!tid) throw new Error('Qwen: no task_id. Response: ' + JSON.stringify(task).slice(0, 300));

    console.log('[STT] Task:', tid, 'polling...');

    // Poll for result
    const pollUrl = `https://dashscope.aliyuncs.com/api/v1/tasks/${tid}`;
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const pr = await fetch(pollUrl, {
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
      });
      if (!pr.ok) {
        const errText = await pr.text();
        console.log('[STT] Poll', pr.status, errText.slice(0, 200));
        continue;
      }
      const pd = (await pr.json()) as {
        output?: {
          task_status?: string;
          results?: Array<{ sentences?: Array<{ text: string }> }>;
        };
      };
      const status = pd.output?.task_status;
      if (status === 'SUCCEEDED') {
        const text = pd.output?.results?.[0]?.sentences?.map((s) => s.text).join('') || '';
        console.log('[STT] Result:', text || '(empty)');
        return { text, language: 'zh', confidence: 0.95 };
      }
      if (status === 'FAILED') {
        throw new Error(`Qwen failed: ${JSON.stringify(pd.output).slice(0, 300)}`);
      }
      if (status === 'PENDING' || status === 'RUNNING') {
        if (i % 4 === 0) process.stdout.write('.');
        continue;
      }
    }
    throw new Error('Qwen: polling timeout (30s)');
  }
}
