import { EventEmitter } from 'events';

export interface VADConfig {
  sampleRate: number;
  silenceThreshold: number;
  silenceDurationMs: number;
  speechDurationMs: number;
}

export class VADDetector extends EventEmitter {
  private config: VADConfig;
  private speaking = false;
  private silenceFrames = 0;
  private speechFrames = 0;
  private readonly frameSize: number;

  constructor(config: VADConfig) {
    super();
    this.config = config;
    this.frameSize = Math.floor(config.sampleRate * 0.03) * 2;
  }

  isSpeaking(): boolean { return this.speaking; }

  process(buffer: Buffer): void {
    let offset = 0;
    while (offset + this.frameSize <= buffer.length) {
      const frame = buffer.subarray(offset, offset + this.frameSize);
      this.processFrame(frame);
      offset += this.frameSize;
    }
  }

  private processFrame(frame: Buffer): void {
    const rms = this.calculateRMS(frame);
    if (rms > this.config.silenceThreshold) {
      this.speechFrames++;
      this.silenceFrames = 0;
      const speechFrameThreshold = Math.floor(this.config.speechDurationMs / 30);
      if (!this.speaking && this.speechFrames >= speechFrameThreshold) {
        this.speaking = true;
        this.emit('speech-start');
      }
    } else {
      this.silenceFrames++;
      this.speechFrames = 0;
      const silenceFrameThreshold = Math.floor(this.config.silenceDurationMs / 30);
      if (this.speaking && this.silenceFrames >= silenceFrameThreshold) {
        this.speaking = false;
        this.emit('speech-end');
      }
    }
  }

  private calculateRMS(buffer: Buffer): number {
    let sum = 0;
    for (let i = 0; i < buffer.length; i += 2) {
      const sample = buffer.readInt16LE(i) / 32768;
      sum += sample * sample;
    }
    return Math.sqrt(sum / (buffer.length / 2));
  }

  reset(): void {
    this.speaking = false;
    this.silenceFrames = 0;
    this.speechFrames = 0;
  }
}
