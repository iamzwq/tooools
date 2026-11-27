import { browser } from 'wxt/browser';
import { VIDEO_SUMMARY_FETCH_SUBTITLE } from '../messages';
import {
  AssistantError,
  type LoadedVideo,
  type TranscriptSegment,
  type TranscriptTrack,
  type VideoChapter,
  type VideoMeta,
  type VideoRef,
} from '../types';

const BVID_RE = /^BV[0-9A-Za-z]{10}$/;

/** Hosts serving B站 subtitle files, which the background may fetch on the page's behalf. */
export function isBilibiliSubtitleUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === 'https:' && /(^|\.)(hdslb\.com|bilibili\.com)$/.test(hostname);
  } catch {
    return false;
  }
}

export function parseBilibiliUrl(url: URL): VideoRef | null {
  if (url.hostname !== 'www.bilibili.com') return null;
  const page = Math.max(1, Math.floor(Number(url.searchParams.get('p'))) || 1);
  const ref = (id: string): VideoRef => ({ site: 'bilibili', id, key: `${id}:p${page}`, page });
  const video = url.pathname.match(/^\/video\/(BV[0-9A-Za-z]{10}|av\d+)(?:\/|$)/);
  if (video?.[1]) return ref(video[1]);
  // 稍后再看 / 收藏夹 / 活动页的播放器：/list/...?bvid=BV...
  const bvid = url.searchParams.get('bvid');
  if (bvid && BVID_RE.test(bvid) && /^\/(list|festival)\//.test(url.pathname)) return ref(bvid);
  return null;
}

interface BiliResponse {
  code: number;
  message?: string;
  data?: any;
}

/** Runs in the content script, so requests carry the user's B站 login cookies. */
async function biliApi(url: string): Promise<BiliResponse> {
  let res: Response;
  try {
    res = await fetch(url, { credentials: 'include' });
  } catch (err) {
    throw new AssistantError('network', `无法连接 B站：${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) throw new AssistantError('site', `B站接口请求失败（HTTP ${res.status}）`);
  return (await res.json()) as BiliResponse;
}

async function loadPlayerInfo(aid: number, cid: number, bvid: string): Promise<any> {
  const query = `aid=${aid}&cid=${cid}&bvid=${bvid}`;
  let lastMessage = '';
  for (const endpoint of ['https://api.bilibili.com/x/player/wbi/v2', 'https://api.bilibili.com/x/player/v2']) {
    try {
      const res = await biliApi(`${endpoint}?${query}`);
      if (res.code === 0 && res.data) return res.data;
      lastMessage = res.message || String(res.code);
    } catch (err) {
      lastMessage = err instanceof Error ? err.message : String(err);
    }
  }
  throw new AssistantError('site', `获取字幕列表失败：${lastMessage}`);
}

function normalizeSubtitleUrl(raw: unknown): string | null {
  const url = String(raw ?? '').trim();
  if (!url) return null;
  if (url.startsWith('//')) return `https:${url}`;
  return url.replace(/^http:\/\//, 'https://');
}

function pickTrack(tracks: TranscriptTrack[]): string | null {
  const human = tracks.filter((t) => !t.auto);
  const choice =
    human.find((t) => t.lang.startsWith('zh')) ??
    tracks.find((t) => t.auto && t.lang.startsWith('zh')) ??
    human[0] ??
    tracks[0];
  return choice?.id ?? null;
}

function chaptersOf(player: any): VideoChapter[] {
  const points: any[] = Array.isArray(player?.view_points) ? player.view_points : [];
  return points
    .filter((p) => typeof p?.content === 'string' && p.content.trim() && Number.isFinite(Number(p.from)))
    .map((p) => ({ start: Number(p.from), title: p.content.trim() }));
}

export async function loadBilibiliVideo(ref: VideoRef): Promise<LoadedVideo> {
  const query = ref.id.startsWith('av') ? `aid=${ref.id.slice(2)}` : `bvid=${ref.id}`;
  const view = await biliApi(`https://api.bilibili.com/x/web-interface/view?${query}`);
  if (view.code !== 0 || !view.data) throw new AssistantError('site', `获取视频信息失败：${view.message || view.code}`);
  const d = view.data;
  const pages: any[] = Array.isArray(d.pages) ? d.pages : [];
  const page = pages.find((p) => p.page === ref.page) ?? pages[0];
  const cid = Number(page?.cid ?? d.cid);

  const player = await loadPlayerInfo(d.aid, cid, d.bvid);
  const meta: VideoMeta = {
    site: 'bilibili',
    key: ref.key,
    title: pages.length > 1 && page?.part ? `${d.title}（P${page.page} ${page.part}）` : String(d.title ?? ''),
    author: d.owner?.name,
    duration: Number(page?.duration ?? d.duration) || undefined,
    description: typeof d.desc === 'string' ? d.desc : undefined,
    chapters: chaptersOf(player),
  };

  const urls = new Map<string, string>();
  const tracks: TranscriptTrack[] = [];
  for (const sub of Array.isArray(player.subtitle?.subtitles) ? player.subtitle.subtitles : []) {
    const url = normalizeSubtitleUrl(sub.subtitle_url || sub.subtitle_url_v2);
    if (!url) continue;
    // Subtitle ids can exceed Number.MAX_SAFE_INTEGER, so prefer the string form.
    const id = String(sub.id_str ?? sub.id ?? sub.lan);
    const lan = String(sub.lan ?? '');
    urls.set(id, url);
    tracks.push({ id, lang: lan.replace(/^ai-/, ''), label: sub.lan_doc || lan, auto: lan.startsWith('ai-') || Number(sub.ai_type) > 0 });
  }

  return {
    meta,
    tracks,
    defaultTrackId: pickTrack(tracks),
    // Logged-out users get an empty list for every video, with this flag set.
    missingReason: tracks.length ? undefined : player.need_login_subtitle ? 'login' : 'none',
    async fetchTrack(trackId) {
      const url = urls.get(trackId);
      if (!url) throw new AssistantError('no-subtitle', '找不到这条字幕');
      let json: any;
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        json = await res.json();
      } catch (err) {
        // Blocked by CORS in the page context: let the background (host permissions) fetch it.
        json = isBilibiliSubtitleUrl(url)
          ? await browser.runtime.sendMessage({ type: VIDEO_SUMMARY_FETCH_SUBTITLE, url }).catch(() => null)
          : null;
        if (!json) throw new AssistantError('network', `下载字幕失败：${err instanceof Error ? err.message : String(err)}`);
      }
      const body: any[] = Array.isArray(json?.body) ? json.body : [];
      return body
        .map<TranscriptSegment>((item) => ({
          start: Number(item.from) || 0,
          end: Number(item.to) || 0,
          text: String(item.content ?? ''),
        }))
        .filter((seg) => seg.text.trim());
    },
  };
}
