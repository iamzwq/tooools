import { browser, type Browser } from 'wxt/browser';
import type { Feature, FeatureContextMenu, MenuContext } from '@/features/types';
import {
  arrayBufferToDataUrl,
  buildFileName,
  extForMime,
  fetchImage,
  replaceExtension,
  sanitizeFileName,
  sniffImageMime,
} from '@/lib/image';
import { notify } from '@/utils/notify';
import { convertRaster, convertSvg, MIME_BY_FORMAT, type EncodeOptions } from './convert';
import {
  EXPORT_IMAGE_RASTERIZE,
  EXPORT_IMAGE_RESOLVE,
  type EncodeFormat,
  type ExportFormat,
  type ImageCandidate,
  type RasterizeMessage,
  type RasterizeResponse,
  type ResolveMessage,
  type ResolveResponse,
} from './messages';
import { getExportImageSettings } from './settings';

const FORMATS: { id: ExportFormat; title: string }[] = [
  { id: 'original', title: '原格式' },
  { id: 'png', title: 'PNG' },
  { id: 'jpeg', title: 'JPG' },
  { id: 'webp', title: 'WebP' },
];

// Not only "image": video thumbnails are usually covered by links/overlays, so the browser
// reports "link" or "page" there; the content script then finds the image under the cursor.
const CONTEXTS: [MenuContext, ...MenuContext[]] = ['image', 'video', 'link', 'page', 'frame'];

async function resolveCandidates(info: Browser.contextMenus.OnClickData, tab?: Browser.tabs.Tab): Promise<ImageCandidate[]> {
  // For video, srcUrl is the video stream, not an image.
  const srcUrl = info.mediaType === 'image' ? info.srcUrl : undefined;
  if (tab?.id != null) {
    try {
      const message: ResolveMessage = { type: EXPORT_IMAGE_RESOLVE, srcUrl };
      const res = (await browser.tabs.sendMessage(tab.id, message, { frameId: info.frameId ?? 0 })) as ResolveResponse | undefined;
      if (res?.candidates) return res.candidates;
    } catch {
      // Content script missing (tab opened before the extension was installed/updated).
    }
  }
  if (srcUrl) return [{ url: srcUrl }];
  throw new Error(tab?.id != null ? '此处未找到图片（如果页面在安装扩展前打开，请刷新后重试）' : '此处未找到图片');
}

interface LoadedImage {
  candidate: ImageCandidate;
  data: ArrayBuffer;
  mimeType: string;
}

/** Downloads the first candidate that is a real image (later candidates are smaller fallbacks). */
async function loadFirstImage(candidates: ImageCandidate[], tabId?: number, frameId?: number): Promise<LoadedImage> {
  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      const { data, mimeType } = await fetchImage(candidate.url, tabId, frameId);
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

let creatingOffscreen: Promise<void> | undefined;

async function ensureOffscreenDocument(): Promise<void> {
  const contexts = await browser.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT' as Browser.runtime.ContextType],
  });
  if (contexts.length) return;
  creatingOffscreen ??= browser.offscreen
    .createDocument({
      url: 'offscreen.html',
      reasons: ['BLOBS' as Browser.offscreen.Reason],
      justification: 'Rasterize SVG images when exporting them as PNG/JPG/WebP',
    })
    .finally(() => (creatingOffscreen = undefined));
  await creatingOffscreen;
}

