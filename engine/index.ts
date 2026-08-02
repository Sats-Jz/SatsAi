import { EventEmitter } from 'events';
import { DialogStateMachine } from './dialog/stateMachine';
import { AudioCapture } from './audio';
import { VADDetector } from './vad/silero';
import { HotwordDetector } from './hotword/porcupine';
import { SpeakerEnroller } from './speaker/enroll';
import { SpeakerVerifier } from './speaker/verify';
import { STTClient } from './stt/client';
import { TTSClient } from './tts/client';
import { LLMClient } from './llm/client';
import { buildLLMTools } from './llm/tools';
import { ActionRegistry, createActionRegistry } from './actions/index';
import { appActions } from './actions/app';
import { inputActions } from './actions/input';
import { systemActions } from './actions/system';
import { webActions } from './actions/web';
import { AppStore } from './store';
import type { EngineEvent, DialogState } from './types';

export interface EngineConfig {
  dataDir: string;
  sttApiKey: string;
  sttProvider: 'qwen' | 'openai';
  llmProvider: 'deepseek' | 'openai' | 'qwen' | 'claude';
  llmApiKey: string;
  hotwordModelDir: string;
}

export class Engine extends EventEmitter {
  private stateMachine: DialogStateMachine;
  private audioCapture: AudioCapture;
  private vad: VADDetector;
  private hotword: HotwordDetector;
  private speakerEnroller: SpeakerEnroller;
  private speakerVerifier: SpeakerVerifier;
  private sttClient: STTClient;
  private ttsClient: TTSClient;
  private llmClient: LLMClient;
  private actionRegistry: ActionRegistry;
  private store: AppStore;
  private config: EngineConfig;
  private currentAudioChunks: Buffer[] = [];
  private conversationHistory: Array<{ role: string; content: string }> = [];

  constructor(config: EngineConfig) {
    super();
    this.config = config;

    this.store = new AppStore(config.dataDir);
    const settings = this.store.getSettings();

    this.stateMachine = new DialogStateMachine((event: EngineEvent) => {
      this.emit('engine-event', event);
    });

    this.audioCapture = new AudioCapture({ sampleRate: 16000, channels: 1, bitDepth: 16 });

    this.vad = new VADDetector({
      sampleRate: 16000,
      silenceThreshold: 0.3,
      silenceDurationMs: 800,
      speechDurationMs: 200,
    });

    this.hotword = new HotwordDetector({
      accessKey: '',
      modelPath: config.hotwordModelDir + '/porcupine_params.pv',
      keywordPaths: [config.hotwordModelDir + '/hey-sats_win.ppn'],
      sensitivities: [settings.hotwordSensitivity],
    });

    this.speakerEnroller = new SpeakerEnroller();
    this.speakerVerifier = new SpeakerVerifier({ threshold: settings.speakerThreshold });

    this.sttClient = new STTClient({
      provider: config.sttProvider,
      apiKey: config.sttApiKey,
    });
    this.ttsClient = new TTSClient({ voice: settings.ttsVoice, rate: settings.ttsRate });

    this.actionRegistry = createActionRegistry();
    for (const action of [...appActions, ...inputActions, ...systemActions, ...webActions]) {
      this.actionRegistry.register(action);
    }

    this.llmClient = new LLMClient(
      { provider: config.llmProvider, apiKey: config.llmApiKey },
      this.actionRegistry
    );
  }

  async start(): Promise<void> {
    this.audioCapture.on('data', (chunk: Buffer) => {
      this.currentAudioChunks.push(chunk);
      this.vad.process(chunk);
    });

    this.vad.on('speech-start', () => {
      this.currentAudioChunks = [];
    });

    this.vad.on('speech-end', async () => {
      const audioBuffer = Buffer.concat(this.currentAudioChunks);
      await this.handleSpeechEnd(audioBuffer);
    });

    this.audioCapture.start();
    this.hotword.start();
    console.log('[Engine] Started');
  }

  private async handleSpeechEnd(audioBuffer: Buffer): Promise<void> {
    // Verify speaker
    const enrolled = this.store.getSpeakerEmbedding();
    if (enrolled) {
      const verified = this.speakerVerifier.verify(enrolled, enrolled);
      this.emit('engine-event', { type: 'verification-result', result: verified } as EngineEvent);
      if (!verified.passed) {
        this.stateMachine.onError('声纹验证失败');
        return;
      }
    }

    this.stateMachine.onSpeechEnd(audioBuffer);

    // Transcribe via STT
    try {
      const result = await this.sttClient.transcribe(audioBuffer);
      this.emit('engine-event', { type: 'transcript', text: result.text } as EngineEvent);

      // Send to LLM
      const tools = buildLLMTools(this.actionRegistry);
      this.conversationHistory.push({ role: 'user', content: result.text });

      const llmResponse = await this.llmClient.chat(result.text, tools, this.conversationHistory.slice(-10));

      // Execute tool calls
      for (const tc of llmResponse.toolCalls) {
        const actionResult = await this.actionRegistry.execute(tc.name, tc.arguments);
        this.emit('engine-event', { type: 'action-executed', result: actionResult } as EngineEvent);
      }

      this.stateMachine.onResponse(llmResponse.text);
      this.conversationHistory.push({ role: 'assistant', content: llmResponse.text });

      // TTS
      try {
        const audioResponse = await this.ttsClient.synthesize(llmResponse.text);
        this.emit('tts-audio', audioResponse);
      } catch (ttsErr) {
        console.error('TTS error:', ttsErr);
      }
    } catch (err) {
      console.error('Pipeline error:', err);
      this.stateMachine.onError(`处理出错: ${(err as Error).message}`);
    }
  }

  stop(): void {
    this.audioCapture.stop();
    this.hotword.stop();
    this.store.close();
  }

  getState(): DialogState { return this.stateMachine.getState(); }
  getSpeakerEnroller(): SpeakerEnroller { return this.speakerEnroller; }
  getActionRegistry(): ActionRegistry { return this.actionRegistry; }
  getStore(): AppStore { return this.store; }
}
