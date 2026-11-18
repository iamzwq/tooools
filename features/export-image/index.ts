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

export const exportImageFeature: Feature = {
  id: 'export-image',
  name: '导出图片',
  description: '右键网页图片、背景图或视频封面（YouTube 自动取最高清封面），按原格式 / PNG / JPG / WebP 导出',
  contextMenus: [
    { id: 'export', title: '导出图片', contexts: CONTEXTS },
    ...FORMATS.map<FeatureContextMenu>((format) => ({
      id: format.id,
      parentId: 'export',
      title: format.title,
      contexts: CONTEXTS,
      onClick: (info, tab) => exportImage(format.id, info, tab),
    })),
  ],
};
