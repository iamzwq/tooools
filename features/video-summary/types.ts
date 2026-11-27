export type VideoSite = 'bilibili' | 'youtube';

/** Identifies a video from the page URL alone (no network). */
export interface VideoRef {
  site: VideoSite;
  /** BV id / av id (B站) or the 11-char video id (YouTube). */
  id: string;
  /** Unique per playable unit, e.g. a 分P; used for caching and detecting navigation. */
  key: string;
  /** 1-based 分P index (B站). */
  page: number;
}

export interface TranscriptSegment {
  /** Seconds. */
  start: number;
  end: number;
  text: string;
}

export interface TranscriptTrack {
  id: string;
  lang: string;
  label: string;
  /** Machine-generated (B站 AI 字幕 / YouTube 自动字幕). */
  auto: boolean;
}

export interface VideoChapter {
  start: number;
  title: string;
}

export interface VideoMeta {
  site: VideoSite;
  key: string;
  title: string;
  author?: string;
  /** Seconds. */
  duration?: number;
  description?: string;
  chapters?: VideoChapter[];
}

/** Video metadata plus its subtitle tracks, as loaded from the site. */
export interface LoadedVideo {
  meta: VideoMeta;
  tracks: TranscriptTrack[];
  defaultTrackId: string | null;
  /** Why `tracks` is empty. */
  missingReason?: 'login' | 'none';
  fetchTrack(trackId: string): Promise<TranscriptSegment[]>;
}

export interface SummaryInput {
  video: VideoMeta;
  trackLabel: string;
  segments: TranscriptSegment[];
}

export type AssistantErrorCode =
  | 'config'
  | 'login'
  | 'no-subtitle'
  | 'youtube-captions'
  | 'unplayable'
  | 'unsupported'
  | 'site'
  | 'auth'
  | 'quota'
  | 'rate-limit'
  | 'not-found'
  | 'bad-request'
  | 'server'
  | 'network'
  | 'empty'
  | 'unknown';

export class AssistantError extends Error {
  readonly code: AssistantErrorCode;

  constructor(code: AssistantErrorCode, message: string) {
    super(message);
    this.name = 'AssistantError';
    this.code = code;
  }
}
