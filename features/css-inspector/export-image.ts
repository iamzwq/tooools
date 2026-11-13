import { domToBlob } from 'modern-screenshot';
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
  return domToBlob(el, {
    scale,
    type: 'image/png',
    timeout: 15_000,
    filter: (node) => node !== exclude,
    fetchFn: fetchImageViaBackground,
  });
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
