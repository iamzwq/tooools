import { browser, type Browser } from 'wxt/browser';
import type { Feature, FeatureContextMenu } from '@/features/types';
import { arrayBufferToDataUrl, extForMime, IMAGE_CLIPBOARD_UNSUPPORTED, replaceExtension } from '@/lib/image';
import { getImageAt, IMAGE_CONTEXTS, imageFileName, loadImage, type LoadedImage } from '@/lib/image-target';
import { onMessage } from '@/utils/messaging';
import { notify } from '@/utils/notify';
import { convertRaster, convertSvg, MIME_BY_FORMAT, type EncodeOptions } from './convert';
import {
  EXPORT_IMAGE_COPY,
  EXPORT_IMAGE_FEATURE_ID,
  EXPORT_IMAGE_RASTERIZE,
  type CopyImageMessage,
  type CopyImageResponse,
  type EncodeFormat,
  type ExportFormat,
  type RasterizeMessage,
  type RasterizeResponse,
} from './messages';
import { getExportImageSettings } from './settings';

const FORMATS: { id: ExportFormat; title: string }[] = [
  { id: 'original', title: '原格式' },
  { id: 'png', title: 'PNG' },
  { id: 'jpeg', title: 'JPG' },
  { id: 'webp', title: 'WebP' },
];

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
    const image = await getImageAt(info, tab);
    const blob = await convert(image, format, { quality: settings.quality, background: settings.jpegBackground });
    const filename = replaceExtension(imageFileName(image.candidate, image.mimeType), extForMime(blob.type) ?? 'png');
    await saveBlob(blob, filename, settings.saveAs);
  } catch (err) {
    // The user closing the "Save as" dialog is not an error.
    if (err instanceof Error && /cancel/i.test(err.message)) return;
    await notify('导出图片失败', err instanceof Error ? err.message : String(err));
    console.error('[export-image]', err);
  }
}

/**
 * Runs in the page, so it must be self-contained. Puts only PNG bytes on the clipboard (no HTML
 * `<img src>` pointing at the source site).
 */
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
async function writeImageToClipboard(image: LoadedImage, tabId: number, frameId: number): Promise<void> {
  const settings = await getExportImageSettings();
  // Browsers only accept PNG for clipboard images.
  const blob = await convert(image, 'png', { quality: settings.quality, background: settings.jpegBackground });
  const base64 = arrayBufferToDataUrl(await blob.arrayBuffer(), 'image/png').split(',')[1]!;

  // The clipboard needs a focused document: try the given frame, then the top frame.
  let error: string | null = 'unknown';
  for (const id of [...new Set([frameId, 0])]) {
    try {
      const [result] = await browser.scripting.executeScript({
        target: { tabId, frameIds: [id] },
        args: [base64],
        func: writePngToClipboard,
      });
      error = (result?.result as string | null | undefined) ?? null;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    if (!error || error === 'insecure') break;
  }
  if (error === 'insecure') throw new Error(IMAGE_CLIPBOARD_UNSUPPORTED);
  if (error) throw new Error(/focus/i.test(error) ? '页面未获得焦点，请先点击一下页面再试' : `写入剪贴板失败：${error}`);
}

async function copyImage(info: Browser.contextMenus.OnClickData, tab?: Browser.tabs.Tab): Promise<void> {
  try {
    if (tab?.id == null) throw new Error('找不到当前标签页');
    await writeImageToClipboard(await getImageAt(info, tab), tab.id, info.frameId ?? 0);
    await notify('已复制图片', '可以直接粘贴到网页编辑器、聊天软件等');
  } catch (err) {
    await notify('复制图片失败', err instanceof Error ? err.message : String(err));
    console.error('[export-image] copy', err);
  }
}

/** The hover 「复制」 button: the page already found the image, and shows the result on the button. */
async function copyFromHoverButton(
  { candidates }: CopyImageMessage,
  sender: Browser.runtime.MessageSender,
): Promise<CopyImageResponse> {
  try {
    const tabId = sender.tab?.id;
    if (tabId == null) throw new Error('找不到当前标签页');
    const frameId = sender.frameId ?? 0;
    await writeImageToClipboard(await loadImage(candidates, tabId, frameId), tabId, frameId);
    return { ok: true };
  } catch (err) {
    console.error('[export-image] hover copy', err);
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export const exportImageFeature: Feature = {
  id: EXPORT_IMAGE_FEATURE_ID,
  name: '导出 / 复制图片',
  description:
    '鼠标移到网页图片上点「复制」即可复制为纯图片，粘贴到国内网站编辑器不再「图片加载失败」；' +
    '也可右键图片、背景图或视频封面（YouTube 自动取最高清封面），按原格式 / PNG / JPG / WebP 导出或复制',
  setupBackground: () => {
    onMessage<CopyImageMessage, CopyImageResponse>(EXPORT_IMAGE_COPY, copyFromHoverButton);
  },
  contextMenus: [
    { id: 'export', title: '导出图片', contexts: IMAGE_CONTEXTS },
    ...FORMATS.map<FeatureContextMenu>((format) => ({
      id: format.id,
      parentId: 'export',
      title: format.title,
      contexts: IMAGE_CONTEXTS,
      onClick: (info, tab) => exportImage(format.id, info, tab),
    })),
    { id: 'copy', title: '复制图片（可粘贴到任意网站）', contexts: IMAGE_CONTEXTS, onClick: copyImage },
  ],
};
