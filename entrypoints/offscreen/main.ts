import { browser } from 'wxt/browser';
import { convertSvg } from '@/features/export-image/convert';
import { EXPORT_IMAGE_RASTERIZE, type RasterizeMessage, type RasterizeResponse } from '@/features/export-image/messages';

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  const msg = message as Partial<RasterizeMessage> | null;
  if (msg?.type !== EXPORT_IMAGE_RASTERIZE || !msg.dataUrl || !msg.format) return;
  convertSvg(msg.dataUrl, msg.format, { quality: msg.quality ?? 92, background: msg.background ?? '#ffffff' })
    .then(blobToDataUrl)
    .then(
      (dataUrl) => sendResponse({ dataUrl } satisfies RasterizeResponse),
      (err) => sendResponse({ error: err instanceof Error ? err.message : String(err) } satisfies RasterizeResponse),
    );
  return true;
});
