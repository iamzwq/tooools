import { browser, type Browser } from 'wxt/browser';
import { AiError, streamChat, type ChatEndpoint, type ChatMessage } from '@/lib/ai/client';
import { getAiModelSettings, isAiModelConfigured, toChatEndpoint } from '@/lib/ai/settings';
import { onMessage } from '@/utils/messaging';
import {
  VIDEO_SUMMARY_FETCH_SUBTITLE,
  VIDEO_SUMMARY_PORT,
  VIDEO_SUMMARY_YT_POT,
  VIDEO_SUMMARY_YT_PLAYER,
  type SummarizeRequest,
  type SummaryEvent,
} from './messages';
import { planSummary } from './prompt';
import { getVideoSummarySettings } from './settings';
import { isBilibiliSubtitleUrl } from './sites/bilibili';
import { captureYoutubePotInPage, readYoutubePlayerInPage, type YoutubePlayerData } from './sites/youtube-page';
import type { SummaryInput } from './types';

const DELTA_FLUSH_MS = 60;
/** Parts of a long transcript summarized at the same time. */
const CHUNK_CONCURRENCY = 3;
/**
 * Chrome stops an MV3 service worker after 30 s without extension events or API calls, and reading
 * a fetch stream doesn't count, so a slow request (e.g. a long part with thinking on) needs pinging.
 */
const KEEP_ALIVE_MS = 20_000;

async function runInPage<A extends unknown[], R>(
  sender: Browser.runtime.MessageSender,
  func: (...args: A) => R,
  args: A,
): Promise<Awaited<R> | null> {
  const tabId = sender.tab?.id;
  if (tabId == null) return null;
  const [result] = await browser.scripting.executeScript({
    target: { tabId, frameIds: [sender.frameId ?? 0] },
    world: 'MAIN',
    func: func as (...args: unknown[]) => unknown,
    args,
  });
  return (result?.result ?? null) as Awaited<R> | null;
}

/** Takes notes on each part of a long transcript, a few parts at a time. */
async function takeNotes(
  endpoint: ChatEndpoint,
  chunks: ChatMessage[][],
  post: (event: SummaryEvent) => void,
  signal: AbortSignal,
): Promise<string[]> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort);
  const notes: string[] = [];
  let next = 0;
  let finished = 0;
  const work = async () => {
    while (next < chunks.length) {
      const i = next++;
      notes[i] = (await streamChat(endpoint, chunks[i]!, {}, controller.signal)).content;
      post({ type: 'chunk', index: ++finished, total: chunks.length });
    }
  };
  post({ type: 'chunk', index: 0, total: chunks.length });
  try {
    await Promise.all(Array.from({ length: Math.min(CHUNK_CONCURRENCY, chunks.length) }, work));
    return notes;
  } catch (err) {
    // One part failed: cancel the requests still running for the others.
    controller.abort();
    throw err;
  } finally {
    signal.removeEventListener('abort', abort);
  }
}

async function summarize(input: SummaryInput, post: (event: SummaryEvent) => void, signal: AbortSignal) {
  const settings = await getAiModelSettings();
  if (!isAiModelConfigured(settings)) {
    post({ type: 'error', code: 'config', message: '还没有配置 AI 模型' });
    return;
  }
  const endpoint = toChatEndpoint(settings);
  const plan = planSummary(input, await getVideoSummarySettings());
  const notes = plan.chunks.length ? await takeNotes(endpoint, plan.chunks, post, signal) : [];

  let pending = '';
  let flushTimer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    flushTimer = undefined;
    if (pending) post({ type: 'delta', text: pending });
    pending = '';
  };
  let reasoningChars = 0;
  let reasoningPostedAt = 0;

  const final: ChatMessage[] = plan.final(notes);
  const result = await streamChat(
    endpoint,
    final,
    {
      onReasoning(delta) {
        reasoningChars += delta.length;
        if (Date.now() - reasoningPostedAt > 300) {
          reasoningPostedAt = Date.now();
          post({ type: 'reasoning', chars: reasoningChars });
        }
      },
      onContent(delta) {
        pending += delta;
        flushTimer ??= setTimeout(flush, DELTA_FLUSH_MS);
      },
    },
    signal,
  );
  clearTimeout(flushTimer);
  flush();
  post({ type: 'done', content: result.content, model: settings.model, usage: result.usage });
}

function handleSummaryPort(port: Browser.runtime.Port) {
  const controller = new AbortController();
  // Closing the panel or leaving the video disconnects the port, which cancels the request.
  port.onDisconnect.addListener(() => controller.abort());
  const post = (event: SummaryEvent) => {
    if (controller.signal.aborted) return;
    try {
      port.postMessage(event);
    } catch {
      controller.abort();
    }
  };
  port.onMessage.addListener((message: SummarizeRequest) => {
    if (message?.type !== 'summarize') return;
    const keepAlive = setInterval(() => void browser.runtime.getPlatformInfo(), KEEP_ALIVE_MS);
    summarize(message.input, post, controller.signal)
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error('[tooools] video summary failed', err);
        post({
          type: 'error',
          code: err instanceof AiError ? err.code : 'unknown',
          message: err instanceof Error ? err.message : String(err),
        });
      })
      .finally(() => clearInterval(keepAlive));
  });
}

export function setupVideoSummaryBackground() {
  browser.runtime.onConnect.addListener((port) => {
    if (port.name === VIDEO_SUMMARY_PORT) handleSummaryPort(port);
  });

  onMessage<{ type: typeof VIDEO_SUMMARY_YT_PLAYER }, YoutubePlayerData | null>(VIDEO_SUMMARY_YT_PLAYER, (_message, sender) =>
    runInPage(sender, readYoutubePlayerInPage, []),
  );

  // Each capture toggles the page's CC button and restores it at the end, so overlapping ones (e.g. the
  // subtitle tab and a summary loading together) would restore each other's state: share one instead.
  const potCaptures = new Map<string, Promise<string | null>>();
  onMessage<{ type: typeof VIDEO_SUMMARY_YT_POT; videoId: string }, string | null>(VIDEO_SUMMARY_YT_POT, (message, sender) => {
    const key = `${sender.tab?.id}:${sender.frameId}:${message.videoId}`;
    let capture = potCaptures.get(key);
    if (!capture) {
      capture = runInPage(sender, captureYoutubePotInPage, [message.videoId]).finally(() => potCaptures.delete(key));
      potCaptures.set(key, capture);
    }
    return capture;
  });

  onMessage<{ type: typeof VIDEO_SUMMARY_FETCH_SUBTITLE; url: string }, unknown>(VIDEO_SUMMARY_FETCH_SUBTITLE, async ({ url }) => {
    if (!isBilibiliSubtitleUrl(url)) return null;
    const res = await fetch(url);
    return res.ok ? res.json() : null;
  });
}
