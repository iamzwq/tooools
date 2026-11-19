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
 * Downloads the image from the extension first (bypasses CORS via host permissions); falls back to
 * fetching inside the page only where that can help: blob: URLs, network errors and 401/403
 * (session-bound images). A 404 from the extension would be a 404 in the page too.
 */
export async function fetchImage(srcUrl: string, tabId?: number, frameId?: number): Promise<FetchedImage> {
  if (!srcUrl.startsWith('blob:')) {
    let res: Response | undefined;
    try {
      res = await fetch(srcUrl, { credentials: 'include' });
    } catch {
      // Network error: retry from the page.
    }
    if (res?.ok) return { data: await res.arrayBuffer(), mimeType: cleanMime(res.headers.get('content-type')) };
    if (res && (tabId == null || (res.status !== 401 && res.status !== 403))) {
      throw new Error(`无法下载图片: HTTP ${res.status}`);
    }
  }
  if (tabId == null) throw new Error('无法下载图片');

  const [result] = await browser.scripting.executeScript({
    target: { tabId, frameIds: [frameId ?? 0] },
    args: [srcUrl],
    // Runs in the page, so it must be self-contained (can't call blobToDataUrl).
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

/** Detects the real image type from magic bytes (servers often send wrong or generic types). */
export function sniffImageMime(data: ArrayBuffer, fallback = ''): string {
  const b = new Uint8Array(data, 0, Math.min(data.byteLength, 512));
  const ascii = (start: number, end: number) => String.fromCharCode(...b.subarray(start, end));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && ascii(1, 4) === 'PNG') return 'image/png';
  if (ascii(0, 4) === 'GIF8') return 'image/gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (ascii(4, 8) === 'ftyp' && /^avi[fs]$/.test(ascii(8, 12))) return 'image/avif';
  if (ascii(0, 2) === 'BM') return 'image/bmp';
  if (b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return 'image/x-icon';
  if (/<svg[\s>]/i.test(new TextDecoder().decode(b))) return 'image/svg+xml';
  return fallback;
}

export function extForMime(mimeType: string): string | undefined {
  return EXT_BY_MIME[mimeType];
}

/** Replaces (or adds) the file extension. */
export function replaceExtension(fileName: string, ext: string): string {
  return `${fileName.replace(/\.[a-z0-9]{2,5}$/i, '')}.${ext}`;
}

/** Strips characters that are invalid in file names on Windows/macOS/Linux and in chrome.downloads. */
export function sanitizeFileName(name: string, maxLength = 150): string {
  const cleaned = name.replace(/[\\/:*?"<>|~\x00-\x1f]/g, '_').replace(/\s+/g, ' ');
  // Truncate by code points so emoji aren't cut in half.
  return Array.from(cleaned).slice(0, maxLength).join('').replace(/^[\s.]+|[\s.]+$/g, '');
}

export const IMAGE_CLIPBOARD_UNSUPPORTED = '非 HTTPS 页面不允许写入图片到剪贴板，请改用「导出图片」';

export function arrayBufferToDataUrl(data: ArrayBuffer, mimeType: string): string {
  const bytes = new Uint8Array(data);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${mimeType || 'application/octet-stream'};base64,${btoa(binary)}`;
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Builds a safe file name from the image URL, with an extension matching the actual type. */
export function buildFileName(srcUrl: string, mimeType: string, now = new Date()): string {
  let base = '';
  if (/^https?:/i.test(srcUrl)) {
    try {
      base = decodeURIComponent(new URL(srcUrl).pathname.split('/').filter(Boolean).pop() ?? '');
    } catch {
      base = '';
    }
  }
  const mimeExt = EXT_BY_MIME[mimeType];
  const match = base.match(/\.([a-z0-9]{2,5})$/i);
  if (match) base = base.slice(0, -match[0].length);
  // Trust the URL's extension unless the real type says otherwise (e.g. `a.php` serving a JPEG).
  const ext = match?.[1] && (!mimeExt || sameExt(match[1], mimeExt)) ? match[1] : (mimeExt ?? 'jpg');
  base = sanitizeFileName(base) || `image_${now.toISOString().replace(/[-:T]/g, '').slice(0, 14)}`;
  return `${base}.${ext}`;
}

function sameExt(a: string, b: string): boolean {
  const norm = (e: string) => {
    const ext = e.toLowerCase();
    return ['jpeg', 'jpe', 'jfif', 'pjpeg', 'pjp'].includes(ext) ? 'jpg' : ext;
  };
  return norm(a) === norm(b);
}
