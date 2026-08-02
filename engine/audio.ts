import { EventEmitter } from 'events';

export interface AudioConfig {
  sampleRate: number;
  channels: number;
  bitDepth: number;
}

export class AudioCapture extends EventEmitter {
  private config: AudioConfig;
  private active = false;

  constructor(config: AudioConfig) {
    super();
    this.config = config;
  }

  isActive(): boolean { return this.active; }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.emit('started');
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    this.emit('stopped');
  }

  getConfig(): AudioConfig {
    return { ...this.config };
  }
}
