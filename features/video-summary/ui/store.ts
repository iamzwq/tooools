import { browser, type Browser } from 'wxt/browser';
import { getAiModelSettings, isAiModelConfigured } from '@/lib/ai/settings';
import { isExtensionContextLost } from '@/utils/messaging';
import { getCachedSummary, saveCachedSummary, summaryCacheKey } from '../cache';
import { VIDEO_SUMMARY_PORT, type SummarizeRequest, type SummaryEvent } from '../messages';
import { loadVideo } from '../sites';
import { AssistantError, type LoadedVideo, type TranscriptSegment, type VideoRef } from '../types';

export interface ErrorInfo {
  code: string;
  message: string;
}

export interface TranscriptState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  /** Loaded even when the video has no usable subtitles, for its title. */
  video?: LoadedVideo;
  trackId?: string;
  segments?: TranscriptSegment[];
  error?: ErrorInfo;
}

export type SummaryPhase = 'idle' | 'transcript' | 'chunks' | 'thinking' | 'writing' | 'done' | 'error';

export interface SummaryState {
  phase: SummaryPhase;
  markdown: string;
  reasoningChars: number;
  chunk?: { index: number; total: number };
  error?: ErrorInfo;
  model?: string;
  trackLabel?: string;
  /** When the shown summary was generated. */
  createdAt?: number;
  cached?: boolean;
  startedAt?: number;
  elapsedMs?: number;
}

export interface AssistantState {
  ref: VideoRef | null;
  transcript: TranscriptState;
  summary: SummaryState;
}

export const RUNNING_PHASES: readonly SummaryPhase[] = ['transcript', 'chunks', 'thinking', 'writing'];

export const isRunning = (phase: SummaryPhase) => RUNNING_PHASES.includes(phase);

function initialState(ref: VideoRef | null): AssistantState {
  return {
    ref,
    transcript: { status: 'idle' },
    summary: { phase: 'idle', markdown: '', reasoningChars: 0 },
  };
}

function toErrorInfo(err: unknown): ErrorInfo {
  if (err instanceof AssistantError) return { code: err.code, message: err.message };
  // After the extension is updated or reloaded, this copy of the script can no longer reach it.
  if (isExtensionContextLost()) return { code: 'extension-updated', message: EXTENSION_UPDATED_MESSAGE };
  return { code: 'unknown', message: err instanceof Error ? err.message : String(err) };
}

const EXTENSION_UPDATED_MESSAGE = '扩展刚刚更新过，刷新页面后就能继续使用';

export function trackLabelOf(transcript: TranscriptState): string {
  return transcript.video?.tracks.find((t) => t.id === transcript.trackId)?.label ?? '';
}

/** Per-page state shared by the mascot, menu and panel. */
export class AssistantStore {
  private state = initialState(null);
  private readonly listeners = new Set<() => void>();
  private videoPromise: Promise<LoadedVideo> | null = null;
  private port: Browser.runtime.Port | null = null;
  /** Bumped when the video changes, so late async results for the old one are dropped. */
  private refVersion = 0;
  private transcriptRequest = 0;
  /** Bumped by each summary run, by stop() and on video changes; a run continues only while it matches. */
  private summaryRun = 0;

  getState = (): AssistantState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit() {
    for (const listener of this.listeners) listener();
  }

  private setTranscript(patch: Partial<TranscriptState>) {
    this.state = { ...this.state, transcript: { ...this.state.transcript, ...patch } };
    this.emit();
  }

  private setSummary(patch: Partial<SummaryState>) {
    this.state = { ...this.state, summary: { ...this.state.summary, ...patch } };
    this.emit();
  }

  setRef(ref: VideoRef | null) {
    if (ref?.key === this.state.ref?.key) return;
    this.disconnect();
    this.refVersion++;
    this.summaryRun++;
    this.videoPromise = null;
    this.state = initialState(ref);
    this.emit();
  }

  private loadVideoOnce(ref: VideoRef): Promise<LoadedVideo> {
    if (!this.videoPromise) {
      const promise = loadVideo(ref);
      this.videoPromise = promise;
      // Allow a retry after failures (e.g. the user logs in, or the player finishes loading).
      promise.catch(() => {
        if (this.videoPromise === promise) this.videoPromise = null;
      });
    }
    return this.videoPromise;
  }

