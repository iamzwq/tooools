import { browser } from 'wxt/browser';
import { VIDEO_SUMMARY_YT_POT, VIDEO_SUMMARY_YT_PLAYER } from '../messages';
import { AssistantError, type LoadedVideo, type TranscriptSegment, type TranscriptTrack, type VideoRef } from '../types';
import type { YoutubePlayerData } from './youtube-page';

export function parseYoutubeUrl(url: URL): VideoRef | null {
  if (url.hostname !== 'www.youtube.com' || url.pathname !== '/watch') return null;
  const id = url.searchParams.get('v');
  return id && /^[\w-]{11}$/.test(id) ? { site: 'youtube', id, key: id, page: 1 } : null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function readPlayer(videoId: string): Promise<YoutubePlayerData> {
  // Right after in-app navigation the player can still describe the previous video.
  for (let attempt = 0; attempt < 10; attempt++) {
    const data = (await browser.runtime.sendMessage({ type: VIDEO_SUMMARY_YT_PLAYER })) as YoutubePlayerData | null | undefined;
    if (data?.videoId === videoId) return data;
    await sleep(500);
  }
  throw new AssistantError('site', '没有读取到 YouTube 播放器数据，请刷新页面后重试');
}

const baseLang = (lang: string) => lang.toLowerCase().split('-')[0];

/** Prefers human captions in the spoken language (that of the auto track), then Chinese, then auto. */
function pickTrack(tracks: TranscriptTrack[]): string | null {
  const auto = tracks.find((t) => t.auto);
  const human = tracks.filter((t) => !t.auto);
  const choice =
    (auto && human.find((t) => baseLang(t.lang) === baseLang(auto.lang))) ??
    human.find((t) => baseLang(t.lang) === 'zh') ??
    auto ??
    human.find((t) => baseLang(t.lang) === 'en') ??
    tracks[0];
  return choice?.id ?? null;
}

export function parseJson3(json: any): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  for (const event of Array.isArray(json?.events) ? json.events : []) {
    if (!Array.isArray(event?.segs)) continue;
    const text = event.segs
      .map((seg: any) => seg?.utf8 ?? '')
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) continue;
    const start = (Number(event.tStartMs) || 0) / 1000;
    segments.push({ start, end: start + (Number(event.dDurationMs) || 0) / 1000, text });
  }
  return segments;
}

async function fetchTrack(videoId: string, baseUrl: string): Promise<TranscriptSegment[]> {
  const url = new URL(baseUrl, location.origin);
  url.searchParams.set('fmt', 'json3');
  // `exp` lists experiments, e.g. "xpo,xwmhp,xpe"; "xpe" means a PO token is required.
  if (url.searchParams.get('exp')?.split(',').includes('xpe')) {
    const pot = (await browser.runtime.sendMessage({ type: VIDEO_SUMMARY_YT_POT, videoId })) as string | null | undefined;
    if (!pot) {
      throw new AssistantError(
        'youtube-captions',
        '没能拿到 YouTube 字幕的访问令牌。请先播放视频（跳过广告），确认播放器的字幕（CC）按钮可用后重试',
      );
    }
    url.searchParams.set('pot', pot);
    url.searchParams.set('c', 'WEB');
  }
  let text = '';
  try {
    const res = await fetch(url.href, { credentials: 'include' });
    if (res.ok) text = await res.text();
  } catch (err) {
    throw new AssistantError('network', `下载字幕失败：${err instanceof Error ? err.message : String(err)}`);
  }
  if (!text.trim()) throw new AssistantError('youtube-captions', 'YouTube 没有返回字幕内容，请打开一次播放器字幕（CC）后重试');
  return parseJson3(JSON.parse(text));
}

export async function loadYoutubeVideo(ref: VideoRef): Promise<LoadedVideo> {
  const data = await readPlayer(ref.id);
  const usable = data.tracks.filter((t) => t.baseUrl);
  if (!usable.length && data.isLive) {
    throw new AssistantError('unsupported', '正在直播的视频暂时没法总结，等直播结束、回放生成字幕后再试吧');
  }
  // Unplayable videos (members-only, age-restricted, region-blocked, bot checks…) come without captions.
  if (!usable.length && data.playability && data.playability !== 'OK') {
    const reason = data.playabilityReason ? `（${data.playabilityReason}）` : '';
    throw new AssistantError('unplayable', `YouTube 目前无法播放这个视频${reason}，所以读取不到字幕`);
  }
  const tracks = usable.map<TranscriptTrack>((t, i) => ({
    id: String(i),
    lang: t.languageCode,
    label: t.name || t.languageCode,
    auto: t.kind === 'asr',
  }));
  return {
    meta: {
      site: 'youtube',
      key: ref.key,
      title: data.title,
      author: data.author || undefined,
      duration: data.lengthSeconds || undefined,
      description: data.description || undefined,
    },
    tracks,
    defaultTrackId: pickTrack(tracks),
    missingReason: tracks.length ? undefined : 'none',
    fetchTrack: (trackId) => {
      const track = usable[Number(trackId)];
      if (!track) return Promise.reject(new AssistantError('no-subtitle', '找不到这条字幕'));
      return fetchTrack(ref.id, track.baseUrl);
    },
  };
}
