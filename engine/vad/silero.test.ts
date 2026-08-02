import { describe, it, expect, beforeEach } from 'vitest';
import { VADDetector } from './silero';

describe('VADDetector', () => {
  let vad: VADDetector;

  beforeEach(() => {
    vad = new VADDetector({
      sampleRate: 16000,
      silenceThreshold: 0.3,
      silenceDurationMs: 800,
      speechDurationMs: 200,
    });
  });

  it('should start in inactive state', () => {
    expect(vad.isSpeaking()).toBe(false);
  });

  it('should detect silence in zero-filled buffer', () => {
    const silentBuffer = Buffer.alloc(3200);
    vad.process(silentBuffer);
    expect(vad.isSpeaking()).toBe(false);
  });

  it('should reset to inactive state', () => {
    vad.reset();
    expect(vad.isSpeaking()).toBe(false);
  });

  it('should emit speech-start and speech-end events', () => new Promise<void>((done) => {
    let started = false;
    let ended = false;

    vad.on('speech-start', () => { started = true; });
    vad.on('speech-end', () => {
      ended = true;
      expect(started).toBe(true);
      done();
    });

    const loudBuffer = Buffer.alloc(3200);
    for (let i = 0; i < loudBuffer.length; i += 2) {
      loudBuffer.writeInt16LE(15000, i);
    }
    const silentBuffer = Buffer.alloc(3200);

    for (let i = 0; i < 10; i++) vad.process(loudBuffer);
    for (let i = 0; i < 30; i++) vad.process(silentBuffer);
  }));
});
