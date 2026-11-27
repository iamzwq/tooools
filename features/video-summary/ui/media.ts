import { useEffect, useState } from 'react';

/** `<video>`, or B站's `<bwp-video>` custom element, which mirrors the media element API. */
type MediaLike = HTMLElement & Pick<HTMLMediaElement, 'currentTime' | 'duration' | 'paused' | 'play'>;

/** The page's main player: the largest video element. */
export function findMainVideo(): MediaLike | null {
  let best: MediaLike | null = null;
  let bestArea = 0;
  for (const el of document.querySelectorAll<MediaLike>('video, bwp-video')) {
    const rect = el.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area > bestArea) {
      best = el;
      bestArea = area;
    }
  }
  return best;
}

export function seekVideo(seconds: number): boolean {
  const video = findMainVideo();
  if (!video) return false;
  const max = Number.isFinite(video.duration) && video.duration > 0 ? video.duration - 0.5 : Infinity;
  video.currentTime = Math.max(0, Math.min(seconds, max));
  if (video.paused) void Promise.resolve(video.play()).catch(() => {});
  const rect = video.getBoundingClientRect();
  if (rect.bottom < 80 || rect.top > innerHeight - 80) video.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return true;
}

/** Playback position of the main video while `active`, updated a few times per second. */
export function useVideoTime(active: boolean): number {
  const [time, setTime] = useState(0);
  useEffect(() => {
    if (!active) return;
    const tick = () => {
      const video = findMainVideo();
      if (video) setTime(video.currentTime);
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [active]);
  return time;
}
