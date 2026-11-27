import { useLayoutEffect, useState } from 'react';

function luminanceOf(color: string): number | null {
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (!m?.[1]) return null;
  const [r = 0, g = 0, b = 0, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  if (a < 0.5) return null;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Follows the site's own theme (YouTube's `html[dark]`, otherwise the page background). */
function detectHostDark(): boolean {
  const html = document.documentElement;
  if (html.hasAttribute('dark')) return true;
  for (const el of [document.body, html]) {
    if (!el) continue;
    const luminance = luminanceOf(getComputedStyle(el).backgroundColor);
    if (luminance !== null) return luminance < 0.4;
  }
  return matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * The site's theme, followed only while `active` (some UI is showing): 小T runs on every page and
 * shouldn't keep watching the page while it's just sitting at the edge.
 */
export function useHostDark(active: boolean): boolean {
  const [dark, setDark] = useState(detectHostDark);
  // Before paint, so a menu never flashes in the wrong theme.
  useLayoutEffect(() => {
    if (!active) return;
    const update = () => setDark(detectHostDark());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'dark', 'style', 'data-theme'] });
    if (document.body) observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
    const media = matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', update);
    // Some sites switch themes by swapping stylesheets, which no attribute change reveals.
    const id = setInterval(update, 3000);
    return () => {
      observer.disconnect();
      media.removeEventListener('change', update);
      clearInterval(id);
    };
  }, [active]);
  return dark;
}
