export interface TTSConfig {
  voice?: string;
  rate?: number;
}

export class TTSClient {
  private config: TTSConfig;

  constructor(config: TTSConfig = {}) {
    this.config = { voice: 'zh-CN-XiaoxiaoNeural', rate: 1.0, ...config };
  }

  async synthesize(text: string): Promise<Buffer> {
    const ssml = this.buildSSML(text);
    const url = `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-16khz-32kbitrate-mono-mp3',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      body: ssml,
    });

    if (!response.ok) throw new Error(`TTS API error (${response.status})`);
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  private buildSSML(text: string): string {
    const voice = this.config.voice || 'zh-CN-XiaoxiaoNeural';
    const rate = ((this.config.rate || 1.0) - 1.0) * 100;
    const rateStr = rate >= 0 ? `+${rate}%` : `${rate}%`;

    return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis"
      xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="zh-CN">
      <voice name="${voice}"><prosody rate="${rateStr}">${this.escapeXml(text)}</prosody></voice>
    </speak>`;
  }

  private escapeXml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }
}
