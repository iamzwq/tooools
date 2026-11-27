import type { LoadedVideo, VideoRef } from '../types';
import { loadBilibiliVideo, parseBilibiliUrl } from './bilibili';
import { loadYoutubeVideo, parseYoutubeUrl } from './youtube';

/** The video a page plays (B站 / YouTube video pages), or null. */
export function parseVideoUrl(href: string | URL): VideoRef | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  return parseBilibiliUrl(url) ?? parseYoutubeUrl(url);
}

export function loadVideo(ref: VideoRef): Promise<LoadedVideo> {
  return ref.site === 'bilibili' ? loadBilibiliVideo(ref) : loadYoutubeVideo(ref);
}
