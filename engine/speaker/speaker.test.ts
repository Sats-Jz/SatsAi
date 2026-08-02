import { describe, it, expect, beforeEach } from 'vitest';
import { SpeakerEnroller } from './enroll';
import { SpeakerVerifier } from './verify';
import { MockSpeakerModel } from './model';

describe('SpeakerEnroller', () => {
  let enroller: SpeakerEnroller;

  beforeEach(() => {
    enroller = new SpeakerEnroller(new MockSpeakerModel());
  });

  it('should create enroller with empty phrases', () => {
    expect(enroller.getPhrases()).toHaveLength(0);
    expect(enroller.isComplete()).toBe(false);
  });

  it('should set enrollment phrases', () => {
    const phrases = ['生活不止眼前的苟且', '还有诗和远方的田野', '人工智能改变世界'];
    enroller.setPhrases(phrases);
    expect(enroller.getPhrases()).toHaveLength(3);
    expect(enroller.getProgress()).toBe(0);
  });

  it('should process audio buffers and accumulate embeddings', async () => {
    enroller.setPhrases(['测试短语一', '测试短语二', '测试短语三']);
    const audioBuffer = Buffer.alloc(16000 * 2);
    await enroller.submitAudio(0, audioBuffer);
    expect(enroller.getProgress()).toBe(1);
    await enroller.submitAudio(1, audioBuffer);
    expect(enroller.getProgress()).toBe(2);
    await enroller.submitAudio(2, audioBuffer);
    expect(enroller.getProgress()).toBe(3);
    expect(enroller.isComplete()).toBe(true);
    expect(enroller.getEmbedding()).not.toBeNull();
  });

  it('should throw on invalid phrase index', async () => {
    enroller.setPhrases(['短语一']);
    await expect(enroller.submitAudio(5, Buffer.alloc(100))).rejects.toThrow('Invalid phrase index');
  });

  it('should reset enroller', async () => {
    enroller.setPhrases(['一', '二']);
    await enroller.submitAudio(0, Buffer.alloc(100));
    enroller.reset();
    expect(enroller.getProgress()).toBe(0);
    expect(enroller.isComplete()).toBe(false);
  });
});

describe('SpeakerVerifier', () => {
  it('should verify matching embeddings', () => {
    const verifier = new SpeakerVerifier({ threshold: 0.7 });
    const emb1 = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]);
    const emb2 = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]);
    const result = verifier.verify(emb1, emb2);
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.99);
    expect(result.threshold).toBe(0.7);
  });

  it('should reject dissimilar embeddings', () => {
    const verifier = new SpeakerVerifier({ threshold: 0.7 });
    const emb1 = new Float32Array([1.0, 1.0, 1.0, 1.0, 1.0]);
    const emb2 = new Float32Array([-1.0, -1.0, -1.0, -1.0, -1.0]);
    const result = verifier.verify(emb1, emb2);
    expect(result.passed).toBe(false);
  });

  it('should allow threshold adjustment', () => {
    const verifier = new SpeakerVerifier({ threshold: 0.7 });
    verifier.setThreshold(0.9);
    expect(verifier.getThreshold()).toBe(0.9);
  });
});
