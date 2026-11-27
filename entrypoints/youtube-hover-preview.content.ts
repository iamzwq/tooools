import { youtubeHoverPreview } from '@/features/youtube-hover-preview';
import { blockHoverPreview } from '@/features/youtube-hover-preview/block';
import { getFeatureEnabledMap, isFeatureEnabled, watchFeatureEnabled } from '@/utils/feature-settings';

/** Keeps YouTube from auto-playing videos when hovering their thumbnails. */
export default defineContentScript({
  matches: ['*://www.youtube.com/*'],
  // Listeners must be registered before YouTube's own.
  runAt: 'document_start',
  main(ctx) {
    const blocker = blockHoverPreview(ctx);
    const sync = async () => {
      const enabled = isFeatureEnabled(youtubeHoverPreview, await getFeatureEnabledMap());
      if (ctx.isValid) blocker.setActive(enabled);
    };
    void sync();
    ctx.onInvalidated(watchFeatureEnabled(() => void sync()));
  },
});
