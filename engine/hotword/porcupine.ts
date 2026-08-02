import { EventEmitter } from 'events';

export interface HotwordConfig {
  accessKey: string;
  modelPath: string;
  keywordPaths: string[];
  sensitivities: number[];
}

export class HotwordDetector extends EventEmitter {
  private config: HotwordConfig;
  private running = false;

  constructor(config: HotwordConfig) {
    super();
    this.config = config;
  }

  isRunning(): boolean { return this.running; }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.emit('started');
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.emit('stopped');
  }

  processFrame(_pcmFrame: Int16Array): number {
    return -1; // No detection in stub
  }
}
