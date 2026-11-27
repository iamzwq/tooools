import type { ChatUsage } from '@/lib/ai/client';
import type { SummaryInput } from './types';

export const VIDEO_SUMMARY_FEATURE_ID = 'video-summary';

/** Long-lived port (content script → background) that streams one summary. */
export const VIDEO_SUMMARY_PORT = 'video-summary:summarize';

/** Popup → content script: open the panel and summarize the current video. */
export const VIDEO_SUMMARY_OPEN = 'video-summary:open';
/** Content script → background: read YouTube's player data in the page's main world. */
export const VIDEO_SUMMARY_YT_PLAYER = 'video-summary:yt-player';
/** Content script → background: capture the player's caption PO token in the page's main world. */
export const VIDEO_SUMMARY_YT_POT = 'video-summary:yt-pot';
/** Content script → background: fetch a B站 subtitle file when the page context can't (CORS). */
export const VIDEO_SUMMARY_FETCH_SUBTITLE = 'video-summary:fetch-subtitle';

export interface SummarizeRequest {
  type: 'summarize';
  input: SummaryInput;
}

export type SummaryEvent =
  | { type: 'chunk'; index: number; total: number }
  | { type: 'reasoning'; chars: number }
  | { type: 'delta'; text: string }
  | { type: 'done'; content: string; model: string; usage?: ChatUsage }
  | { type: 'error'; code: string; message: string };
