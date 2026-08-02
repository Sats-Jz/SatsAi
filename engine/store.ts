import Database from 'better-sqlite3';
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

export class AppStore {
  private db: Database.Database;
  private dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    fs.mkdirSync(dataDir, { recursive: true });
    const dbPath = path.join(dataDir, 'satsai.db');
    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
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
    const row = this.db.prepare('SELECT value FROM kv_store WHERE key = ?').get(key) as { value: string } | undefined;
    return row ? this.decrypt(row.value) : null;
  }

  private set(key: string, value: string): void {
    const encrypted = this.encrypt(value);
    this.db.prepare('INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)').run(key, encrypted);
  }

  private remove(key: string): void {
    this.db.prepare('DELETE FROM kv_store WHERE key = ?').run(key);
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
    this.db.close();
  }
}
