import type { ContentScriptContext } from 'wxt/utils/content-script-context';

/** Hovering these starts YouTube's inline preview (feeds, search, channel pages, watch-page sidebar). */
const HOVER_TRIGGER = [
  'ytd-thumbnail',
  'ytd-playlist-thumbnail',
  'yt-thumbnail-view-model',
  'yt-collection-thumbnail-view-model',
  '.yt-lockup-view-model__content-image',
].join(',');

/**
 * Where a preview <video> can live: the floating preview player and the video cards. The real watch,
 * Shorts and channel-trailer players are never inside these, so normal playback is left alone.
 */
const PREVIEW_ROOT = [
  'ytd-video-preview',
  'ytd-thumbnail',
  'yt-thumbnail-view-model',
  'ytd-rich-item-renderer',
  'ytd-video-renderer',
  'ytd-grid-video-renderer',
  'ytd-compact-video-renderer',
  'yt-lockup-view-model',
].join(',');

// Only "hover started" events: move events stay untouched so 小T and the element pickers keep working.
const HOVER_EVENTS = ['mouseover', 'mouseenter', 'pointerover', 'pointerenter'] as const;

const STYLE = `
ytd-video-preview,
ytd-moving-thumbnail-renderer {
  display: none !important;
}
:is(${PREVIEW_ROOT}) video {
  visibility: hidden !important;
}
`;

/**
 * Stops YouTube from playing videos when hovering their thumbnails. Hover events are swallowed before
 * YouTube sees them; any preview that still starts (markup YouTube renamed) is hidden, muted and paused.
 * Listeners go on `window` in the capture phase, so run this at `document_start` to get ahead of YouTube's.
 */
export function blockHoverPreview(ctx: ContentScriptContext) {
  let active = false;
  let style: HTMLStyleElement | null = null;

  const onHover = (event: Event) => {
    if (!active || (event as MouseEvent).buttons) return;
    const target = event.target;
    if (target instanceof Element && target.closest(HOVER_TRIGGER)) event.stopImmediatePropagation();
  };

  // Media events don't bubble, but they still pass through `window` in the capture phase.
  const onPlay = (event: Event) => {
    if (!active) return;
    const video = event.target;
    if (!(video instanceof HTMLVideoElement) || !video.closest(PREVIEW_ROOT)) return;
    video.muted = true;
    video.pause();
  };

  for (const type of HOVER_EVENTS) ctx.addEventListener(window, type, onHover, { capture: true });
  for (const type of ['play', 'playing'] as const) ctx.addEventListener(window, type, onPlay, { capture: true });

  const setActive = (next: boolean) => {
    active = next;
    if (next) {
      style ??= Object.assign(document.createElement('style'), { textContent: STYLE });
      if (!style.isConnected) (document.head ?? document.documentElement).append(style);
    } else {
      style?.remove();
    }
  };
  ctx.onInvalidated(() => setActive(false));

  return { setActive };
}
