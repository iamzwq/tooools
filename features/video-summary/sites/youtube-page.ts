/*
 * Functions injected into YouTube's main world with `scripting.executeScript({ world: 'MAIN' })`.
 * They're serialized, so each must be self-contained (no imports or outer variables).
 */

export interface YoutubeCaptionTrack {
  baseUrl: string;
  languageCode: string;
  name: string;
  /** `asr` for auto-generated captions. */
  kind: string;
}

export interface YoutubePlayerData {
  videoId: string;
  title: string;
  author: string;
  lengthSeconds: number;
  description: string;
  isLive: boolean;
  /** `playabilityStatus.status`: OK, UNPLAYABLE, LOGIN_REQUIRED, ... */
  playability: string;
  /** Why the video can't be played, in the page's language. */
  playabilityReason: string;
  tracks: YoutubeCaptionTrack[];
}

/**
 * Reads the live player response. `window.ytInitialPlayerResponse` only describes the first page
 * load, so after in-app navigation the player object is the source of truth.
 */
export function readYoutubePlayerInPage(): YoutubePlayerData | null {
  const player = document.getElementById('movie_player') as (HTMLElement & { getPlayerResponse?: () => any }) | null;
  let response: any = null;
  try {
    response = player?.getPlayerResponse?.() ?? null;
  } catch {
    response = null;
  }
  response ??= (window as any).ytInitialPlayerResponse ?? null;
  if (!response) return null;
  const details = response.videoDetails ?? {};
  const playability = response.playabilityStatus ?? {};
  const textOf = (node: any): string => node?.simpleText ?? node?.runs?.map((r: any) => r.text).join('') ?? '';
  const tracks: any[] = response.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  return {
    videoId: String(details.videoId ?? ''),
    title: String(details.title ?? ''),
    author: String(details.author ?? ''),
    lengthSeconds: Number(details.lengthSeconds) || 0,
    description: String(details.shortDescription ?? ''),
    isLive: details.isLive === true,
    playability: String(playability.status ?? ''),
    playabilityReason: String(playability.reason || textOf(playability.errorScreen?.playerErrorMessageRenderer?.reason)),
    tracks: tracks.map((t) => ({
      baseUrl: String(t.baseUrl ?? ''),
      languageCode: String(t.languageCode ?? ''),
      name: textOf(t.name),
      kind: String(t.kind ?? ''),
    })),
  };
}

/**
 * YouTube only serves caption text when the request carries the player's proof-of-origin token
 * (`pot`). Finds it in a caption request the player already made; otherwise toggles the CC button
 * so the player makes one, then restores the user's caption setting. The player's first requests
 * often go out before its token is ready, so it's asked again until one carries the token.
 */
export function captureYoutubePotInPage(videoId: string): Promise<string | null> {
  /** The URL of a caption request for this video, if `name` is one. */
  const captionUrl = (name: string): URL | null => {
    if (!name.includes('/api/timedtext')) return null;
    try {
      const url = new URL(name);
      return url.searchParams.get('v') === videoId ? url : null;
    } catch {
      return null;
    }
  };
  const fromTimeline = (): string | null => {
    const entries = performance.getEntriesByType('resource');
    for (let i = entries.length - 1; i >= 0; i--) {
      const pot = captionUrl(entries[i]!.name)?.searchParams.get('pot');
      if (pot) return pot;
    }
    return null;
  };

  const existing = fromTimeline();
  if (existing) return Promise.resolve(existing);

  const button = document.querySelector<HTMLElement>('#movie_player .ytp-subtitles-button');
  if (!button || button.offsetParent === null || button.getAttribute('aria-disabled') === 'true') {
    return Promise.resolve(null);
  }
  const isOn = () => button.getAttribute('aria-pressed') === 'true';
  const wasOn = isOn();

  return new Promise((resolve) => {
    let settled = false;
    let sawRequestWithoutPot = false;
    let quietChecks = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    // Observers see every request, even when the page clears its resource timings. Requests that
    // toggling CC cuts short are reported too, URL (and token) included.
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const url = captionUrl(entry.name);
        if (!url) continue;
        const pot = url.searchParams.get('pot');
        if (pot) return finish(pot);
        sawRequestWithoutPot = true;
      }
    });
    function finish(pot: string | null) {
      if (settled) return;
      settled = true;
      observer.disconnect();
      timers.forEach(clearTimeout);
      if (isOn() !== wasOn) button!.click();
      resolve(pot);
    }
    /** Shows captions, turning them off and on again if they're on, so the player requests them. */
    function request() {
      if (settled) return;
      const on = isOn();
      button!.click();
      if (on) timers.push(setTimeout(() => !settled && !isOn() && button!.click(), 150));
    }
    observer.observe({ type: 'resource' });
    request();
    // Ask again after a request without the token, or if the player stays quiet for a while.
    for (let delay = 3000; delay < 20000; delay += 3000) {
      timers.push(
        setTimeout(() => {
          if (!sawRequestWithoutPot && ++quietChecks < 2) return;
          sawRequestWithoutPot = false;
          quietChecks = 0;
          request();
        }, delay),
      );
    }
    timers.push(setTimeout(() => finish(fromTimeline()), 20000));
  });
}
