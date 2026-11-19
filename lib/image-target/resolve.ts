import { blobToDataUrl } from '@/lib/image';
import type { ImageCandidate } from './messages';
import { siteResolvers } from './sites';

const CSS_URL_RE = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi;
/** Elements smaller than this fraction of the biggest image under the cursor are treated as overlays/icons. */
const MIN_AREA_RATIO = 0.25;

interface Found {
  urls: string[];
  area: number;
  /** Page-level background (html/body): only used when nothing else is under the cursor. */
  backdrop: boolean;
}

function absUrl(url: string): string | null {
  try {
    const u = new URL(url, document.baseURI);
    return /^(https?|data|blob):$/.test(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}

/** Parses a srcset into URLs ordered from largest to smallest. */
export function srcsetUrls(srcset: string): string[] {
  return (
    srcset
      // Candidates are separated by commas; minified HTML omits the space after them. A comma
      // inside a URL (e.g. `w_400,h_200`) is neither after a descriptor nor followed by a space.
      .split(/(?<=\s\d+(?:\.\d+)?[wx])\s*,\s*|,\s+/)
      .map((part) => {
        const [url = '', descriptor = '1x'] = part.trim().split(/\s+/);
        const n = parseFloat(descriptor);
        // Treat "w" and "x" descriptors on comparable scales; a srcset uses only one kind.
        return { url, size: Number.isFinite(n) ? n : 1 };
      })
      .filter((c) => c.url)
      .sort((a, b) => b.size - a.size)
      .map((c) => c.url)
  );
}

function imgUrls(img: HTMLImageElement): string[] {
  const urls: string[] = [];
  const picture = img.parentElement instanceof HTMLPictureElement ? img.parentElement : null;
  const current = img.currentSrc;
  // Within <picture>, only upgrade within the source that is actually used (others may be art-directed crops).
  const source = picture
    ? [...picture.querySelectorAll('source')].find((s) => srcsetUrls(s.srcset).some((u) => absUrl(u) === current))
    : null;
  if (source) urls.push(...srcsetUrls(source.srcset));
  else if (img.srcset && (!current || srcsetUrls(img.srcset).some((u) => absUrl(u) === current))) urls.push(...srcsetUrls(img.srcset));
  urls.push(current, img.src);
  return urls;
}

function cssUrls(el: Element, pseudo?: string): string[] {
  const style = getComputedStyle(el, pseudo);
  const urls: string[] = [];
  for (const value of [style.backgroundImage, pseudo ? style.content : '']) {
    if (!value || value === 'none') continue;
    for (const m of value.matchAll(CSS_URL_RE)) urls.push(m[1] ?? m[2] ?? m[3] ?? '');
  }
  return urls;
}

function svgDataUrl(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const { width, height } = svg.getBoundingClientRect();
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  if (!clone.getAttribute('width')) clone.setAttribute('width', String(Math.round(width)));
  if (!clone.getAttribute('height')) clone.setAttribute('height', String(Math.round(height)));
  // Icons usually draw with currentColor/inherited fill, which is lost outside the page.
  const style = getComputedStyle(svg);
  clone.style.color = style.color;
  if (!clone.getAttribute('fill')) clone.setAttribute('fill', style.fill);
  const xml = new XMLSerializer().serializeToString(clone);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
}

function parseElement(el: Element): string[] {
  const urls: string[] = [];
  if (el instanceof HTMLImageElement) urls.push(...imgUrls(el));
  else if (el instanceof HTMLVideoElement) urls.push(el.poster);
  else if (el instanceof HTMLInputElement && el.type === 'image') urls.push(el.src);
  else if (el instanceof SVGImageElement) urls.push(el.href.baseVal);
  else if (el instanceof SVGSVGElement) urls.push(svgDataUrl(el));
  else if (el instanceof HTMLCanvasElement) {
    try {
      urls.push(el.toDataURL('image/png'));
    } catch {
      // Tainted by cross-origin content.
    }
  }
  urls.push(...cssUrls(el));
  if (!(el instanceof HTMLImageElement || el instanceof HTMLVideoElement)) {
    urls.push(...cssUrls(el, '::before'), ...cssUrls(el, '::after'));
  }
  return urls;
}

/** Elements under the point, topmost first, descending into open shadow roots. */
function elementsAt(root: Document | ShadowRoot, x: number, y: number, seen = new Set<Element>()): Element[] {
  const result: Element[] = [];
  for (const el of root.elementsFromPoint(x, y)) {
    if (seen.has(el)) continue;
    seen.add(el);
    if (el.shadowRoot && el.shadowRoot !== root) result.push(...elementsAt(el.shadowRoot, x, y, seen));
    result.push(el);
  }
  return result;
}

/** `elementsFromPoint` skips `pointer-events: none`; find those by geometry instead. */
function elementsContaining(root: Document | ShadowRoot, x: number, y: number, out: Element[] = []): Element[] {
  for (const el of root.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) out.push(el);
    if (el.shadowRoot) elementsContaining(el.shadowRoot, x, y, out);
  }
  // Later in document order ≈ painted on top.
  return out.reverse();
}

function area(el: Element): number {
  const r = el.getBoundingClientRect();
  return r.width * r.height;
}

function collect(stack: Element[]): Found[] {
  const found: Found[] = [];
  for (const el of stack) {
    const urls = parseElement(el)
      .map((u) => absUrl(u))
      .filter((u): u is string => !!u);
    if (urls.length) {
      found.push({ urls, area: area(el), backdrop: el === document.documentElement || el === document.body });
    }
  }
  return found;
}

/**
 * Orders images: the topmost one wins unless it is much smaller than the biggest one under the
 * cursor (e.g. a play-button icon over a thumbnail). Page backgrounds come last.
 */
function rank(found: Found[]): string[] {
  const content = found.filter((f) => !f.backdrop);
  const maxArea = Math.max(0, ...content.map((f) => f.area));
  const big = content.filter((f) => f.area >= maxArea * MIN_AREA_RATIO);
  const small = content.filter((f) => f.area < maxArea * MIN_AREA_RATIO);
  return [...big, ...small, ...found.filter((f) => f.backdrop)].flatMap((f) => f.urls);
}

async function readBlobUrl(url: string): Promise<string | null> {
  try {
    return await blobToDataUrl(await (await fetch(url)).blob());
  } catch {
    return null;
  }
}

export interface ClickTarget {
  x: number;
  y: number;
  target: Element | null;
}

/** Finds image candidates for what was right-clicked, best first. */
export async function resolveImages(click: ClickTarget | null, srcUrl?: string): Promise<ImageCandidate[]> {
  let stack: Element[] = [];
  if (click) {
    stack = elementsAt(document, click.x, click.y);
    if (click.target?.isConnected && !stack.includes(click.target)) stack.unshift(click.target);
  }

  const page = new URL(location.href);
  for (const site of siteResolvers) {
    if (!site.matches(page)) continue;
    const result = site.resolve(stack);
    if (result?.length) return result;
  }

  let urls: string[] = [];
  // The browser already identified the image: prefer the largest variant of that element.
  const srcEl = srcUrl
    ? stack.find((el) => el instanceof HTMLImageElement && (el.currentSrc === srcUrl || el.src === srcUrl))
    : undefined;
  if (srcEl) urls.push(...(collect([srcEl])[0]?.urls ?? []));
  if (srcUrl) urls.push(srcUrl);

  if (click) {
    let found = collect(stack);
    if (!found.length) found = collect(elementsContaining(document, click.x, click.y));
    urls.push(...rank(found));
  }

  const candidates: ImageCandidate[] = [];
  for (const url of new Set(urls.map((u) => absUrl(u)).filter((u): u is string => !!u))) {
    // Blob URLs are only readable inside the page.
    const resolved = url.startsWith('blob:') ? await readBlobUrl(url) : url;
    if (resolved) candidates.push({ url: resolved });
  }
  return candidates;
}
