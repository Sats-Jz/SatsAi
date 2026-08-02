import type { DialogState, EngineEvent } from '../types';

export type EventCallback = (event: EngineEvent) => void;

const VALID_TRANSITIONS: Record<DialogState, Partial<Record<string, DialogState>>> = {
  idle: {
    hotword: 'listening',
    startListening: 'listening',
  },
  listening: {
    speechEnd: 'thinking',
    timeout: 'idle',
    stopListening: 'idle',
  },
  thinking: {
    response: 'speaking',
    error: 'idle',
  },
  speaking: {
    done: 'idle',
    stopSpeaking: 'idle',
  },
};

export class DialogStateMachine {
  private state: DialogState = 'idle';
  private emit: EventCallback;

  constructor(emit: EventCallback) {
    this.emit = emit;
  }

  getState(): DialogState {
    return this.state;
  }

  private transition(trigger: string, nextState: DialogState): boolean {
    const allowed = VALID_TRANSITIONS[this.state]?.[trigger];
    if (allowed !== nextState) {
      this.emit({ type: 'error', message: `Invalid transition: ${this.state} -> ${trigger} -> ${nextState}` });
      return false;
    }
    this.state = nextState;
    this.emit({ type: 'state-changed', state: nextState });
    return true;
  }

  onHotwordDetected(): void {
    if (!this.transition('hotword', 'listening')) return;
    this.emit({ type: 'hotword-detected' });
  }

  onStartListening(): void {
    this.transition('startListening', 'listening');
  }

  onSpeechEnd(audioBuffer: Buffer): void {
    if (!this.transition('speechEnd', 'thinking')) return;
    this.emit({ type: 'speech-end', audioBuffer });
  }

  onResponse(text: string): void {
    if (!this.transition('response', 'speaking')) return;
    this.emit({ type: 'response', text });
  }

  onSpeakingDone(): void {
    this.transition('done', 'idle');
  }

  onTimeout(): void {
    this.transition('timeout', 'idle');
  }

  onError(message: string): void {
    this.state = 'idle';
    this.emit({ type: 'error', message });
    this.emit({ type: 'state-changed', state: 'idle' });
  }
}
