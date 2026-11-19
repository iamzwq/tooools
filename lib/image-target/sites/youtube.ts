import { closestDeep, parentOf } from '@/lib/dom';
import type { ImageCandidate } from '../messages';
import type { SiteResolver } from './index';

const ID = '[\\w-]{11}';
const THUMB_RE = new RegExp(`//i\\d?\\.ytimg\\.com/vi(?:_webp)?/(${ID})/`);
const PLAYER_SELECTOR = '#movie_player, .html5-video-player, ytd-player, ytd-reel-video-renderer, ytm-reel-player-overlay-renderer';
const CARD_SELECTOR = [
  'ytd-rich-item-renderer',
  'ytd-video-renderer',
  'ytd-compact-video-renderer',
  'ytd-grid-video-renderer',
  'ytd-playlist-video-renderer',
  'ytd-reel-item-renderer',
  'ytm-shorts-lockup-view-model',
  'yt-lockup-view-model',
  'ytm-media-item',
].join(',');

/** Largest first. maxresdefault/hq720 don't exist for every video (HTTP 404), so later ones are fallbacks. */
const THUMB_NAMES = ['maxresdefault', 'hq720', 'sddefault', 'hqdefault'];

export function videoIdFromUrl(href: string, base = location.href): string | null {
  let url: URL;
  try {
    url = new URL(href, base);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  if (host === 'youtu.be') return matchId(url.pathname.slice(1));
  if (!/(^|\.)youtube(-nocookie)?\.com$/.test(host)) return null;
  if (url.pathname === '/watch') return matchId(url.searchParams.get('v'));
  const m = url.pathname.match(new RegExp(`^/(?:shorts|embed|live|v)/(${ID})`));
  return m?.[1] ?? null;
}

function matchId(value: string | null): string | null {
  return value && new RegExp(`^${ID}$`).test(value) ? value : null;
}

function textOf(el: Element | null | undefined): string {
  return (el?.getAttribute('title') || el?.textContent || '').trim();
}

function cardTitle(el: Element): string {
  const card = closestDeep(el, CARD_SELECTOR);
  const titleEl = card?.querySelector('#video-title, .yt-lockup-metadata-view-model__title, h3 a, h3');
  return textOf(titleEl) || (closestDeep(el, 'a[title]')?.getAttribute('title') ?? '');
}

function pageTitle(): string {
  const h1 = document.querySelector('ytd-watch-metadata h1, h1.ytd-watch-metadata, #title h1');
  return textOf(h1) || document.title.replace(/^\(\d+\)\s*/, '').replace(/\s*-\s*YouTube$/, '');
}

/** Finds the video the element belongs to: a thumbnail link, a thumbnail image, or the player. */
function findVideo(el: Element): { id: string; title: string } | null {
  for (let node: Element | null = el; node; node = parentOf(node)) {
    if (node instanceof HTMLAnchorElement && node.href) {
      const id = videoIdFromUrl(node.href);
      if (id) return { id, title: cardTitle(node) };
      // Avatar/channel links: the element isn't a video thumbnail.
      return null;
    }
    if (node instanceof HTMLImageElement) {
      const id = (node.currentSrc || node.src).match(THUMB_RE)?.[1];
      if (id) return { id, title: cardTitle(node) };
    }
  }
  if (closestDeep(el, PLAYER_SELECTOR)) {
    const id = videoIdFromUrl(location.href);
    if (id) return { id, title: pageTitle() };
  }
  return null;
}

export const youtube: SiteResolver = {
  matches: (url) => /(^|\.)youtube(-nocookie)?\.com$/.test(url.hostname),
  resolve(stack) {
    for (const el of stack) {
      const video = findVideo(el);
      if (!video) continue;
      const fileName = video.title ? `${video.title} [${video.id}]` : `youtube-${video.id}`;
      return THUMB_NAMES.map<ImageCandidate>((name) => ({
        url: `https://i.ytimg.com/vi/${video.id}/${name}.jpg`,
        fileName,
      }));
    }
    return null;
  },
};
