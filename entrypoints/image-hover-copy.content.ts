import { HOVER_COPY_MIN_SIZE, createHoverCopyButton } from '@/features/export-image/hover-copy';
import { EXPORT_IMAGE_FEATURE_ID } from '@/features/export-image/messages';
import { exportImageSettingsItem, getExportImageSettings } from '@/features/export-image/settings';
import { isSiteBlocked } from '@/lib/sites';
import { getFeatureEnabledMap, watchFeatureEnabled } from '@/utils/feature-settings';

/** The 「复制」 button on images under the mouse (top frame only; the right-click menu covers frames). */
export default defineContentScript({
  matches: ['<all_urls>'],
  main(ctx) {
    // XML/SVG documents; pages where the clipboard can't take images; windows too small for the button.
    if (!(document.documentElement instanceof HTMLHtmlElement) || !window.isSecureContext) return;
    if (innerWidth < HOVER_COPY_MIN_SIZE || innerHeight < HOVER_COPY_MIN_SIZE) return;

    const button = createHoverCopyButton(ctx);
    const sync = async () => {
      const [enabled, settings] = await Promise.all([getFeatureEnabledMap(), getExportImageSettings()]);
      if (ctx.isInvalid) return;
      button.setActive(
        enabled[EXPORT_IMAGE_FEATURE_ID] !== false &&
          settings.hoverCopy &&
          !isSiteBlocked(location.hostname, settings.hoverCopyBlockedSites),
      );
    };
    void sync();
    ctx.onInvalidated(watchFeatureEnabled(() => void sync()));
    ctx.onInvalidated(exportImageSettingsItem.watch(() => void sync()));
  },
});
