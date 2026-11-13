import { domToCanvas } from 'modern-screenshot';
import { browser } from 'wxt/browser';
import { CSS_INSPECTOR_FETCH_IMAGE, type FetchImageMessage } from './messages';

// Stay well inside browser canvas limits (max side ~32k, max area ~268M px).
const MAX_SIDE = 16384;
const MAX_AREA = 100_000_000;

/** Cross-origin images would taint/fail in the page; the background has host permissions. */
async function fetchImageViaBackground(url: string): Promise<string | false> {
  if (!/^https?:/i.test(url)) return false;
  try {
    const message: FetchImageMessage = { type: CSS_INSPECTOR_FETCH_IMAGE, url };
    const dataUrl = (await browser.runtime.sendMessage(message)) as string | null;
    return dataUrl || false;
  } catch {
    return false;
  }
}

export function imageFileName(label: string, now = new Date()): string {
  const base = label.replace(/[^\w.#-]+/g, '_').replace(/#/g, '_').slice(0, 60) || 'element';
  const stamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  return `${base}-${stamp}.png`;
}

/** Renders the element to a PNG blob, scaled for sharpness but within canvas limits. */
async function renderElementPng(el: Element, exclude: Node): Promise<Blob> {
  const { width, height } = el.getBoundingClientRect();
  if (width < 1 || height < 1) throw new Error('元素没有可见尺寸');
  const scale = Math.min(
    Math.max(2, devicePixelRatio || 1),
    MAX_SIDE / width,
    MAX_SIDE / height,
    Math.sqrt(MAX_AREA / (width * height)),
  );
  // Not using the library's `backgroundColor` option: it also forces `background-color` onto the
  // element itself, which would wipe out the element's own background.
  const rendered = await domToCanvas(el, {
    scale,
    timeout: 15_000,
    filter: (node) => node !== exclude,
    fetchFn: fetchImageViaBackground,
  });

  const out = document.createElement('canvas');
  out.width = rendered.width;
  out.height = rendered.height;
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = backdropColor(el);
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(rendered, 0, 0);
  return new Promise((resolve, reject) =>
    out.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('生成图片失败'))), 'image/png'),
  );
}

type Rgba = [r: number, g: number, b: number, a: number];

let probe: CanvasRenderingContext2D | null = null;

/** Parses any CSS color (rgb, oklch, color(), ...) by painting it on a 1×1 canvas. */
function toRgba(color: string): Rgba {
  probe ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = '#000';
  probe.fillStyle = color;
  probe.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0, a = 0] = probe.getImageData(0, 0, 1, 1).data;
  return [r, g, b, a / 255];
}

function parentOf(el: Element): Element | null {
  if (el.parentElement) return el.parentElement;
  const root = el.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

/** The browser's default canvas: white, or dark when the page opts into a dark color scheme. */
function canvasColor(): Rgba {
  const scheme = getComputedStyle(document.documentElement).colorScheme;
  const dark = scheme.includes('dark') && (!scheme.includes('light') || matchMedia('(prefers-color-scheme: dark)').matches);
  return dark ? [18, 18, 18, 1] : [255, 255, 255, 1];
}

/**
 * The solid color the element visually sits on: ancestors' background colors composited
 * (handles semi-transparent layers) down to the first opaque one, or the page canvas.
 */
export function backdropColor(el: Element): string {
  const layers: Rgba[] = [];
  let base: Rgba | null = null;
  for (let node = parentOf(el); node; node = parentOf(node)) {
    const color = toRgba(getComputedStyle(node).backgroundColor);
    if (color[3] >= 1) {
      base = color;
      break;
    }
    if (color[3] > 0) layers.push(color);
  }
  let [r, g, b] = base ?? canvasColor();
  for (const [lr, lg, lb, la] of layers.reverse()) {
    r = lr * la + r * (1 - la);
    g = lg * la + g * (1 - la);
    b = lb * la + b * (1 - la);
  }
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

/** Renders the element to a PNG and downloads it. */
export async function exportElementImage(el: Element, exclude: Node, fileName: string): Promise<void> {
  const blob = await renderElementPng(el, exclude);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/**
 * Renders the element to a PNG and puts it on the clipboard.
 * Must be called synchronously from a click handler: the blob is passed to ClipboardItem as a
 * promise so the user activation is not lost while rendering.
 */
export function copyElementImage(el: Element, exclude: Node): Promise<void> {
  if (!window.isSecureContext || !navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    return Promise.reject(new Error('非 HTTPS 页面不允许写入图片到剪贴板，请改用「导出图片」'));
  }
  return navigator.clipboard.write([new ClipboardItem({ 'image/png': renderElementPng(el, exclude) })]);
}
