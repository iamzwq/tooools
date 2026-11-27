import { browser } from 'wxt/browser';
import { createPageVisibility, createRequestChannel, publishAssistantBridge } from '@/features/assistant/bridge';
import {
  ASSISTANT_FEATURE_ID,
  ASSISTANT_LOAD_UI,
  ASSISTANT_SHOW,
  ASSISTANT_STATUS,
  type AssistantPageStatus,
} from '@/features/assistant/messages';
import { assistantSettingsItem, getAssistantSettings } from '@/features/assistant/settings';
import { isSiteBlocked } from '@/features/assistant/sites';
import { VIDEO_SUMMARY_OPEN } from '@/features/video-summary/messages';
import type { PanelTab } from '@/features/video-summary/ui/SummaryPanel';
import { getFeatureEnabledMap, watchFeatureEnabled } from '@/utils/feature-settings';
import { onMessage } from '@/utils/messaging';

async function mascotWanted(): Promise<boolean> {
  const [enabled, settings] = await Promise.all([getFeatureEnabledMap(), getAssistantSettings()]);
  return enabled[ASSISTANT_FEATURE_ID] !== false && !isSiteBlocked(location.hostname, settings.blockedSites);
}

/** Has the background inject the `assistant-ui` script into this frame. */
async function requestUi(): Promise<boolean> {
  try {
    return (await browser.runtime.sendMessage({ type: ASSISTANT_LOAD_UI })) === true;
  } catch {
    // The extension was updated or reloaded, so this copy of the script can't reach it anymore.
    return false;
  }
}

/**
 * 小T on every page; on B站 / YouTube video pages it also summarizes the video. This script stays small:
 * it answers the popup and loads the UI (`assistant-ui`: React and styles) only where it's needed, so
 * sites where 小T is hidden pay for little more than a settings read.
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  async main(ctx) {
    // XML, SVG and other non-HTML documents.
    if (!(document.documentElement instanceof HTMLHtmlElement)) return;

    const visibility = createPageVisibility();
    const requests = createRequestChannel<PanelTab>();
    publishAssistantBridge({ ctx, visibility, requests });

    let loading: Promise<boolean> | null = null;
    const loadUi = (): Promise<boolean> => {
      loading ??= requestUi().then((loaded) => {
        if (!loaded) loading = null;
        return loaded;
      });
      return loading;
    };

    const stopHandling = [
      // Replying `true` tells the popup the panel is opening (no reply: this script isn't on the page).
      onMessage<{ type: typeof VIDEO_SUMMARY_OPEN; tab?: PanelTab }, boolean>(VIDEO_SUMMARY_OPEN, (message) => {
        requests.emit(message.tab ?? 'summary');
        return loadUi();
      }),
      onMessage<{ type: typeof ASSISTANT_STATUS }, AssistantPageStatus>(ASSISTANT_STATUS, () => ({ hidden: visibility.isHidden() })),
      onMessage<{ type: typeof ASSISTANT_SHOW }, true>(ASSISTANT_SHOW, async () => {
        visibility.setHidden(false);
        if ((await mascotWanted()) && ctx.isValid) void loadUi();
        return true as const;
      }),
    ];
    // A newer copy of this script (e.g. injected by the popup) takes over.
    ctx.onInvalidated(() => stopHandling.forEach((stop) => stop()));

    const wanted = await mascotWanted();
    if (ctx.isInvalid) return;
    if (wanted) {
      void loadUi();
      return;
    }
    // Hidden for now: load the UI once 小T is turned on or this site is removed from the blocklist.
    const recheck = () =>
      void mascotWanted().then((next) => {
        if (next && ctx.isValid) void loadUi();
      });
    const stopWatching = [watchFeatureEnabled(recheck), assistantSettingsItem.watch(recheck)];
    ctx.onInvalidated(() => stopWatching.forEach((stop) => stop()));
  },
});
