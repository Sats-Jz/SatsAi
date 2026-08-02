import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DialogStateMachine } from './stateMachine';
import type { DialogState, EngineEvent } from '../types';

describe('DialogStateMachine', () => {
  let sm: DialogStateMachine;
  let events: EngineEvent[];

  beforeEach(() => {
    events = [];
    sm = new DialogStateMachine((event) => events.push(event));
  });

  it('should start in idle state', () => {
    expect(sm.getState()).toBe('idle');
  });

  it('should transition from idle to listening on hotword', () => {
    sm.onHotwordDetected();
    expect(sm.getState()).toBe('listening');
    expect(events).toContainEqual({ type: 'state-changed', state: 'listening' });
    expect(events).toContainEqual({ type: 'hotword-detected' });
  });

  it('should transition from listening to thinking on speech end', () => {
    sm.onHotwordDetected();
    const audioBuf = Buffer.from('test');
    sm.onSpeechEnd(audioBuf);
    expect(sm.getState()).toBe('thinking');
    expect(events).toContainEqual({ type: 'speech-end', audioBuffer: audioBuf });
  });

  it('should transition from thinking to speaking on response', () => {
    sm.onHotwordDetected();
    sm.onSpeechEnd(Buffer.from('test'));
    sm.onResponse('你好，有什么可以帮助你的？');
    expect(sm.getState()).toBe('speaking');
    expect(events).toContainEqual({ type: 'response', text: '你好，有什么可以帮助你的？' });
  });

  it('should transition from speaking to idle on done', () => {
    sm.onHotwordDetected();
    sm.onSpeechEnd(Buffer.from('test'));
    sm.onResponse('好的');
    sm.onSpeakingDone();
    expect(sm.getState()).toBe('idle');
  });

  it('should ignore hotword when already listening', () => {
    sm.onHotwordDetected();
    sm.onHotwordDetected();
    expect(sm.getState()).toBe('listening');
    // only one hotword-detected event
    expect(events.filter(e => e.type === 'hotword-detected').length).toBe(1);
  });

  it('should transition to idle on timeout (30s idle in listening)', () => {
    sm.onHotwordDetected();
    sm.onTimeout();
    expect(sm.getState()).toBe('idle');
  });

  it('should emit error when transition is invalid', () => {
    // try to send speech end in idle
    sm.onSpeechEnd(Buffer.from('test'));
    expect(events.some(e => e.type === 'error')).toBe(true);
    expect(sm.getState()).toBe('idle');
  });
});
