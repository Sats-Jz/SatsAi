/**
 * End-to-end pipeline test.
 *
 * Tests the real LLM + STT API connectivity using your actual API keys.
 * These tests require the .env file to be set up correctly.
 *
 * Skip with: npx vitest run --grep '(?!E2E)'
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { LLMClient } from './llm/client';
import { createActionRegistry } from './actions/index';
import { appActions } from './actions/app';
import { inputActions } from './actions/input';
import { systemActions } from './actions/system';
import { webActions } from './actions/web';
import { buildLLMTools } from './llm/tools';
import { STTClient } from './stt/client';

// Load .env for test
import { readFileSync } from 'fs';
import { resolve } from 'path';
try {
  const envPath = resolve(__dirname, '../.env');
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^#][^=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  }
} catch {
  // .env not found, tests will check
}

describe('E2E: API Connectivity', () => {
  it('should have DeepSeek API key configured', () => {
    const key = process.env.SATSAI_LLM_API_KEY;
    expect(key).toBeTruthy();
    expect(key).toMatch(/^sk-/);
  });

  it('should have Qwen STT API key configured', () => {
    const key = process.env.SATSAI_STT_API_KEY;
    expect(key).toBeTruthy();
  });
});

describe('E2E: DeepSeek LLM', () => {
  let client: LLMClient;
  const registry = createActionRegistry();

  beforeAll(() => {
    for (const a of [...appActions, ...inputActions, ...systemActions, ...webActions]) {
      registry.register(a);
    }
    client = new LLMClient(
      {
        provider: 'deepseek',
        apiKey: process.env.SATSAI_LLM_API_KEY || '',
        model: 'deepseek-chat',
      },
      registry
    );
  });

  it('should get a text response from DeepSeek', async () => {
    if (!process.env.SATSAI_LLM_API_KEY) {
      console.warn('Skipping: SATSAI_LLM_API_KEY not set');
      return;
    }
    const tools = buildLLMTools(registry);
    const response = await client.chat('你好，请用一句话介绍你自己', tools);
    expect(response.text).toBeTruthy();
    expect(typeof response.text).toBe('string');
    console.log('[E2E] DeepSeek response:', response.text.slice(0, 100));
  }, 15000);

  it('should handle tool calling with function', async () => {
    if (!process.env.SATSAI_LLM_API_KEY) {
      console.warn('Skipping: SATSAI_LLM_API_KEY not set');
      return;
    }
    const tools = buildLLMTools(registry);
    const response = await client.chat('帮我搜索一下今天的天气', tools);
    expect(response.text || response.toolCalls.length > 0).toBeTruthy();
    if (response.toolCalls.length > 0) {
      console.log('[E2E] Tool calls:', response.toolCalls.map(t => t.name));
    }
  }, 15000);
});

describe('E2E: Qwen STT', () => {
  let sttClient: STTClient;

  beforeAll(() => {
    sttClient = new STTClient({
      provider: 'qwen',
      apiKey: process.env.SATSAI_STT_API_KEY || '',
    });
  });

  it('should transcribe a WAV audio file', async () => {
    if (!process.env.SATSAI_STT_API_KEY) {
      console.warn('Skipping: SATSAI_STT_API_KEY not set');
      return;
    }

    // Generate a minimal WAV: 1 second of 1kHz sine at 16kHz mono
    // NOTE: ASR won't recognize sine tones — this test only validates
    // API connectivity and protocol correctness. Real speech audio works.
    const sampleRate = 16000;
    const numSamples = sampleRate;
    const wavBuffer = STTClient.pcmToWav(
      generateSineTone(1000, sampleRate, numSamples)
    );

    try {
      const result = await sttClient.transcribe(wavBuffer);
      console.log('[E2E] STT result:', JSON.stringify(result));
      // Real speech would return text; sine tone may fail
      expect(result).toHaveProperty('confidence');
    } catch (err) {
      // NO_VALID_AUDIO_ERROR is expected for sine tones
      const msg = (err as Error).message;
      if (msg.includes('NO_VALID_AUDIO')) {
        console.log('[E2E] Sine tone correctly rejected — WebSocket protocol OK');
        return; // Pass: protocol works, just not speech
      }
      throw err;
    }
  }, 15000);
});

/** Generate a pure sine tone as 16-bit PCM buffer */
function generateSineTone(
  freq: number,
  sampleRate: number,
  numSamples: number
): Buffer {
  const buffer = Buffer.alloc(numSamples * 2);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * freq * t) * 0.5 * 32767;
    buffer.writeInt16LE(Math.round(sample), i * 2);
  }
  return buffer;
}
