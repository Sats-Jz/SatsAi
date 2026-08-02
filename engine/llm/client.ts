import type { LLMToolDefinition } from '../actions/index';
import type { ActionRegistry } from '../actions/index';
import type { LLMResponse, ToolCall } from '../types';

export interface LLMConfig {
  provider: 'claude' | 'openai' | 'deepseek' | 'qwen';
  apiKey: string;
  model?: string;
  baseUrl?: string;
  maxTokens?: number;
}

const DEFAULT_MODELS: Record<string, string> = {
  claude: 'claude-sonnet-5-20251001',
  openai: 'gpt-4o',
  deepseek: 'deepseek-chat',
  qwen: 'qwen-plus',
};

const DEFAULT_BASE_URLS: Record<string, string> = {
  claude: 'https://api.anthropic.com/v1/messages',
  openai: 'https://api.openai.com/v1/chat/completions',
  deepseek: 'https://api.deepseek.com/v1/chat/completions',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
};

export class LLMClient {
  private config: LLMConfig;
  private actionRegistry: ActionRegistry;

  constructor(config: LLMConfig, actionRegistry: ActionRegistry) {
    this.config = {
      model: DEFAULT_MODELS[config.provider] || 'deepseek-chat',
      maxTokens: 1024,
      baseUrl: DEFAULT_BASE_URLS[config.provider],
      ...config,
    };
    this.actionRegistry = actionRegistry;
  }

  async chat(
    userMessage: string,
    tools: LLMToolDefinition[],
    conversationHistory: Array<{ role: string; content: string }> = []
  ): Promise<LLMResponse> {
    if (this.config.provider === 'claude') {
      return this.chatWithClaude(userMessage, tools, conversationHistory);
    }
    // deepseek, openai, qwen all use OpenAI-compatible API format
    return this.chatWithOpenAI(userMessage, tools, conversationHistory);
  }

  private async chatWithClaude(
    userMessage: string,
    tools: LLMToolDefinition[],
    history: Array<{ role: string; content: string }>
  ): Promise<LLMResponse> {
    const body = {
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      system: this.getSystemPrompt(),
      messages: [...history, { role: 'user', content: userMessage }],
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema,
      })),
    };

    const response = await fetch(this.config.baseUrl || 'https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) throw new Error(`LLM API error (${response.status}): ${await response.text()}`);

    const data = (await response.json()) as {
      content: Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown>; id?: string }>;
    };

    const textParts: string[] = [];
    const toolCalls: ToolCall[] = [];

    for (const block of data.content) {
      if (block.type === 'text' && block.text) {
        textParts.push(block.text);
      } else if (block.type === 'tool_use') {
        toolCalls.push({ id: block.id || crypto.randomUUID(), name: block.name || '', arguments: block.input || {} });
      }
    }

    return { text: textParts.join('\n'), toolCalls };
  }

  private async chatWithOpenAI(
    userMessage: string,
    tools: LLMToolDefinition[],
    history: Array<{ role: string; content: string }>
  ): Promise<LLMResponse> {
    const messages = [
      { role: 'system', content: this.getSystemPrompt() },
      ...history,
      { role: 'user', content: userMessage },
    ];

    const response = await fetch(this.config.baseUrl || 'https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        messages,
        tools: tools.map((t) => ({
          type: 'function',
          function: { name: t.name, description: t.description, parameters: t.input_schema },
        })),
      }),
    });

    if (!response.ok) throw new Error(`LLM API error (${response.status}): ${await response.text()}`);

    const data = (await response.json()) as {
      choices: Array<{ message: { content?: string; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> } }>;
    };

    const choice = data.choices[0];
    const text = choice.message.content || '';
    const toolCalls: ToolCall[] = [];

    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        toolCalls.push({ id: tc.id, name: tc.function.name, arguments: JSON.parse(tc.function.arguments) });
      }
    }

    return { text, toolCalls };
  }

  private getSystemPrompt(): string {
    return `你是 SatsAi，一个桌面智能助手。你可以通过自然语言与用户交流，并能操控用户的电脑。你支持中英双语，会根据用户的语言自动切换回复语言。

你有以下能力：
- 打开和关闭应用程序
- 模拟键盘输入文字
- 控制系统音量和设置
- 截屏
- 打开网页和搜索
- 查询系统信息
- 通过 MCP 工具进行文件操作、数据库查询等

当用户发出指令时，你应该：
1. 分析用户意图
2. 如果需要执行操作，使用工具调用
3. 用友好的语气回复用户，告知操作结果
4. 回复尽量简洁（2-3句话），因为是语音交互

你的角色是一个可爱的 AI 桌面精灵，有个性、有温度，但不过分啰嗦。`;
  }

  async executeToolCalls(toolCalls: ToolCall[]) {
    const results = [];
    for (const tc of toolCalls) {
      results.push(await this.actionRegistry.execute(tc.name, tc.arguments));
    }
    return results;
  }
}
