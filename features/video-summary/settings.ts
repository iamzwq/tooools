import { storage } from 'wxt/utils/storage';

export type SummaryLanguage = 'zh-CN' | 'zh-TW' | 'en' | 'auto';
export type SummaryDetail = 'brief' | 'standard' | 'detailed';

export interface VideoSummarySettings {
  language: SummaryLanguage;
  detail: SummaryDetail;
  /** Extra instructions appended to the prompt. */
  customPrompt: string;
}

export const DEFAULT_VIDEO_SUMMARY_SETTINGS: VideoSummarySettings = {
  language: 'zh-CN',
  detail: 'standard',
  customPrompt: '',
};

export const videoSummarySettingsItem = storage.defineItem<Partial<VideoSummarySettings>>('sync:videoSummarySettings', {
  fallback: {},
});

export async function getVideoSummarySettings(): Promise<VideoSummarySettings> {
  return { ...DEFAULT_VIDEO_SUMMARY_SETTINGS, ...(await videoSummarySettingsItem.getValue()) };
}

export async function updateVideoSummarySettings(patch: Partial<VideoSummarySettings>): Promise<void> {
  await videoSummarySettingsItem.setValue({ ...(await videoSummarySettingsItem.getValue()), ...patch });
}
