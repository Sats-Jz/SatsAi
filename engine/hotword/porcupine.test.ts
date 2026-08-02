import { describe, it, expect, afterEach } from 'vitest';
import { HotwordDetector } from './porcupine';

describe('HotwordDetector', () => {
  let detector: HotwordDetector;

  afterEach(() => {
    if (detector) detector.stop();
  });

  it('should create a HotwordDetector', () => {
    detector = new HotwordDetector({
      accessKey: 'test-key',
      modelPath: '/path/to/model.pv',
      keywordPaths: ['/path/to/keyword.ppn'],
      sensitivities: [0.5],
    });
    expect(detector).toBeDefined();
    expect(detector.isRunning()).toBe(false);
  });

  it('should start and stop detection', () => {
    detector = new HotwordDetector({
      accessKey: 'test-key',
      modelPath: '/path/to/model.pv',
      keywordPaths: ['/path/to/keyword.ppn'],
      sensitivities: [0.5],
    });
    detector.start();
    expect(detector.isRunning()).toBe(true);
    detector.stop();
    expect(detector.isRunning()).toBe(false);
  });

  it('should emit started and stopped events', () => {
    detector = new HotwordDetector({
      accessKey: 'test-key',
      modelPath: '/path/to/model.pv',
      keywordPaths: ['/path/to/keyword.ppn'],
      sensitivities: [0.5],
    });
    const events: string[] = [];
    detector.on('started', () => events.push('started'));
    detector.on('stopped', () => events.push('stopped'));
    detector.start();
    detector.stop();
    expect(events).toEqual(['started', 'stopped']);
  });

  it('should process frames and return -1 when no match', () => {
    detector = new HotwordDetector({
      accessKey: 'test-key',
      modelPath: '/path/to/model.pv',
      keywordPaths: ['/path/to/keyword.ppn'],
      sensitivities: [0.5],
    });
    detector.start();
    const frame = new Int16Array(512);
    const result = detector.processFrame(frame);
    expect(result).toBe(-1);
  });
});
