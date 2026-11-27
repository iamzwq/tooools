export interface AiProvider {
  id: string;
  name: string;
  /** OpenAI-compatible base URL; `/chat/completions` and `/models` are appended to it. */
  baseUrl: string;
  /** Model filled in when switching to this provider. */
  defaultModel?: string;
  /** Where users create API keys. */
  keyUrl?: string;
  /** Local servers usually run without a key. */
  keyOptional?: boolean;
  /** Provider-specific request fields that switch the model's thinking mode on or off. */
  thinkingParams?: (enabled: boolean) => Record<string, unknown>;
}

export const AI_PROVIDERS: AiProvider[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-flash',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    thinkingParams: (enabled) => ({ thinking: { type: enabled ? 'enabled' : 'disabled' } }),
  },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', keyUrl: 'https://platform.openai.com/api-keys' },
  {
    id: 'qwen',
    name: '通义千问（阿里云百炼）',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    keyUrl: 'https://bailian.console.aliyun.com/',
  },
  { id: 'moonshot', name: 'Kimi（月之暗面）', baseUrl: 'https://api.moonshot.cn/v1', keyUrl: 'https://platform.moonshot.cn/' },
  { id: 'zhipu', name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', keyUrl: 'https://open.bigmodel.cn/' },
  { id: 'siliconflow', name: '硅基流动', baseUrl: 'https://api.siliconflow.cn/v1', keyUrl: 'https://cloud.siliconflow.cn/' },
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', keyUrl: 'https://openrouter.ai/keys' },
  { id: 'ollama', name: 'Ollama（本地）', baseUrl: 'http://localhost:11434/v1', keyOptional: true },
  { id: 'custom', name: '自定义（OpenAI 兼容）', baseUrl: '' },
];

export function findProvider(id: string): AiProvider | undefined {
  return AI_PROVIDERS.find((p) => p.id === id);
}
