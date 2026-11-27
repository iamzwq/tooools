import { storage } from 'wxt/utils/storage';
import type { ChatEndpoint } from './client';
import { findProvider } from './providers';

export interface AiModelSettings {
  providerId: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Thinking mode; only sent to providers that can switch it (see `AiProvider.thinkingParams`). */
  thinking: boolean;
}

export const DEFAULT_AI_MODEL_SETTINGS: AiModelSettings = {
  providerId: 'deepseek',
  baseUrl: 'https://api.deepseek.com',
  apiKey: '',
  model: 'deepseek-flash',
  thinking: false,
};

/** Kept in local (not sync) storage because it holds the API key. */
export const aiModelSettingsItem = storage.defineItem<Partial<AiModelSettings>>('local:aiModelSettings', {
  fallback: {},
});

export async function getAiModelSettings(): Promise<AiModelSettings> {
  return { ...DEFAULT_AI_MODEL_SETTINGS, ...(await aiModelSettingsItem.getValue()) };
}

export function isAiModelConfigured(settings: AiModelSettings): boolean {
  const keyOptional = findProvider(settings.providerId)?.keyOptional ?? false;
  return !!settings.baseUrl.trim() && !!settings.model.trim() && (keyOptional || !!settings.apiKey.trim());
}

export function toChatEndpoint(settings: AiModelSettings): ChatEndpoint {
  return {
    baseUrl: settings.baseUrl,
    apiKey: settings.apiKey,
    model: settings.model,
    extraBody: findProvider(settings.providerId)?.thinkingParams?.(settings.thinking),
  };
}
