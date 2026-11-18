import type { ImageCandidate } from '../messages';
import { youtube } from './youtube';

/** Site-specific rules that map what was right-clicked to the best (e.g. full-size cover) image. */
export interface SiteResolver {
  matches: (url: URL) => boolean;
  /**
   * @param stack elements under the cursor, topmost first (includes shadow DOM).
   * @returns candidates, best first; null to fall back to generic detection.
   */
  resolve: (stack: Element[]) => ImageCandidate[] | null;
}

/** Register new site rules here. */
export const siteResolvers: SiteResolver[] = [youtube];
