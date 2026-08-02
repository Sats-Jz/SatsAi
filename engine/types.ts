/** 对话状态 */
export type DialogState = 'idle' | 'listening' | 'thinking' | 'speaking';

/** 声纹录入状态 */
export interface EnrollmentStatus {
  enrolled: boolean;
  enrolledAt: string | null;
  phraseCount: number;
}

/** 声纹验证结果 */
export interface VerificationResult {
  passed: boolean;
  score: number;
  threshold: number;
}

/** 语音识别结果 */
export interface STTResult {
  text: string;
  language: string;
  confidence: number;
}

/** LLM 响应 */
export interface LLMResponse {
  text: string;
  toolCalls: ToolCall[];
}

/** LLM Function Call */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** 动作执行结果 */
export interface ActionResult {
  success: boolean;
  message: string;
  data?: unknown;
}

/** 引擎事件总线事件类型 */
export type EngineEvent =
  | { type: 'state-changed'; state: DialogState }
  | { type: 'hotword-detected' }
  | { type: 'speech-start' }
  | { type: 'speech-end'; audioBuffer: Buffer }
  | { type: 'verification-result'; result: VerificationResult }
  | { type: 'transcript'; text: string }
  | { type: 'response'; text: string }
  | { type: 'action-executed'; result: ActionResult }
  | { type: 'error'; message: string };
