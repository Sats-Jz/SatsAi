import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AppStore } from './store';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('AppStore', () => {
  const baseDir = path.join(os.tmpdir(), 'satsai-test-' + Date.now());
  let testDir: string;
  let store: AppStore;

  beforeEach(() => {
    testDir = path.join(baseDir, 'test-' + Math.random().toString(36).slice(2));
    fs.mkdirSync(testDir, { recursive: true });
    store = new AppStore(testDir);
  });

  afterEach(() => {
    store.close();
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Windows may still have the file locked briefly; ignore cleanup errors
    }
  });

  it('should return default settings when no settings saved', () => {
    const settings = store.getSettings();
    expect(settings.hotword).toBe('hey sats');
    expect(settings.language).toBe('auto');
    expect(settings.speakerThreshold).toBe(0.7);
  });

  it('should save and load settings', () => {
    store.saveSettings({ hotword: 'hello assistant', speakerThreshold: 0.8 });
    const settings = store.getSettings();
    expect(settings.hotword).toBe('hello assistant');
    expect(settings.speakerThreshold).toBe(0.8);
    // other fields should retain defaults
    expect(settings.language).toBe('auto');
  });

  it('should save and load speaker embedding', () => {
    const embedding = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]);
    store.saveSpeakerEmbedding(embedding);
    const loaded = store.getSpeakerEmbedding();
    expect(loaded).not.toBeNull();
    expect(Array.from(loaded!)).toEqual(Array.from(embedding));
  });

  it('should return null when no speaker embedding exists', () => {
    expect(store.getSpeakerEmbedding()).toBeNull();
  });

  it('should delete speaker embedding', () => {
    store.saveSpeakerEmbedding(new Float32Array([0.1, 0.2]));
    store.deleteSpeakerEmbedding();
    expect(store.getSpeakerEmbedding()).toBeNull();
  });

  it('should get and set enrollment status', () => {
    expect(store.getEnrollmentStatus().enrolled).toBe(false);
    store.setEnrollmentStatus({ enrolled: true, enrolledAt: '2026-08-02', phraseCount: 5 });
    expect(store.getEnrollmentStatus().enrolled).toBe(true);
    expect(store.getEnrollmentStatus().phraseCount).toBe(5);
  });
});
