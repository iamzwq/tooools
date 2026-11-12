import { browser } from 'wxt/browser';

export interface FetchedImage {
  data: ArrayBuffer;
  mimeType: string;
}

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/pjpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'image/tiff': 'tiff',
};

/**
 * Downloads the image from the extension first (bypasses CORS via host permissions);
 * falls back to fetching inside the page, which handles blob: URLs and session-bound images.
 */
export async function fetchImage(srcUrl: string, tabId?: number, frameId?: number): Promise<FetchedImage> {
  if (!srcUrl.startsWith('blob:')) {
    try {
      const res = await fetch(srcUrl, { credentials: 'include' });
      if (res.ok) {
        return { data: await res.arrayBuffer(), mimeType: cleanMime(res.headers.get('content-type')) };
      }
    } catch {
      // fall through to page-context fetch
    }
  }
  if (tabId == null) throw new Error('无法下载图片');

  const [result] = await browser.scripting.executeScript({
    target: { tabId, frameIds: [frameId ?? 0] },
    args: [srcUrl],
    func: async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) return { error: `HTTP ${res.status}` };
      const blob = await res.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      return { dataUrl };
    },
  });
  const value = result?.result as { dataUrl?: string; error?: string } | undefined;
  if (!value?.dataUrl) throw new Error(`无法下载图片${value?.error ? `: ${value.error}` : ''}`);
  const res = await fetch(value.dataUrl);
  return { data: await res.arrayBuffer(), mimeType: cleanMime(res.headers.get('content-type')) };
}

function cleanMime(contentType: string | null): string {
  return (contentType ?? '').split(';')[0]!.trim().toLowerCase();
}

/** Builds a safe file name from the image URL, making sure it has a matching extension. */
export function buildFileName(srcUrl: string, mimeType: string, now = new Date()): string {
  let base = '';
  if (/^https?:/i.test(srcUrl)) {
    try {
      const segment = new URL(srcUrl).pathname.split('/').filter(Boolean).pop() ?? '';
      base = decodeURIComponent(segment);
    } catch {
      base = '';
    }
  }
  base = base.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim();

  const mimeExt = EXT_BY_MIME[mimeType];
  const match = base.match(/\.([a-z0-9]{2,5})$/i);
  if (!base) {
    const stamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
    base = `image_${stamp}`;
  } else if (match?.[1] && mimeExt && !sameExt(match[1], mimeExt)) {
    base = base.slice(0, -match[0].length);
  }
  if (!/\.[a-z0-9]{2,5}$/i.test(base)) base += `.${mimeExt ?? 'jpg'}`;
  return base.slice(-200);
}

function sameExt(a: string, b: string): boolean {
  const norm = (e: string) => {
    const ext = e.toLowerCase();
    return ['jpeg', 'jpe', 'jfif', 'pjpeg', 'pjp'].includes(ext) ? 'jpg' : ext;
  };
  return norm(a) === norm(b);
}
