import { EventEmitter } from 'events';
import { DialogStateMachine } from './dialog/stateMachine';
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
import { MCPClientManager } from './mcp/client';
import { MCPToolRegistry } from './mcp/registry';
import { AppStore } from './store';
import type { EngineEvent, DialogState } from './types';

export interface EngineConfig {
  dataDir: string;
  sttApiKey: string;
  sttProvider: 'qwen' | 'openai' | 'groq';
  llmProvider: 'deepseek' | 'openai' | 'qwen' | 'claude';
  llmApiKey: string;
}

export class Engine extends EventEmitter {
  private stateMachine: DialogStateMachine;
  private speakerEnroller: SpeakerEnroller;
  private speakerVerifier: SpeakerVerifier;
  private sttClient: STTClient;
  private ttsClient: TTSClient;
  private llmClient: LLMClient;
  private actionRegistry: ActionRegistry;
  private store: AppStore;
  private mcpManager: MCPClientManager;
  private mcpRegistry: MCPToolRegistry;
  private conversationHistory: Array<{ role: string; content: string }> = [];

  constructor(config: EngineConfig) {
    super();
    const settings = new AppStore(config.dataDir).getSettings();
    this.store = new AppStore(config.dataDir);

    this.stateMachine = new DialogStateMachine((event: EngineEvent) => {
      this.emit('engine-event', event);
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

    // MCP: tool registry shared between LLM tools and client manager
    this.mcpRegistry = new MCPToolRegistry();
    this.mcpManager = new MCPClientManager(this.mcpRegistry);
  }

  /** Triggered by renderer when OpenWakeWord detects the wake word. */
  triggerListening(): void {
    if (this.stateMachine.getState() !== 'idle') return;
    this.stateMachine.onHotwordDetected();
  }

  /**
   * Process recorded audio from the renderer.
   * Audio is already WAV PCM (16kHz mono), base64-encoded.
   * The renderer did wake word + VAD + WebM→WAV conversion.
   */
  async processAudio(wavBase64: string): Promise<void> {
    const audioBuffer = Buffer.from(wavBase64, 'base64');
    await this.handleSpeechEnd(audioBuffer);
  }

  private async handleSpeechEnd(wavBuffer: Buffer): Promise<void> {
    if (wavBuffer.length < 1000) {
      this.stateMachine.onError('语音太短');
      return;
    }

    // Speaker verification — real embedding extraction + cosine comparison
    const enrolledEmb = this.store.getSpeakerEmbedding();
    if (enrolledEmb) {
      const model = this.speakerEnroller.getModel();
      const liveEmb = await model.extractEmbedding(wavBuffer);
      const verifyResult = this.speakerVerifier.verify(enrolledEmb, liveEmb);
      this.emit('engine-event', {
        type: 'verification-result',
        result: verifyResult,
      } as EngineEvent);
      if (!verifyResult.passed) {
        this.stateMachine.onError('声纹验证失败');
        return;
      }
    }

    this.stateMachine.onSpeechEnd(wavBuffer);

    try {
      // STT: audio is already WAV PCM 16kHz mono from renderer
      const sttResult = await this.sttClient.transcribe(wavBuffer);
      this.emit('engine-event', {
        type: 'transcript',
        text: sttResult.text,
      } as EngineEvent);

      // LLM — includes MCP tools if any servers are connected
      const tools = buildLLMTools(this.actionRegistry, this.mcpRegistry);
      this.conversationHistory.push({ role: 'user', content: sttResult.text });

      const llmResponse = await this.llmClient.chat(
        sttResult.text,
        tools,
        this.conversationHistory.slice(-10)
      );

      // Execute tool calls from LLM
      for (const tc of llmResponse.toolCalls) {
        const actionResult = await this.actionRegistry.execute(tc.name, tc.arguments);
        this.emit('engine-event', {
          type: 'action-executed',
          result: actionResult,
        } as EngineEvent);
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

  async start(): Promise<void> {
    console.log('[Engine] Started (audio from renderer)');
    // Connect MCP servers based on user settings
    const s = this.store.getSettings();
    const mcpMap: Record<string, string> = {
      filesystem: 'mcpFilesystem',
      sqlite: 'mcpSqlite',
      github: 'mcpGithub',
    };

    try {
      // Import MCP servers config and enable per user settings
      const { builtinServers } = await import('./mcp/servers');
      for (const server of builtinServers) {
        const key = mcpMap[server.name] as keyof typeof s;
        if (key && s[key as keyof typeof s]) {
          await this.mcpManager.connectServer({ ...server, enabled: true });
        }
      }
      const tools = this.mcpRegistry.listTools();
      if (tools.length > 0) {
        console.log(`[Engine] MCP: ${tools.length} tools from ${tools.filter((_, i, a) => i === a.findIndex(t => t.startsWith(t.split('__')[0]))).length} servers`);
      }
    } catch (err) {
      console.warn('[Engine] MCP init skipped (non-fatal):', (err as Error).message);
    }
  }

  stop(): void {
    this.mcpManager.shutdown().catch(console.error);
    this.store.close();
  }

  getState(): DialogState { return this.stateMachine.getState(); }
  getSpeakerEnroller(): SpeakerEnroller { return this.speakerEnroller; }
  getActionRegistry(): ActionRegistry { return this.actionRegistry; }
  getStore(): AppStore { return this.store; }
  getMCPManager(): MCPClientManager { return this.mcpManager; }
}
