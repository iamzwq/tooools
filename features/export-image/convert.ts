import type { EncodeFormat } from './messages';

export const MIME_BY_FORMAT: Record<EncodeFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

export interface EncodeOptions {
  /** 1–100 */
  quality: number;
  /** Fill for transparent pixels in formats without alpha (JPG). */
  background: string;
}

/** Vector images have no fixed resolution; render small icons at a useful size. */
const SVG_MIN_SIDE = 1024;
const MAX_SIDE = 16384;

/** Draws the image on an OffscreenCanvas and encodes it (works in service workers and documents). */
export async function encodeImage(
  source: CanvasImageSource,
  width: number,
  height: number,
  format: EncodeFormat,
  options: EncodeOptions,
): Promise<Blob> {
  if (!width || !height) throw new Error('图片尺寸无效');
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  if (format === 'jpeg') {
    ctx.fillStyle = options.background;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(source, 0, 0, width, height);
  const type = MIME_BY_FORMAT[format];
  const blob = await canvas.convertToBlob({ type, quality: format === 'png' ? undefined : options.quality / 100 });
  // Unsupported encoders silently fall back to PNG.
  if (blob.type !== type) throw new Error(`当前浏览器不支持导出为 ${format.toUpperCase()}`);
  return blob;
}

/** Decodes a raster image (not SVG) without a DOM, e.g. in a service worker. */
export async function convertRaster(data: Blob, format: EncodeFormat, options: EncodeOptions): Promise<Blob> {
  const bitmap = await createImageBitmap(data).catch(() => {
    throw new Error('无法解码图片');
  });
  try {
    return await encodeImage(bitmap, bitmap.width, bitmap.height, format, options);
  } finally {
    bitmap.close();
  }
}

/** Rasterizes an SVG via an <img> element; requires a DOM (offscreen document or background page). */
export async function convertSvg(svgUrl: string, format: EncodeFormat, options: EncodeOptions): Promise<Blob> {
  const img = new Image();
  img.src = svgUrl;
  await img.decode().catch(() => {
    throw new Error('无法解码 SVG 图片');
  });
  let width = img.naturalWidth || 300;
  let height = img.naturalHeight || 150;
  const scale = Math.min(Math.max(1, SVG_MIN_SIDE / Math.max(width, height)), MAX_SIDE / Math.max(width, height));
  width = Math.round(width * scale);
  height = Math.round(height * scale);
  return encodeImage(img, width, height, format, options);
}
