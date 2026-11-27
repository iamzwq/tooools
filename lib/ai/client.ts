/**
 * Minimal OpenAI-compatible chat client (DeepSeek, OpenAI, Qwen, Kimi, Ollama, ...).
 * Dependency-free on purpose: it runs in the background service worker and in extension pages.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatEndpoint {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Extra request fields, e.g. a provider-specific thinking switch. */
  extraBody?: Record<string, unknown>;
}

export interface ChatUsage {
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
}

export interface ChatResult {
  content: string;
  reasoning: string;
  finishReason?: string;
  usage?: ChatUsage;
}

export interface StreamCallbacks {
  onContent?: (delta: string) => void;
  onReasoning?: (delta: string) => void;
}

export type AiErrorCode =
  | 'auth'
  | 'quota'
  | 'rate-limit'
  | 'not-found'
  | 'bad-request'
  | 'server'
  | 'network'
  | 'empty'
  | 'aborted';

export class AiError extends Error {
  readonly code: AiErrorCode;
  readonly status?: number;

  constructor(code: AiErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'AiError';
    this.code = code;
    this.status = status;
  }
}

export function endpointUrl(baseUrl: string, path: string): string {
  return `${baseUrl.trim().replace(/\/+$/, '')}/${path}`;
}

function requestHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`;
  return headers;
}

async function errorFromResponse(res: Response): Promise<AiError> {
  let detail = '';
  try {
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      detail = json?.error?.message ?? json?.message ?? (typeof json?.error === 'string' ? json.error : text);
    } catch {
      detail = text;
    }
  } catch {
    // Body unreadable; the status code alone has to do.
  }
  detail = String(detail).replace(/\s+/g, ' ').trim().slice(0, 200);
  const status = res.status;
  const withDetail = (message: string) => (detail ? `${message}：${detail}` : message);
  if (status === 401 || status === 403) return new AiError('auth', withDetail('API Key 无效或没有权限'), status);
  if (status === 402) return new AiError('quota', withDetail('账户余额不足'), status);
  if (status === 404) return new AiError('not-found', withDetail('接口地址或模型不存在，请检查 Base URL 和模型名称'), status);
  if (status === 429) return new AiError('rate-limit', withDetail('请求过于频繁或额度已用尽，请稍后再试'), status);
  if (status >= 500) return new AiError('server', withDetail(`AI 服务暂时不可用（HTTP ${status}）`), status);
  return new AiError('bad-request', withDetail(`请求被拒绝（HTTP ${status}）`), status);
}

function abortedError(): AiError {
  return new AiError('aborted', '已取消');
}

async function send(url: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal });
  } catch (err) {
    if (signal?.aborted) throw abortedError();
    throw new AiError('network', `无法连接 AI 服务：${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) throw await errorFromResponse(res);
  return res;
}

function chatBody(endpoint: ChatEndpoint, messages: ChatMessage[], stream: boolean) {
  return JSON.stringify({ ...endpoint.extraBody, model: endpoint.model.trim(), messages, stream });
}

function usageOf(raw: unknown): ChatUsage | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const u = raw as Record<string, any>;
  return {
    promptTokens: u.prompt_tokens,
    completionTokens: u.completion_tokens,
    reasoningTokens: u.completion_tokens_details?.reasoning_tokens,
  };
}

function resultFromCompletion(json: any): ChatResult {
  const choice = json?.choices?.[0];
  return {
    content: String(choice?.message?.content ?? ''),
    reasoning: String(choice?.message?.reasoning_content ?? choice?.message?.reasoning ?? ''),
    finishReason: choice?.finish_reason ?? undefined,
    usage: usageOf(json?.usage),
  };
}

function assertContent(result: ChatResult): ChatResult {
  if (result.content.trim()) return result;
  if (result.finishReason === 'length') throw new AiError('empty', 'AI 输出被截断：模型的输出长度上限不足');
  throw new AiError('empty', 'AI 没有返回内容');
}

/** Streams a chat completion, reporting answer and reasoning ("thinking") deltas as they arrive. */
export async function streamChat(
  endpoint: ChatEndpoint,
  messages: ChatMessage[],
  callbacks: StreamCallbacks = {},
  signal?: AbortSignal,
): Promise<ChatResult> {
  const res = await send(
    endpointUrl(endpoint.baseUrl, 'chat/completions'),
    { method: 'POST', headers: requestHeaders(endpoint.apiKey), body: chatBody(endpoint, messages, true) },
    signal,
  );

  // Some servers ignore `stream: true` and answer with a single JSON body.
  if ((res.headers.get('content-type') ?? '').includes('application/json')) {
    const result = resultFromCompletion(await res.json());
    if (result.reasoning) callbacks.onReasoning?.(result.reasoning);
    if (result.content) callbacks.onContent?.(result.content);
    return assertContent(result);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new AiError('empty', 'AI 服务没有返回数据');
  const decoder = new TextDecoder();
  const result: ChatResult = { content: '', reasoning: '' };
  let buffer = '';
  let finished = false;

  const handleData = (data: string) => {
    if (data === '[DONE]') {
      finished = true;
      return;
    }
    let json: any;
    try {
      json = JSON.parse(data);
    } catch {
      return;
    }
    if (json?.error) throw new AiError('server', String(json.error.message ?? json.error));
    const choice = json?.choices?.[0];
    const delta = choice?.delta ?? {};
    // DeepSeek/Qwen use `reasoning_content`; OpenRouter uses `reasoning`.
    const reasoning = delta.reasoning_content ?? delta.reasoning;
    if (typeof reasoning === 'string' && reasoning) {
      result.reasoning += reasoning;
      callbacks.onReasoning?.(reasoning);
    }
    if (typeof delta.content === 'string' && delta.content) {
      result.content += delta.content;
      callbacks.onContent?.(delta.content);
    }
    if (choice?.finish_reason) result.finishReason = choice.finish_reason;
    if (json?.usage) result.usage = usageOf(json.usage);
  };

  try {
    while (!finished) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while (!finished && (newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line.startsWith('data:')) handleData(line.slice(5).trim());
      }
    }
    if (!finished && buffer.trim().startsWith('data:')) handleData(buffer.trim().slice(5).trim());
  } catch (err) {
    if (signal?.aborted) throw abortedError();
    if (err instanceof AiError) throw err;
    throw new AiError('network', `连接中断：${err instanceof Error ? err.message : String(err)}`);
  } finally {
    reader.cancel().catch(() => {});
  }
  return assertContent(result);
}

/** Non-streaming chat completion. */
export async function chat(endpoint: ChatEndpoint, messages: ChatMessage[], signal?: AbortSignal): Promise<ChatResult> {
  const res = await send(
    endpointUrl(endpoint.baseUrl, 'chat/completions'),
    { method: 'POST', headers: requestHeaders(endpoint.apiKey), body: chatBody(endpoint, messages, false) },
    signal,
  );
  return assertContent(resultFromCompletion(await res.json()));
}

/** Model ids from the OpenAI-compatible `GET /models` endpoint. */
export async function listModels(endpoint: Pick<ChatEndpoint, 'baseUrl' | 'apiKey'>, signal?: AbortSignal): Promise<string[]> {
  const res = await send(endpointUrl(endpoint.baseUrl, 'models'), { headers: requestHeaders(endpoint.apiKey) }, signal);
  const json = await res.json();
  const list: unknown[] = Array.isArray(json?.data) ? json.data : Array.isArray(json?.models) ? json.models : [];
  return list
    .map((m) => (typeof m === 'string' ? m : String((m as { id?: unknown; name?: unknown })?.id ?? (m as { name?: unknown })?.name ?? '')))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}