/** SVG needs an <img> to decode: use the background page if there is a DOM (Firefox), else an offscreen document. */
async function rasterizeSvg(data: ArrayBuffer, format: EncodeFormat, options: EncodeOptions): Promise<Blob> {
  if (typeof document !== 'undefined') {
    const url = URL.createObjectURL(new Blob([data], { type: 'image/svg+xml' }));
    try {
      return await convertSvg(url, format, options);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  await ensureOffscreenDocument();
  const message: RasterizeMessage = {
    type: EXPORT_IMAGE_RASTERIZE,
    dataUrl: arrayBufferToDataUrl(data, 'image/svg+xml'),
    format,
    ...options,
  };
  const res = (await browser.runtime.sendMessage(message)) as RasterizeResponse | undefined;
  if (!res || 'error' in res) throw new Error(res?.error ?? '转换 SVG 失败');
  return (await fetch(res.dataUrl)).blob();
}

async function convert(image: LoadedImage, format: ExportFormat, options: EncodeOptions): Promise<Blob> {
  const original = new Blob([image.data], { type: image.mimeType });
  // Same format: keep the original bytes instead of re-encoding (no quality loss).
  if (format === 'original' || MIME_BY_FORMAT[format] === image.mimeType) return original;
  if (image.mimeType === 'image/svg+xml') return rasterizeSvg(image.data, format, options);
  return convertRaster(original, format, options);
}

function exportFileName(candidate: ImageCandidate, sourceMime: string, outputMime: string): string {
  const ext = extForMime(outputMime) ?? 'png';
  if (candidate.fileName) {
    const base = sanitizeFileName(candidate.fileName);
    if (base) return `${base}.${ext}`;
  }
  return replaceExtension(buildFileName(candidate.url, sourceMime), ext);
}

async function saveBlob(blob: Blob, filename: string, saveAs: boolean): Promise<void> {
  // Service workers (Chrome MV3) have no URL.createObjectURL; Firefox background pages do.
  const useBlobUrl = typeof URL.createObjectURL === 'function';
  const url = useBlobUrl ? URL.createObjectURL(blob) : arrayBufferToDataUrl(await blob.arrayBuffer(), blob.type);
  try {
    await browser.downloads.download({ url, filename, saveAs, conflictAction: 'uniquify' });
  } finally {
    if (useBlobUrl) setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

async function exportImage(format: ExportFormat, info: Browser.contextMenus.OnClickData, tab?: Browser.tabs.Tab): Promise<void> {
  try {
    const settings = await getExportImageSettings();
    const candidates = await resolveCandidates(info, tab);
    if (!candidates.length) throw new Error('此处未找到图片');
    const image = await loadFirstImage(candidates, tab?.id, info.frameId);
    const blob = await convert(image, format, { quality: settings.quality, background: settings.jpegBackground });
    const filename = exportFileName(image.candidate, image.mimeType, blob.type);
    await saveBlob(blob, filename, settings.saveAs);
  } catch (err) {
    // The user closing the "Save as" dialog is not an error.
    if (err instanceof Error && /cancel/i.test(err.message)) return;
    await notify('导出图片失败', err instanceof Error ? err.message : String(err));
    console.error('[export-image]', err);
  }
}

/** Runs in the page: puts only PNG bytes on the clipboard (no HTML `<img src>` pointing at the source site). */
async function writePngToClipboard(base64: string): Promise<string | null> {
  try {
    if (!window.isSecureContext || !navigator.clipboard?.write || typeof ClipboardItem === 'undefined') return 'insecure';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': new Blob([bytes], { type: 'image/png' }) })]);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

/**
 * The browser's own "Copy image" also puts `<img src="https://…">` on the clipboard, and many editors
 * paste that link instead of the bitmap. Links to Gemini/ChatGPT images need login, expire, or are
 * unreachable from mainland China, so the pasted image fails to load. Copying only the PNG makes
 * editors upload the image itself.
 */
async function copyImage(info: Browser.contextMenus.OnClickData, tab?: Browser.tabs.Tab): Promise<void> {
  try {
    if (tab?.id == null) throw new Error('找不到当前标签页');
    const settings = await getExportImageSettings();
    const candidates = await resolveCandidates(info, tab);
    if (!candidates.length) throw new Error('此处未找到图片');
    const image = await loadFirstImage(candidates, tab.id, info.frameId);
    // Browsers only accept PNG for clipboard images.
    const blob = await convert(image, 'png', { quality: settings.quality, background: settings.jpegBackground });
    const base64 = arrayBufferToDataUrl(await blob.arrayBuffer(), 'image/png').split(',')[1]!;

    // The clipboard needs a focused document: try the clicked frame, then the top frame.
    let error: string | null = 'unknown';
    for (const frameId of [...new Set([info.frameId ?? 0, 0])]) {
      try {
        const [result] = await browser.scripting.executeScript({
          target: { tabId: tab.id, frameIds: [frameId] },
          args: [base64],
          func: writePngToClipboard,
        });
        error = (result?.result as string | null | undefined) ?? null;
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
      if (!error || error === 'insecure') break;
    }
    if (error === 'insecure') throw new Error('非 HTTPS 页面不允许写入图片到剪贴板，请改用「导出图片」');
    if (error) throw new Error(/focus/i.test(error) ? '页面未获得焦点，请先点击一下页面再试' : `写入剪贴板失败：${error}`);
    await notify('已复制图片', '可以直接粘贴到网页编辑器、聊天软件等');
  } catch (err) {
    await notify('复制图片失败', err instanceof Error ? err.message : String(err));
    console.error('[export-image] copy', err);
  }
}

export const exportImageFeature: Feature = {
  id: 'export-image',
  name: '导出 / 复制图片',
  description:
    '右键网页图片、背景图或视频封面（YouTube 自动取最高清封面），按原格式 / PNG / JPG / WebP 导出；' +
    '或复制为纯图片，粘贴到国内网站编辑器不再「图片加载失败」',
  contextMenus: [
    { id: 'export', title: '导出图片', contexts: CONTEXTS },
    ...FORMATS.map<FeatureContextMenu>((format) => ({
      id: format.id,
      parentId: 'export',
      title: format.title,
      contexts: CONTEXTS,
      onClick: (info, tab) => exportImage(format.id, info, tab),
    })),
    { id: 'copy', title: '复制图片（可粘贴到任意网站）', contexts: CONTEXTS, onClick: copyImage },
  ],
};
