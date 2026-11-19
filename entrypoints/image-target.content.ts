import { IMAGE_TARGET_RESOLVE, type ResolveMessage, type ResolveResponse } from '@/lib/image-target/messages';
import { resolveImages, type ClickTarget } from '@/lib/image-target/resolve';
import { onMessage } from '@/utils/messaging';

/**
 * Remembers where the user right-clicked so image actions (export, copy, save to 123pan) can find
 * images the browser itself doesn't recognize (CSS backgrounds, images under overlays, video covers).
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

    onMessage<ResolveMessage, ResolveResponse>(IMAGE_TARGET_RESOLVE, async ({ srcUrl }) => {
      try {
        return { candidates: await resolveImages(last, srcUrl) };
      } catch (err) {
        console.error('[image-target]', err);
        return { candidates: srcUrl ? [{ url: srcUrl }] : [] };
      }
    });
  },
});
