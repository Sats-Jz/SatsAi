import { describe, it, expect, afterEach } from 'vitest';
import { AudioCapture } from './audio';

describe('AudioCapture', () => {
  let capture: AudioCapture;

  afterEach(() => {
    if (capture) capture.stop();
  });

  it('should create an AudioCapture instance', () => {
    capture = new AudioCapture({ sampleRate: 16000, channels: 1, bitDepth: 16 });
    expect(capture).toBeDefined();
    expect(capture.isActive()).toBe(false);
  });

  it('should start and stop capturing', () => {
    capture = new AudioCapture({ sampleRate: 16000, channels: 1, bitDepth: 16 });
    capture.start();
    expect(capture.isActive()).toBe(true);
    capture.stop();
    expect(capture.isActive()).toBe(false);
  });

  it('should get config', () => {
    capture = new AudioCapture({ sampleRate: 44100, channels: 2, bitDepth: 24 });
    const config = capture.getConfig();
    expect(config.sampleRate).toBe(44100);
    expect(config.channels).toBe(2);
    expect(config.bitDepth).toBe(24);
  });
});
