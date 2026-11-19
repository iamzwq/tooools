import { browser, type Browser } from 'wxt/browser';
import type { MenuContext } from '@/features/types';
import { buildFileName, extForMime, fetchImage, sanitizeFileName, sniffImageMime } from '@/lib/image';
import { IMAGE_TARGET_RESOLVE, type ImageCandidate, type ResolveMessage, type ResolveResponse } from './messages';

/**
 * Menu contexts for actions on "the image under the cursor". Not only "image": video thumbnails
 * are usually covered by links/overlays, so the browser reports "link" or "page" there and the
 * content script finds the image itself.
 */
export const IMAGE_CONTEXTS: [MenuContext, ...MenuContext[]] = ['image', 'video', 'link', 'page', 'frame'];

export interface LoadedImage {
  candidate: ImageCandidate;
  data: ArrayBuffer;
  /** Sniffed from the bytes, not the (often wrong) Content-Type. */
  mimeType: string;
}

async function resolveCandidates(info: Browser.contextMenus.OnClickData, tab?: Browser.tabs.Tab): Promise<ImageCandidate[]> {
  // For video, srcUrl is the video stream, not an image.
  const srcUrl = info.mediaType === 'image' ? info.srcUrl : undefined;
  let res: ResolveResponse | undefined;
  if (tab?.id != null) {
    try {
      const message: ResolveMessage = { type: IMAGE_TARGET_RESOLVE, srcUrl };
      res = (await browser.tabs.sendMessage(tab.id, message, { frameId: info.frameId ?? 0 })) as ResolveResponse | undefined;
    } catch {
      // Content script missing (tab opened before the extension was installed/updated).
    }
  }
  if (res?.candidates.length) return res.candidates;
  if (srcUrl) return [{ url: srcUrl }];
  throw new Error(res || tab?.id == null ? '此处未找到图片' : '此处未找到图片（如果页面在安装扩展前打开，请刷新后重试）');
}

/**
 * Finds the image that was right-clicked (CSS backgrounds, images under overlays, full-size video
 * covers, ...) and downloads the first candidate that is a real image; later candidates are fallbacks.
 */
export async function getImageAt(info: Browser.contextMenus.OnClickData, tab?: Browser.tabs.Tab): Promise<LoadedImage> {
  const candidates = await resolveCandidates(info, tab);
  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      const { data, mimeType } = await fetchImage(candidate.url, tab?.id, info.frameId);
      const sniffed = sniffImageMime(data, mimeType.startsWith('image/') ? mimeType : '');
      if (!sniffed) throw new Error('不是图片');
      return { candidate, data, mimeType: sniffed };
    } catch (err) {
      lastError = err;
    }
  }
  const reason = lastError instanceof Error ? `：${lastError.message}` : '';
  throw new Error(`图片下载失败${reason}`);
}

/** File name with extension for the image, e.g. a video title or the URL's file name. */
export function imageFileName(candidate: ImageCandidate, mimeType: string): string {
  const base = candidate.fileName && sanitizeFileName(candidate.fileName);
  return base ? `${base}.${extForMime(mimeType) ?? 'jpg'}` : buildFileName(candidate.url, mimeType);
}
