import { browser } from 'wxt/browser';
import { EXPORT_IMAGE_RESOLVE, type ResolveMessage, type ResolveResponse } from '@/features/export-image/messages';
import { resolveImages, type ClickTarget } from '@/features/export-image/resolve';

/**
 * Remembers where the user right-clicked so「导出图片」can find images the browser itself
 * doesn't recognize (CSS backgrounds, images under overlays, video covers).
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  runAt: 'document_start',
  main() {
    let last: ClickTarget | null = null;

    window.addEventListener(
      'contextmenu',
      (e) => {
        const target = e.composedPath()[0];
        last = { x: e.clientX, y: e.clientY, target: target instanceof Element ? target : null };
      },
      { capture: true },
    );

    browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
      const msg = message as Partial<ResolveMessage> | null;
      if (msg?.type !== EXPORT_IMAGE_RESOLVE) return;
      resolveImages(last, msg.srcUrl).then(
        (candidates) => sendResponse({ candidates } satisfies ResolveResponse),
        (err) => {
          console.error('[export-image]', err);
          sendResponse({ candidates: msg.srcUrl ? [{ url: msg.srcUrl }] : [] } satisfies ResolveResponse);
        },
      );
      return true;
    });
  },
});