  /** Loads the given (or default) subtitle track; resolves null if the video changed meanwhile. */
  async loadTranscript(trackId?: string): Promise<{ video: LoadedVideo; segments: TranscriptSegment[] } | null> {
    const ref = this.state.ref;
    if (!ref) return null;
    const current = this.state.transcript;
    if (current.status === 'ready' && current.video && current.segments && (trackId == null || trackId === current.trackId)) {
      return { video: current.video, segments: current.segments };
    }
    const version = this.refVersion;
    const request = ++this.transcriptRequest;
    const stale = () => version !== this.refVersion || request !== this.transcriptRequest;
    this.setTranscript({ status: 'loading', error: undefined });
    let video: LoadedVideo | undefined;
    try {
      video = await this.loadVideoOnce(ref);
      if (stale()) return null;
      const id = trackId ?? video.defaultTrackId;
      if (!id) {
        // Don't keep the empty result, so "重试" fetches again (e.g. after logging in to B站).
        this.videoPromise = null;
        throw video.missingReason === 'login'
          ? new AssistantError('login', 'B站的字幕需要登录后才能获取，登录后点「重试」即可')
          : new AssistantError('no-subtitle', '这个视频没有字幕（包括 AI 字幕），暂时无法总结');
      }
      const segments = await video.fetchTrack(id);
      if (stale()) return null;
      if (!segments.length) throw new AssistantError('no-subtitle', '字幕内容是空的');
      this.setTranscript({ status: 'ready', video, trackId: id, segments, error: undefined });
      return { video, segments };
    } catch (err) {
      if (stale()) return null;
      this.setTranscript({ status: 'error', video, error: toErrorInfo(err) });
      throw err;
    }
  }

  /** Shows the cached summary, or generates one. `force` regenerates and replaces the cache. */
  async summarize({ force = false }: { force?: boolean } = {}) {
    const ref = this.state.ref;
    if (!ref) return;
    const { phase } = this.state.summary;
    if (isRunning(phase) || (phase === 'done' && !force)) return;
    const run = ++this.summaryRun;
    const stale = () => run !== this.summaryRun;
    const cacheKey = summaryCacheKey(ref.site, ref.key);

    this.setSummary({ phase: 'transcript', markdown: '', reasoningChars: 0, chunk: undefined, error: undefined, cached: false, startedAt: Date.now() });

    try {
      if (!force) {
        const cached = await getCachedSummary(cacheKey);
        if (stale()) return;
        if (cached) {
          this.setSummary({
            phase: 'done',
            markdown: cached.markdown,
            model: cached.model,
            trackLabel: cached.trackLabel,
            createdAt: cached.createdAt,
            cached: true,
            elapsedMs: undefined,
          });
          return;
        }
      }

      const ai = await getAiModelSettings();
      if (stale()) return;
      if (!isAiModelConfigured(ai)) {
        this.setSummary({ phase: 'error', error: { code: 'config', message: '填写 API Key 后就能开始总结了' } });
        return;
      }

      let loaded = await this.loadTranscript();
      if (stale()) return;
      if (!loaded) {
        // Superseded by a track switch in the transcript tab: use whatever that loaded.
        const { video, segments, status } = this.state.transcript;
        if (status !== 'ready' || !video || !segments) {
          this.setSummary({ phase: 'idle' });
          return;
        }
        loaded = { video, segments };
      }

      const trackLabel = trackLabelOf(this.state.transcript);
      this.setSummary({ phase: 'thinking', model: ai.model, trackLabel });

      this.disconnect();
      const port = browser.runtime.connect({ name: VIDEO_SUMMARY_PORT });
      this.port = port;
      const startedAt = this.state.summary.startedAt ?? Date.now();
      port.onMessage.addListener((event: SummaryEvent) => {
        if (this.port !== port) return;
        this.handleEvent(event, cacheKey, trackLabel, startedAt);
      });
      port.onDisconnect.addListener(() => {
        if (this.port !== port) return;
        this.port = null;
        if (isRunning(this.state.summary.phase)) {
          this.setSummary({ phase: 'error', error: toErrorInfo(new Error('与扩展后台的连接中断了，请重试')) });
        }
      });
      const request: SummarizeRequest = {
        type: 'summarize',
        input: { video: loaded.video.meta, trackLabel, segments: loaded.segments },
      };
      port.postMessage(request);
    } catch (err) {
      if (!stale()) this.setSummary({ phase: 'error', error: toErrorInfo(err) });
    }
  }

  private handleEvent(event: SummaryEvent, cacheKey: string, trackLabel: string, startedAt: number) {
    switch (event.type) {
      case 'chunk':
        this.setSummary({ phase: 'chunks', chunk: { index: event.index, total: event.total } });
        break;
      case 'reasoning':
        this.setSummary({ phase: 'thinking', reasoningChars: event.chars });
        break;
      case 'delta':
        this.setSummary({ phase: 'writing', markdown: this.state.summary.markdown + event.text });
        break;
      case 'done': {
        const createdAt = Date.now();
        this.setSummary({ phase: 'done', markdown: event.content, model: event.model, createdAt, elapsedMs: createdAt - startedAt });
        this.disconnect();
        void saveCachedSummary(cacheKey, { markdown: event.content, model: event.model, trackLabel, createdAt });
        break;
      }
      case 'error':
        this.setSummary({ phase: 'error', error: { code: event.code, message: event.message } });
        this.disconnect();
        break;
    }
  }

  /** Stops a running summary, including one still loading subtitles; the panel goes back to its start screen. */
  stop() {
    if (!isRunning(this.state.summary.phase)) return;
    this.summaryRun++;
    this.disconnect();
    this.setSummary({ phase: 'idle', markdown: '', reasoningChars: 0, chunk: undefined });
  }

  private disconnect() {
    const port = this.port;
    this.port = null;
    port?.disconnect();
  }
}
