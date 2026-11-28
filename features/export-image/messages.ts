import type { ImageCandidate } from '@/lib/image-target/messages';

export const EXPORT_IMAGE_FEATURE_ID = 'export-image';
export const EXPORT_IMAGE_RASTERIZE = 'export-image:rasterize';
export const EXPORT_IMAGE_COPY = 'export-image:copy';

export type ExportFormat = 'original' | 'png' | 'jpeg' | 'webp';
export type EncodeFormat = Exclude<ExportFormat, 'original'>;

/** Background -> offscreen document: rasterize an SVG (service workers can't decode SVG). */
export interface RasterizeMessage {
  type: typeof EXPORT_IMAGE_RASTERIZE;
  dataUrl: string;
  format: EncodeFormat;
  quality: number;
  background: string;
}

export type RasterizeResponse = { dataUrl: string } | { error: string };

/** Hover button (content script) -> background: copy the first loadable candidate to the clipboard as PNG. */
export interface CopyImageMessage {
  type: typeof EXPORT_IMAGE_COPY;
  candidates: ImageCandidate[];
}

export type CopyImageResponse = { ok: true } | { error: string };
