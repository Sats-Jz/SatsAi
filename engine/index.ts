import { EventEmitter } from 'events';
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

const emit = Symbol('emitState');

export class Engine extends EventEmitter {
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
  private state: DialogState = 'idle';
  private busy = false;

  constructor(config: EngineConfig) {
    super();
    const settings = new AppStore(config.dataDir).getSettings();
    this.store = new AppStore(config.dataDir);

    this.speakerEnroller = new SpeakerEnroller();
    this.speakerVerifier = new SpeakerVerifier({ threshold: settings.speakerThreshold });

    this.sttClient = new STTClient({ provider: config.sttProvider, apiKey: config.sttApiKey });
    this.ttsClient = new TTSClient({ voice: settings.ttsVoice, rate: settings.ttsRate });

    this.actionRegistry = createActionRegistry();
    for (const a of [...appActions, ...inputActions, ...systemActions, ...webActions]) {
      this.actionRegistry.register(a);
    }

    this.llmClient = new LLMClient(
      { provider: config.llmProvider, apiKey: config.llmApiKey },
      this.actionRegistry
    );

    this.mcpRegistry = new MCPToolRegistry();
    this.mcpManager = new MCPClientManager(this.mcpRegistry);
  }

  private [emit](type: string, payload: Record<string, unknown> = {}) {
    this.emit('engine-event', { type, ...payload } as EngineEvent);
  }

  private setState(s: DialogState) {
    this.state = s;
    this[emit]('state-changed', { state: s });
  }

  getState(): DialogState { return this.state; }

  /** Triggered when the user double-clicks or uses tray wake */
  triggerListening(): void {
    if (this.busy) return;
    if (this.state !== 'idle') return;
    this.setState('listening');
  }

  /** Process raw PCM audio from renderer */
  async processAudio(rawBuffer: Buffer | ArrayBuffer): Promise<void> {
    if (this.busy) { console.log('[Engine] Busy'); return; }
    this.busy = true;

    try {
      const pcm = Buffer.isBuffer(rawBuffer) ? rawBuffer : Buffer.from(rawBuffer);
      console.log('[Engine] Audio:', pcm.length, 'bytes');
      if (pcm.length < 500) { this[emit]('error', { message: '语音太短' }); this.setState('idle'); return; }

      this.setState('thinking');

      // STT
      console.log('[Engine] → STT...');
      const stt = await this.sttClient.transcribe(pcm);
      console.log('[Engine] STT:', stt.text);
      if (!stt.text.trim()) { this[emit]('error', { message: '没有识别到语音' }); this.setState('idle'); return; }
      this[emit]('transcript', { text: stt.text });

      // LLM
      console.log('[Engine] → LLM...');
      const tools = buildLLMTools(this.actionRegistry, this.mcpRegistry);
      this.conversationHistory.push({ role: 'user', content: stt.text });
      const llm = await this.llmClient.chat(stt.text, tools, this.conversationHistory.slice(-10));
      console.log('[Engine] LLM:', llm.text, '| tools:', llm.toolCalls.length);

      for (const tc of llm.toolCalls) {
        console.log('[Engine] Execute:', tc.name, tc.arguments);
        const r = await this.actionRegistry.execute(tc.name, tc.arguments);
        this[emit]('action-executed', { result: r });
        console.log('[Engine] Result:', r.message);
      }

      this.setState('speaking');
      this[emit]('response', { text: llm.text });
      this.conversationHistory.push({ role: 'assistant', content: llm.text });

      try { const audio = await this.ttsClient.synthesize(llm.text); this.emit('tts-audio', audio); }
      catch (e) { console.error('TTS:', e); }

      this.setState('idle');
    } catch (err) {
      const msg = (err as Error).message;
      console.error('[Engine] Error:', msg);
      this[emit]('error', { message: msg });
      this[emit]('response', { text: `出错了: ${msg}` });
      this.setState('idle');
    } finally { this.busy = false; }
  }

  async start(): Promise<void> {
    console.log('[Engine] Started');

    const s = this.store.getSettings();
    const mcpMap: Record<string, string> = { filesystem: 'mcpFilesystem', sqlite: 'mcpSqlite', github: 'mcpGithub' };
    try {
      const { builtinServers } = await import('./mcp/servers');
      for (const server of builtinServers) {
        const key = mcpMap[server.name] as keyof typeof s;
        if (key && s[key as keyof typeof s]) {
          await this.mcpManager.connectServer({ ...server, enabled: true });
        }
      }
    } catch (e) { /* non-fatal */ }
  }

  stop(): void {
    this.mcpManager.shutdown().catch(() => {});
    this.store.close();
  }

  getSpeakerEnroller(): SpeakerEnroller { return this.speakerEnroller; }
  getActionRegistry(): ActionRegistry { return this.actionRegistry; }
  getStore(): AppStore { return this.store; }
  getMCPManager(): MCPClientManager { return this.mcpManager; }
}
