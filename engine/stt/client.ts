/**
 * Qwen Real-time Speech Recognition via Aliyun NLS SDK.
 * npm: alibabacloud-nls | docs: https://help.aliyun.com/zh/isi/developer-reference/sdk-for-node-js
 *
 * Requirements: appkey (from NLS console) + token (your DashScope API key works)
 */
import type { STTResult } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Nls: any = null;

export type STTProvider = 'qwen' | 'openai' | 'groq';

export interface STTConfig {
  provider: STTProvider;
  apiKey: string;    // DashScope API key (used as token)
  appkey: string;    // NLS project appkey
  model?: string;
  language?: string;
}

// Singleton: one WebSocket connection reused
let cachedAppkey = '';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedClient: any = null;

export class STTClient {
  private config: STTConfig;

  constructor(config: STTConfig) {
    this.config = { language: 'zh', ...config };
  }

  async transcribe(pcm: Buffer): Promise<STTResult> {
    if (this.config.provider !== 'qwen') {
      return this.transcribeHTTP(pcm);
    }
    return this.transcribeNLS(pcm);
  }

  /** OpenAI / Groq — HTTP multipart */
  private async transcribeHTTP(pcm: Buffer): Promise<STTResult> {
    const wav = STTClient.pcm2wav(pcm);
    const fd = new FormData();
    fd.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'audio.wav');
    fd.append('model', this.config.model || 'whisper-1');
    const base = this.config.provider === 'groq' ? 'https://api.groq.com/openai/v1' : 'https://api.openai.com/v1';
    const r = await fetch(`${base}/audio/transcriptions`, {
      method: 'POST', headers: { Authorization: `Bearer ${this.config.apiKey}` }, body: fd,
    });
    if (!r.ok) throw new Error(`STT ${r.status}`);
    const d = (await r.json()) as { text: string };
    return { text: d.text || '', language: 'unknown', confidence: 0.95 };
  }

  /**
   * Aliyun NLS real-time speech recognition.
   * AppKey from NLS console project + token (your DashScope API Key).
   */
  private transcribeNLS(pcm: Buffer): Promise<STTResult> {
    return new Promise(async (resolve, reject) => {
      try {
        if (!Nls) {
          Nls = require('alibabacloud-nls');
        }

        // Reuse cached client for same appkey
        if (cachedAppkey !== this.config.appkey) {
          cachedAppkey = this.config.appkey;
          cachedClient = null;
        }

        if (!cachedClient) {
          cachedClient = new Nls.SpeechTranscription({
            url: 'wss://nls-gateway.cn-shanghai.aliyuncs.com/ws/v1',
            appkey: this.config.appkey,
            token: this.config.apiKey,  // DashScope API key works as token
          });
        }

        const client = cachedClient;
        const texts: string[] = [];

        client.on('changed', (msg: unknown) => {
          const m = msg as { payload?: { result?: string } };
          const t = m.payload?.result || '';
          if (t) texts.push(t);
          console.log('[STT] Partial:', t);
        });

        client.on('completed', (msg: unknown) => {
          console.log('[STT] Completed:', JSON.stringify(msg).slice(0, 200));
        });

        client.on('failed', (msg: unknown) => {
          const err = new Error(`NLS failed: ${JSON.stringify(msg).slice(0, 300)}`);
          reject(err);
        });

        client.on('closed', () => {
          console.log('[STT] Connection closed');
        });

        // Start recognition
        await client.start(client.defaultStartParams(), true, 6000);
        console.log('[STT] NLS started, sending', pcm.length, 'bytes of PCM');

        // Send audio in small chunks
        const chunkSize = 3200;
        for (let i = 0; i < pcm.length; i += chunkSize) {
          const chunk = pcm.subarray(i, Math.min(i + chunkSize, pcm.length));
          if (!client.sendAudio(chunk)) {
            reject(new Error('sendAudio failed'));
            return;
          }
          // Small delay to avoid flooding
          await new Promise((r) => setTimeout(r, 20));
        }

        // Close to get final result
        console.log('[STT] Closing NLS connection...');
        await client.close();

        const finalText = texts.join('');
        console.log('[STT] Final text:', finalText || '(empty)');
        resolve({ text: finalText, language: 'zh', confidence: 0.95 });
      } catch (err) {
        reject(err);
      }
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
