/** 对话状态机状态 */
export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

/** 引擎状态（从主进程同步到渲染进程） */
export interface EngineStatus {
  state: VoiceState;
  transcript: string;
  response: string;
  error: string | null;
}

/** 设置数据结构 */
export interface AppSettings {
  hotword: string;
  hotwordSensitivity: number;
  speakerThreshold: number;
  language: 'zh-CN' | 'en-US' | 'auto';
  ttsVoice: string;
  ttsRate: number;
  llmProvider: 'claude' | 'openai';
  llmApiKey: string;
  llmModel: string;
  autoStart: boolean;
}

/** 声纹录入阶段 */
export type EnrollmentPhase = 'idle' | 'prompt' | 'recording' | 'processing' | 'done';

/** 声纹录入单个短语 */
export interface EnrollmentPrompt {
  index: number;
  text: string;
  status: 'pending' | 'recording' | 'done';
}

/** IPC 通道名 */
export const IPC_CHANNELS = {
  GET_STATUS: 'engine:get-status',
  STATUS_UPDATE: 'engine:status-update',
  START_LISTENING: 'engine:start-listening',
  STOP_LISTENING: 'engine:stop-listening',
  GET_SETTINGS: 'settings:get',
  SAVE_SETTINGS: 'settings:save',
  START_ENROLLMENT: 'speaker:start-enrollment',
  ENROLLMENT_PROMPT: 'speaker:enrollment-prompt',
  SUBMIT_ENROLLMENT_AUDIO: 'speaker:submit-enrollment-audio',
  GET_ENROLLMENT_STATUS: 'speaker:get-enrollment-status',
  DELETE_ENROLLMENT: 'speaker:delete-enrollment',
  EXECUTE_ACTION: 'action:execute',
} as const;
