import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const DEFAULT_SETTINGS = {
  hotword: 'hey sats',
  hotwordSensitivity: 0.5,
  speakerThreshold: 0.7,
  language: 'auto' as const,
  ttsVoice: 'zh-CN-XiaoxiaoNeural',
  ttsRate: 1.0,
  llmProvider: 'deepseek' as const,
  llmApiKey: '',
  llmModel: 'deepseek-chat',
  sttProvider: 'qwen' as const,
  autoStart: false,
  mcpFilesystem: false,
  mcpSqlite: false,
  mcpGithub: false,
};

const ENCRYPTION_KEY = 'satsai-local-store-key-v1';
const IV_LENGTH = 16;

/** Pure-JS key-value store using encrypted JSON files. No native modules. */
export class AppStore {
  private dataDir: string;
  private cache: Record<string, string> = {};

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    fs.mkdirSync(dataDir, { recursive: true });
    this.load();
  }

  private filePath(): string {
    return path.join(this.dataDir, 'satsai.json');
  }

  private load(): void {
    try {
      const raw = fs.readFileSync(this.filePath(), 'utf-8');
      const encrypted = JSON.parse(raw);
      for (const [key, value] of Object.entries(encrypted)) {
        this.cache[key] = this.decrypt(value as string);
      }
    } catch {
      // File doesn't exist or can't be read — use empty cache
    }
  }

  private save(): void {
    const encrypted: Record<string, string> = {};
    for (const [key, value] of Object.entries(this.cache)) {
      encrypted[key] = this.encrypt(value);
    }
    fs.writeFileSync(this.filePath(), JSON.stringify(encrypted), 'utf-8');
  }

  private encrypt(data: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(
      'aes-256-cbc',
      Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)),
      iv
    );
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  private decrypt(data: string): string {
    const parts = data.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)),
      iv
    );
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  private get(key: string): string | null {
    return this.cache[key] || null;
  }

  private set(key: string, value: string): void {
    this.cache[key] = value;
    this.save();
  }

  private remove(key: string): void {
    delete this.cache[key];
    this.save();
  }

  getSettings() {
    const raw = this.get('settings');
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  }

  saveSettings(partial: Record<string, unknown>): void {
    const current = this.getSettings();
    const merged = { ...current, ...partial };
    this.set('settings', JSON.stringify(merged));
  }

  saveSpeakerEmbedding(embedding: Float32Array): void {
    this.set('speaker_embedding', JSON.stringify(Array.from(embedding)));
  }

  getSpeakerEmbedding(): Float32Array | null {
    const raw = this.get('speaker_embedding');
    if (!raw) return null;
    return new Float32Array(JSON.parse(raw));
  }

  deleteSpeakerEmbedding(): void {
    this.remove('speaker_embedding');
  }

  getEnrollmentStatus() {
    const raw = this.get('enrollment_status');
    if (!raw) return { enrolled: false, enrolledAt: null, phraseCount: 0 };
    return JSON.parse(raw);
  }

  setEnrollmentStatus(status: { enrolled: boolean; enrolledAt: string | null; phraseCount: number }): void {
    this.set('enrollment_status', JSON.stringify(status));
  }

  close(): void {
    // No-op for JSON store — data is saved on every write
  }
}
